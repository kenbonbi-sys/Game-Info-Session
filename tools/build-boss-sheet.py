# -*- coding: utf-8 -*-
"""Dung assets/source/boss-smoke.png tu ban ve goc boss-smoke-raw.webp.

Chay: python tools/build-boss-sheet.py

Anh goc do may sinh ra: 21 hinh xep 7x3 nhung khong nam tren mot luoi chinh xac, va moi
hinh mot be ngang khac nhau (co frame co set sang mot ben, co frame phun lua xuong duoi).
Cat thang theo width/7 la xen mat set cua frame nay va dinh sang o ben canh.

Nen script do lay luoi that tu "dau khoi" — khoi mau toi dac, thu duy nhat co mat o ca 21
frame va khong doi cho khi set hay lua bung ra. Tim tam dau khoi cua tung frame, dung mot o
chung du rong cho frame ngoai co nhat, roi dat tung frame vao o sao cho dau khoi nam dung mot
cho. Nho vay loadGridSheet cat ra 21 frame khop nhau, boss khong giat khi doi frame.

Ra: sheet 7x3, o 206x168, giam con 256 mau nhu cac sheet khac (xem tools/optimize-assets.py).
"""
import os
import sys

from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'source', 'boss-smoke-raw.webp')
OUT = os.path.join(ROOT, 'assets', 'source', 'boss-smoke.png')

COLS, ROWS = 7, 3
# Chieu cao o sau khi thu nho. Boss ve tren san 1920x1080 cao 200 px, giu o 168 nhu sheet cu
# la ti le phong to y het truoc, khong doi do net.
CELL_H = 168
# Bui alpha rat mo rai khap anh: tinh vao thi o phai nong them ~40 px moi ben, boss be di
# ma khong them gi nhin thay duoc.
DUST = 8


def bands(mask, minlen):
    """Cac doan lien tiep True dai it nhat minlen."""
    out, start = [], None
    for i, on in enumerate(mask):
        if on and start is None:
            start = i
        elif not on and start is not None:
            if i - start >= minlen:
                out.append((start, i - 1))
            start = None
    if start is not None and len(mask) - start >= minlen:
        out.append((start, len(mask) - 1))
    return out


def head_grid(arr):
    """Tam dau khoi cua 21 frame: (danh sach x theo cot, danh sach y theo hang)."""
    r, g, b, a = (arr[..., i].astype(int) for i in range(4))
    dark = (a > 160) & (r < 95) & (g < 95) & (b < 115)
    rb = bands(dark.any(axis=1), 40)
    if len(rb) != ROWS:
        sys.exit(f'Tim thay {len(rb)} hang dau khoi, can {ROWS}. Ban ve goc doi layout roi?')
    ys, xs_per_row = [], []
    for top, bottom in rb:
        ys.append((top + bottom) / 2)
        cb = bands(dark[top:bottom + 1].any(axis=0), 40)
        if len(cb) != COLS:
            sys.exit(f'Hang {top}-{bottom} co {len(cb)} cot, can {COLS}.')
        xs_per_row.append([(l + r2) / 2 for l, r2 in cb])
    # Trung binh theo cot: tung frame lech vai pixel la chuyen dong cua chinh no, giu nguyen.
    xs = [sum(row[c] for row in xs_per_row) / ROWS for c in range(COLS)]
    return xs, ys


def frame_padding(arr, xs, ys):
    """Cho vua frame ngoai co nhat: bao xa tam dau khoi thi con net ve.

    Ngang lay doi xung de dau khoi dung giua o (pivot x = 0.5). Duoi cat sat vi day o chinh la
    cho boss "dung" khi ve (pivot y = 1) — chua trong o duoi la boss treo lo lung len cao.
    """
    opaque = arr[..., 3] > 0
    H, W = opaque.shape
    xcut = [0] + [int((xs[i] + xs[i + 1]) / 2) for i in range(COLS - 1)] + [W]
    ycut = [0] + [int((ys[i] + ys[i + 1]) / 2) for i in range(ROWS - 1)] + [H]
    left = right = top = bottom = 0
    for r in range(ROWS):
        for c in range(COLS):
            sub = opaque[ycut[r]:ycut[r + 1], xcut[c]:xcut[c + 1]]
            yy, xx = np.nonzero(sub)
            if not len(xx):
                continue
            left = max(left, round(xs[c]) - (xx.min() + xcut[c]))
            right = max(right, (xx.max() + xcut[c]) - round(xs[c]))
            top = max(top, round(ys[r]) - (yy.min() + ycut[r]))
            bottom = max(bottom, (yy.max() + ycut[r]) - round(ys[r]))
    return max(left, right) + 1, top + 1, bottom + 1


def main():
    if not os.path.exists(RAW):
        sys.exit(f'Khong co {RAW}')
    src = Image.open(RAW).convert('RGBA')
    arr = np.array(src)
    arr[..., 3] = np.where(arr[..., 3] > DUST, arr[..., 3], 0)
    src = Image.fromarray(arr)
    xs, ys = head_grid(arr)
    print(f'Luoi dau khoi: x={[round(x) for x in xs]} y={[round(y) for y in ys]}')

    pad_x, pad_top, pad_bottom = frame_padding(arr, xs, ys)
    print(f'O can: ngang +-{pad_x}, tren {pad_top}, duoi {pad_bottom}')
    cw, ch = pad_x * 2, pad_top + pad_bottom
    sheet = Image.new('RGBA', (COLS * cw, ROWS * ch), (0, 0, 0, 0))
    for r in range(ROWS):
        for c in range(COLS):
            box = (round(xs[c]) - pad_x, round(ys[r]) - pad_top)
            sheet.paste(src.crop((box[0], box[1], box[0] + cw, box[1] + ch)), (c * cw, r * ch))

    # Day o cham net ve la dung y: day o chinh la cho boss dung. Cham ba mep kia moi la bi xen.
    for r in range(ROWS):
        for c in range(COLS):
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            bb = cell.getchannel('A').getbbox()
            if bb and (bb[0] == 0 or bb[1] == 0 or bb[2] == cw):
                print(f'  CANH BAO: frame {r * COLS + c} bi xen {bb}')

    # O phai chia het be ngang sheet: loadGridSheet lay cellW = width/cols, lech nua pixel la
    # no resample lai ca sheet mot lan nua cho khong can.
    cell_w = round(cw * CELL_H / ch)
    final = sheet.resize((COLS * cell_w, ROWS * CELL_H), Image.LANCZOS)
    final.quantize(colors=256, method=Image.FASTOCTREE).save(OUT, optimize=True)
    print(f'{os.path.relpath(OUT, ROOT)}: {final.width}x{final.height}, '
          f'o {final.width // COLS}x{CELL_H}, {os.path.getsize(OUT) / 1024:.0f} KB')
    print(f'  -> dat size: {final.width // COLS} cho SPRITES.boss trong src/config.js')


if __name__ == '__main__':
    main()

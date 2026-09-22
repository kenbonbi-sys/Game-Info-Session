# -*- coding: utf-8 -*-
"""Dung assets/source/fox-cheer.png tu ban ve goc fox-cheer-raw.webp.

Chay: python tools/build-fox-cheer-sheet.py

Anh goc la 35 con cao an mung xep 7x5, moi con mot tu the: co con gio mot tay, co con gio
hai tay, co con ngoi. Chung khong nam tren mot luoi deu — moi con lech mot kieu trong o cua
no, va cai duoi thi tho han sang mot ben, nen cat thang theo width/7 la moi con "dung" mot
do cao khac nhau: ve ra thi ca dan lo lung khong ai cham dat.

Nen script do lay hai moc that cua tung con: day nguoi (cho no dung) va tam cai dau (cho no
can giua). Dau la thu duy nhat luon o giua va khong doi cho du tay chan vung kieu gi — lay
tam theo bounding box ca con thi cai duoi keo tam lech han sang phai.

Ra: sheet 7x5 o deu nhau, day o la mat dat, tam o la tam dau. victory-film.js ve bang
loadGridSheet voi pivot {x: 0.5, y: BASE/CELL_H}.
"""
import os
import sys

from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'source', 'fox-cheer-raw.webp')
OUT = os.path.join(ROOT, 'assets', 'source', 'fox-cheer.png')

COLS, ROWS = 7, 5
# Vien alpha mo quanh net ve: tinh vao thi o phai nong ra ma khong them gi nhin thay duoc.
DUST = 8
# Dai dau: tinh tu dinh tai xuong, theo phan tram chieu cao con cao. Het khoang nay la toi
# than va tay, hai thu lam lech tam.
HEAD_BAND = (0.04, 0.42)
# Chua tren dinh va duoi day o: de net ve khong dinh mep, va de co cho ve bong duoi chan.
FOOT_PAD = 5
HEAD_PAD = 2


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


def cells(opaque):
    """Khung cat tho cua 35 con: cac khoang trong suot giua chung."""
    rb = bands(opaque.any(axis=1), 40)
    cb = bands(opaque.any(axis=0), 40)
    if len(rb) != ROWS or len(cb) != COLS:
        sys.exit(f'Tim thay {len(cb)}x{len(rb)} con, can {COLS}x{ROWS}. Ban ve goc doi layout roi?')
    return cb, rb


def anchor(opaque, x0, x1, y0, y1):
    """(tam dau theo x, day nguoi theo y, mep trai, mep phai, dinh dau) cua mot con."""
    sub = opaque[y0:y1 + 1, x0:x1 + 1]
    yy, xx = np.nonzero(sub)
    top, bottom = yy.min(), yy.max()
    head = sub[top + int((bottom - top) * HEAD_BAND[0]):top + int((bottom - top) * HEAD_BAND[1])]
    hx = np.nonzero(head.any(axis=0))[0]
    return (
        x0 + (hx.min() + hx.max()) / 2,
        y0 + bottom,
        x0 + xx.min(),
        x0 + xx.max(),
        y0 + top,
    )


def main():
    if not os.path.exists(RAW):
        sys.exit(f'Khong co {RAW}')
    src = Image.open(RAW).convert('RGBA')
    arr = np.array(src)
    arr[..., 3] = np.where(arr[..., 3] > DUST, arr[..., 3], 0)
    src = Image.fromarray(arr)
    opaque = arr[..., 3] > 0

    cb, rb = cells(opaque)
    marks = [[anchor(opaque, cx0, cx1, ry0, ry1) for cx0, cx1 in cb] for ry0, ry1 in rb]
    boxes = [[(cx0, ry0, cx1 + 1, ry1 + 1) for cx0, cx1 in cb] for ry0, ry1 in rb]

    # O chung phai chua duoc con rong nhat va con cao nhat, do tu dung moc cua chinh chung.
    left = max(cx - x_left for row in marks for cx, _, x_left, _, _ in row)
    right = max(x_right - cx for row in marks for cx, _, _, x_right, _ in row)
    tall = max(base - top for _, base, _, _, top in (m for row in marks for m in row))
    half = int(np.ceil(max(left, right))) + 1
    cw = half * 2
    ch = int(np.ceil(tall)) + 1 + HEAD_PAD + FOOT_PAD
    base_y = ch - FOOT_PAD
    print(f'O {cw}x{ch}, mat dat o y={base_y}, con cao nhat {tall:.0f} px')

    # Cat tung con trong dung khung cua no roi moi dan vao o: khoang trong giua hai hang chi
    # ~15 px, cat thang mot cua so cao ca o la keo theo ban chan cua con hang tren.
    sheet = Image.new('RGBA', (COLS * cw, ROWS * ch), (0, 0, 0, 0))
    for r, row in enumerate(marks):
        for c, (cx, base, _, _, _) in enumerate(row):
            bx0, by0, bx1, by1 = boxes[r][c]
            sheet.paste(
                src.crop((bx0, by0, bx1, by1)),
                (c * cw + half - round(cx - bx0), r * ch + base_y - round(base - by0)),
            )

    for r in range(ROWS):
        for c in range(COLS):
            bb = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)).getchannel('A').getbbox()
            if bb and (bb[0] == 0 or bb[1] == 0 or bb[2] == cw or bb[3] == ch):
                print(f'  CANH BAO: con {r * COLS + c} bi xen {bb}')

    sheet.quantize(colors=256, method=Image.FASTOCTREE).save(OUT, optimize=True)
    print(f'{os.path.relpath(OUT, ROOT)}: {sheet.width}x{sheet.height}, '
          f'o {cw}x{ch}, {os.path.getsize(OUT) / 1024:.0f} KB')
    print(f'  -> size: {cw}, pivot y: {base_y / ch:.4f} cho SPRITES.foxCheer trong src/config.js')


if __name__ == '__main__':
    main()

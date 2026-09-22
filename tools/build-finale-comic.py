# -*- coding: utf-8 -*-
"""Cat assets/source/finale-comic-raw.webp thanh 6 khung truyen roi.

Chay: python tools/build-finale-comic.py [--check]

Trang goc la mot trang truyen 2 cot x 3 hang ke doan ket: cao cam binh, nem, binh bay toi,
nuoc no vao mat quai vat, quai vat xeo thanh vung khoi, ca dan cao an mung. Doan finale can
tung khung mot de slam vao dung nhip, nen phai cat roi ra.

Khong cat theo luoi deu: sau khung khong bang nhau (hang 3 ben trai hep hon han ben phai).
Script do rang giay mau kem giua cac khung — day la thu duy nhat chac chan khong phai net ve.

Hai cho de sai, nen lam rieng:
  1. Vien khung ve tay mau nau dam. Giu lai thi phong to 2-3 lan se thay net rung; finale-comic.js
     tu ve khung moi cho sac, nen o day cat lay ruot thoi (di vao qua vien).
  2. Hang 2 khoi den tran qua rang sang khung ben canh (co y cua nguoi ve). Cat giua rang la
     khung "AO!" dinh mot soc troi xanh cua khung ben trai. Nen bien khung lay theo cho net ve
     that su bat dau, khong lay tam rang.

Ra: assets/source/comic/panel-1.webp .. panel-6.webp. finale-comic.js do ti le tung khung tu
chinh anh (naturalWidth/naturalHeight), nen khong can file mo ta kem theo.
"""
import os
import sys

from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'source', 'finale-comic-raw.webp')
OUT_DIR = os.path.join(ROOT, 'assets', 'source', 'comic')

COLS, ROWS = 2, 3
# Giay kem (254,252,234) chi cach mau trang 21 bac o kenh B. Bong bong thoai to mau trang, nen
# dung sai mau phai duoi 21 — khong la bong bong "Don cuoi day!" bi tinh la rang giay va khung
# 1 bi cat doi. 10 la con so con nhan duoc net vien mo mo ma chua cham toi mau trang.
CREAM_TOL = 10
# Rang giay: gan het chieu cao/rong la mau nen thi moi tinh la rang, khong phai mang troi sang.
GUTTER_CREAM = 0.92
# Trong mot hang, rang doc khong sach bang rang ngang (khoi tran qua). Nguong thap hon, va
# bien khung lay tai cho ty le kem tut xuong duoi muc nay — tuc la net ve that su bat dau.
COLUMN_CREAM = 0.20
# Net vien khung: di vao cho toi khi het vien, roi them chut cho khoi dinh rang cua no.
BORDER_DARK = 0.55
EDGE_PAD = 6
# Chan buoc di vao. Hang 2 ruot toan khoi den nen cot nao cung "toi": khong chan thi no an
# het vao tranh, khung "!!" con lai mot soi. Vien ve tay day chung 5px, 12 la rong rai.
BORDER_MAX = 12
QUALITY = 90


def runs(mask, minlen=1):
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


def row_bands(cream):
    """Ba hang khung: cac khoang giua nhung dai giay kem chay het be ngang."""
    gutters = runs(cream.mean(axis=1) > GUTTER_CREAM, 3)
    bands, prev = [], 0
    for a, b in gutters:
        if a - prev >= 60:
            bands.append((prev, a - 1))
        prev = b + 1
    if len(cream) - prev >= 60:
        bands.append((prev, len(cream) - 1))
    return bands


def split_columns(cream, y0, y1):
    """Hai khung cua mot hang, cat tai cho net ve that su bat dau moi ben rang."""
    profile = cream[y0:y1 + 1].mean(axis=0)
    inked = runs(profile <= COLUMN_CREAM, 40)
    if len(inked) != COLS:
        sys.exit(f'Hang y={y0}..{y1}: thay {len(inked)} khung, can {COLS}. '
                 'Trang goc doi layout roi — sua COLS/ROWS hoac COLUMN_CREAM.')
    return inked


def eat_border(line_at, limit):
    """So px vien can bo o mot phia: dem net dam lien tiep, toi da BORDER_MAX."""
    n = 0
    while n < min(BORDER_MAX, limit) and line_at(n) > BORDER_DARK:
        n += 1
    return n + EDGE_PAD


def trim_border(dark, x0, y0, x1, y1):
    """Bo vien ve tay o bon phia, lay lai ruot khung."""
    w, h = x1 - x0, y1 - y0
    x0 += eat_border(lambda n: dark[y0:y1 + 1, x0 + n].mean(), w)
    x1 -= eat_border(lambda n: dark[y0:y1 + 1, x1 - n].mean(), w)
    y0 += eat_border(lambda n: dark[y0 + n, x0:x1 + 1].mean(), h)
    y1 -= eat_border(lambda n: dark[y1 - n, x0:x1 + 1].mean(), h)
    return x0, y0, x1, y1


def main():
    if not os.path.exists(RAW):
        sys.exit(f'Khong thay {RAW}')
    page = Image.open(RAW).convert('RGB')
    a = np.asarray(page).astype(int)
    # Mau nen lay ngay goc trang: khong doan mau, nguoi ve doi tong giay thi van chay.
    bg = a[2, 2]
    cream = np.abs(a - bg).max(axis=2) < CREAM_TOL
    dark = a.sum(axis=2) / 3 < 110

    bands = row_bands(cream)
    if len(bands) != ROWS:
        sys.exit(f'Thay {len(bands)} hang khung, can {ROWS}. Trang goc doi layout roi?')

    os.makedirs(OUT_DIR, exist_ok=True)
    panels, n = [], 0
    for y0, y1 in bands:
        for x0, x1 in split_columns(cream, y0, y1):
            n += 1
            cx0, cy0, cx1, cy1 = trim_border(dark, x0, y0, x1, y1)
            cell = page.crop((cx0, cy0, cx1 + 1, cy1 + 1))
            name = f'panel-{n}.webp'
            cell.save(os.path.join(OUT_DIR, name), 'WEBP', quality=QUALITY, method=6)
            panels.append({'file': f'comic/{name}', 'width': cell.width, 'height': cell.height})
            print(f'{name}: {cell.width}x{cell.height} '
                  f'(tu {cx0},{cy0} den {cx1},{cy1})')

    if '--check' in sys.argv:
        sheet = Image.new('RGB', (1240, 800), (18, 18, 22))
        for i, p in enumerate(panels):
            cell = Image.open(os.path.join(ROOT, 'assets', 'source', p['file']))
            cell.thumbnail((390, 370))
            sheet.paste(cell, (20 + (i % 3) * 400, 20 + (i // 3) * 390))
        out = os.path.join(OUT_DIR, 'panels-check.png')
        sheet.save(out)
        print('contact sheet:', out)


if __name__ == '__main__':
    main()

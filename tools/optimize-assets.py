# -*- coding: utf-8 -*-
"""Ep bo anh cho vua duong truyen cua dien thoai trong hoi truong.

Chay: python tools/optimize-assets.py

Hai viec:
  1. Cac SVG "icon" tu kho anh that ra la PNG nhung + mask alpha + mot ma tran crop, nang
     170-600 KB moi cai. Dung lai dung phep do bang Pillow -> PNG bang mau, nho hon ~40 lan.
  2. Sprite sheet turret/boss la anh sinh ra, hang tram nghin mau that. Game ve turret o o
     92px (loadGridSheet ha xuong truoc khi dung) nen nguon 2x la du; boss ve 1:1 nen giu co.

Nguon nam trong assets/source/**/raw/ va duoc giu lai de con dung ve sau.
"""
import base64, io, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- SVG nhung anh -> PNG bang mau ------------------------------------------------
ICONS = [
    ('assets/source/reactions/raw/fox-dance.svg', 'assets/source/reactions/fox-dance.png', 192),
    ('assets/source/reactions/raw/fox-love.svg', 'assets/source/reactions/fox-love.png', 192),
    ('assets/source/reactions/raw/fox-wow.svg', 'assets/source/reactions/fox-wow.png', 192),
    ('assets/source/reactions/raw/fox-leu.svg', 'assets/source/reactions/fox-leu.png', 192),
    ('assets/source/reactions/raw/fox-wink.svg', 'assets/source/reactions/fox-wink.png', 192),
    ('assets/source/items/raw/buddy-thong-thai.svg', 'assets/source/items/buddy-thong-thai.png', 128),
    ('assets/source/items/raw/khien-research-lab.svg', 'assets/source/items/khien-research-lab.png', 128),
    ('assets/source/items/raw/sung-giot-tu-tin.svg', 'assets/source/items/sung-giot-tu-tin.png', 128),
    ('assets/source/items/raw/binh-nuoc-cao.svg', 'assets/source/items/binh-nuoc-cao.png', 192),
]

# --- Sprite sheet: (duong dan, ty le, so mau) -------------------------------------
SHEETS = [
    ('assets/source/turret.png', 0.5, 256),
    ('assets/source/turret-empty.png', 0.5, 256),
    ('assets/source/boss-smoke.png', 1.0, 256),
    ('assets/source/learning-hub-x-research-lab.png', 1.0, 128),
]


def png(b64):
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def dekey_white(img):
    """Anh khong co mask thi nen la trang dac — loang tu mep vao, chu khong xoa moi pixel
    trang: mat cao co mang kem gan trang, xoa het la thung mat."""
    img = img.convert('RGBA')
    px = img.load()
    w, h = img.size
    seen = [[False] * w for _ in range(h)]
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        r, g, b, a = px[x, y]
        if a == 0 or min(r, g, b) >= 246:
            seen[y][x] = True
            px[x, y] = (r, g, b, 0)
            stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return img


def layers(svg):
    """(ma tran, anh mau, anh mask | None) theo thu tu ve. Co file boc <g mask><g transform>,
    co file chi mot <g transform> tran — bat theo <image> roi ngo nguoc len cho chac."""
    masks = {mid: png(data) for mid, data in
             re.findall(r'<mask id="([^"]+)">.*?base64,([A-Za-z0-9+/=]+)', svg, re.S)}
    body = svg[svg.rindex('</defs>') + 7:] if '</defs>' in svg else svg
    out = []
    for m in re.finditer(r'<image[^>]*base64,([A-Za-z0-9+/=]+)', body):
        before = body[:m.start()]
        mat = [float(x) for x in re.findall(r'matrix\(([^)]*)\)', before)[-1].split(',')]
        mids = re.findall(r'mask="url\(#([^)]+)\)"', before)
        out.append((mat, png(m.group(1)), masks.get(mids[-1]) if mids else None))
    return out


def build_icon(src, dst, size):
    svg = io.open(os.path.join(ROOT, src), encoding='utf-8').read()
    view = float(re.search(r'viewBox="0 0 ([\d.]+)', svg).group(1))
    k = size / view
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for mat, color, mask in layers(svg):
        a, _, _, d, e, f = mat
        color = color.convert('RGBA')
        if mask is not None:
            color.putalpha(mask.convert('L'))
        else:
            color = dekey_white(color)
        w = max(1, round(color.width * a * k))
        h = max(1, round(color.height * d * k))
        canvas.alpha_composite(color.resize((w, h), Image.LANCZOS), (round(e * k), round(f * k)))
    # cat sat vien roi canh giua: cac icon goc lech tam moi cai mot kieu
    art = canvas.crop(canvas.getbbox())
    scale = min((size - 8) / art.width, (size - 8) / art.height, 1.0)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
    final = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    final.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    final.quantize(colors=64, method=Image.FASTOCTREE).save(os.path.join(ROOT, dst), optimize=True)
    return os.path.getsize(os.path.join(ROOT, src)), os.path.getsize(os.path.join(ROOT, dst))


def build_sheet(path, scale, colors):
    full = os.path.join(ROOT, path)
    before = os.path.getsize(full)
    im = Image.open(full).convert('RGBA')
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.quantize(colors=colors, method=Image.FASTOCTREE).save(full, optimize=True)
    return before, os.path.getsize(full)


if __name__ == '__main__':
    saved = 0
    for src, dst, size in ICONS:
        if not os.path.exists(os.path.join(ROOT, src)):
            print(f'  bo qua {src} (khong co)')
            continue
        a, b = build_icon(src, dst, size)
        saved += a - b
        print(f'{dst}: {a/1024:.0f} KB -> {b/1024:.0f} KB')
    for path, scale, colors in SHEETS:
        a, b = build_sheet(path, scale, colors)
        saved += a - b
        print(f'{path}: {a/1024:.0f} KB -> {b/1024:.0f} KB')
    print(f'Bot {saved/1024/1024:.2f} MB phai tai ve moi dien thoai.')

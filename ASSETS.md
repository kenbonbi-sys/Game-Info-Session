# Asset guide — Fox Swarm

## Sprite đang dùng

| Nhân vật | File | Kết quả trong game |
|---|---|---|
| Nhân vật chính | `assets/source/hero-360.svg` | 7 hướng nhìn, frame 64×64 |
| Logo lockup | `assets/source/learning-hub-x-research-lab.png` | Hiện trên thẻ vào phòng. Chữ đã đảo sang trắng để đọc được trên nền tối; con cáo, chữ "Learning" cam và vòng tròn xanh giữ nguyên màu gốc |
| Boss | `assets/source/boss-smoke.png` | Sheet 7×3, frame 168×168: hàng 1 `idle` (8 fps), hàng 2 `hurt` (14 fps, chạy 1 lần), hàng 3 `attack` (12 fps, chạy 1 lần) |

Boss dùng sheet PNG dạng lưới (`loadGridSheet`) như ụ súng: nền trong suốt, mỗi hàng là một animation.
Nếu file gốc có nền checkerboard vẽ chết, phải tách nền (flood fill từ viền) trước khi đưa vào `assets/source/`.

Hero vẫn đọc từ SVG khi mở: lấy ảnh bitmap nhúng bên trong, dùng lớp mask làm nền trong suốt,
tự phát hiện ảnh pixel bị phóng to bao nhiêu lần (hiện là ×3) rồi thu về đúng 1 pixel art = 1 pixel game.

Yêu cầu khi thay file SVG khác:
- Các frame **vuông, xếp thành 1 hàng ngang**: chiều rộng viewBox = số frame × chiều cao.
- Nhân vật xoay 360° phải theo thứ tự: `down-right, right, up-right, up, up-left, left, down-left`.
- Thay file cùng tên rồi F5, hoặc đổi đường dẫn/thứ tự trong `SPRITES` ở đầu `src/main.js`.

Game tự tìm `assets/fox.json` + `assets/fox.png` khi mở. Chưa có thì dùng con cáo vẽ bằng code (procedural).
Bấm **K** trong game để xuất sprite sheet đang dùng ra `fox.png` + `fox.json` — mở bằng Aseprite để vẽ đè lên làm template.

## Spec nhân vật

| Thuộc tính | Giá trị |
|---|---|
| Kích thước 1 frame | **32×32 px** (quái nhỏ 16×16, boss 32×32 hoặc 48×48) |
| Hướng nhìn | **Quay sang PHẢI** — game tự lật khi đi sang trái |
| Pivot (điểm chân) | Giữa-đáy, mặc định `(16, 27)`; hoặc tạo slice tên `pivot` trong Aseprite |
| Nền | Trong suốt, không anti-alias, tối đa ~16 màu |
| Viền | Outline 1px màu tối (không dùng đen tuyền) |

## Animation (tên tag trong Aseprite phải đúng y chang)

| Tag | Số frame | Thời lượng/frame | Loop |
|---|---|---|---|
| `idle` | 4 | 150 ms | có |
| `run` | 6 | 80 ms | có |
| `hurt` | 2 | 100 ms | không |
| `death` *(tuỳ chọn)* | 6 | 100 ms | không |
| `attack` *(tuỳ chọn)* | 4 | 80 ms | không |

Sprite sheet: mỗi animation 1 hàng, frame xếp từ trái sang phải → sheet 6 cột × 3 hàng = **192×96 px**.

## Xuất từ Aseprite

1. `File > New`: 32×32, RGBA, nền trong suốt.
2. Vẽ frame, chọn dải frame → chuột phải `New Tag` → đặt tên `idle`, `run`, `hurt`.
3. Xuất (UI: `File > Export Sprite Sheet`, Layout *By Rows*, Output JSON *Array* + *Tags*), hoặc CLI:

```bash
aseprite -b fox.aseprite --sheet assets/fox.png --data assets/fox.json --format json-array --list-tags --list-slices --sheet-type rows
```

4. Reload trang game (F5). Góc phải trên sẽ hiện `Sprite: assets/fox.json`.

## Prompt tạo asset bằng AI

Thay `XXX` bằng nhân vật. AI hiếm khi ra pixel-perfect: sau khi tạo, thu nhỏ về đúng lưới bằng
*nearest neighbor*, rồi `File > Import Sprite Sheet` trong Aseprite để sửa từng frame.

**Sprite sheet nhân vật**

```text
Pixel art sprite sheet of XXX, cute chibi style, 32x32 pixels per frame, facing right,
side view for a top-down action game. 3 rows on a transparent background:
row 1 idle animation 4 frames (gentle breathing, tail sway),
row 2 run cycle 6 frames,
row 3 hurt 2 frames (flinch, eyes closed).
Consistent proportions in every frame, 1px dark outline, limited 16-color palette,
no anti-aliasing, no text, no grid lines, evenly spaced frames.
```

**Quái swarm**

```text
Pixel art enemy sprite sheet of XXX, 16x16 pixels per frame, 2-frame bounce/walk loop,
facing right, transparent background, 1px dark outline, 8-color palette, no anti-aliasing.
```

**Tile nền**

```text
Seamless tileable pixel art grass tile, 32x32 pixels, top-down view, subtle variation,
soft green palette of 6 colors, no anti-aliasing, no outline.
```

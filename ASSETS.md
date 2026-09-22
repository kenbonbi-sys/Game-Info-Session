# Asset guide — Fox Swarm

## Sprite đang dùng

| Nhân vật | File | Kết quả trong game |
|---|---|---|
| Nhân vật chính | `assets/source/hero-360.svg` | 7 hướng nhìn, frame 64×64 |
| Logo lockup | `assets/source/learning-hub-x-research-lab.png` | Hiện trên thẻ vào phòng. Chữ đã đảo sang trắng để đọc được trên nền tối; con cáo, chữ "Learning" cam và vòng tròn xanh giữ nguyên màu gốc |
| Boss | `assets/source/boss-smoke.png` | Sheet 7×3, frame 205×168: hàng 1 `idle` (8 fps), hàng 2 `hurt` (14 fps, chạy 1 lần), hàng 3 `attack` (12 fps, chạy 1 lần). Dựng từ `boss-smoke-raw.webp`, xem [Thay sprite boss](#thay-sprite-boss) |
| Cáo ăn mừng | `assets/source/fox-cheer.png` | Sheet 7×5, ô 186×201: 35 tư thế nhìn thẳng, chân đứng trên đáy ô. Chỉ dùng cho clip chiến thắng — mỗi con cáo trong clip chọn ô riêng. Dựng từ `fox-cheer-raw.webp`, xem [Thay sprite cáo ăn mừng](#thay-sprite-cáo-ăn-mừng) |
| Vật phẩm | `assets/source/items/*.png` | 128×128, hiện ở thanh vật phẩm và trong clip hướng dẫn |
| Icon thả chơi | `assets/source/reactions/*.png` | 192×192, 5 con cáo người chơi thả cho nhau xem lúc chờ |

## Nặng bao nhiêu thì điện thoại chịu được

Cả hội trường vào cùng lúc bằng 4G hoặc wifi khách, nên mỗi KB đều tính. Bộ ảnh đã ép lại:
turret/boss giảm màu (và turret thu còn 50% vì `loadGridSheet` hạ xuống ô 92px trước khi dùng),
còn các icon SVG nhúng ảnh raster thì dựng lại thành PNG bảng màu — tổng cộng **5.4 MB → ~430 KB**.

Sửa hay thêm ảnh xong thì chạy lại:

```bash
python tools/optimize-assets.py
```

File gốc nằm trong `assets/source/**/raw/` và không được deploy tới điện thoại; script đọc từ đó
ghi đè bản đã ép. Đừng sửa tay bản đã ép — lần chạy script sau sẽ đè mất.

## Thay sprite boss

Boss dùng sheet PNG dạng lưới (`loadGridSheet`) như ụ súng: nền trong suốt, mỗi hàng là một animation.
Nếu file gốc có nền checkerboard vẽ chết, phải tách nền (flood fill từ viền) trước khi đưa vào `assets/source/`.

Bản vẽ boss do máy sinh ra **không nằm trên lưới chính xác**: 21 hình xếp 7×3 nhưng mỗi hình một
bề ngang, frame thì sét toả sang một bên, frame thì phun lửa xuống dưới. Cắt thẳng theo
`width / 7` là xén mất sét của frame này và dính sang ô bên cạnh. Nên:

1. Chép bản vẽ gốc (giữ nguyên, đừng sửa) vào `assets/source/boss-smoke-raw.webp`.
2. `python tools/build-boss-sheet.py`

Script dò lưới thật từ **đầu khói** — khối màu tối đặc, thứ duy nhất có mặt ở cả 21 frame và
không đổi chỗ khi sét hay lửa bùng ra — rồi đặt từng frame vào ô sao cho đầu khói nằm đúng một
chỗ, cắt sát đáy (đáy ô là chỗ boss "đứng", `pivot.y = 1`). Nó in ra bề rộng ô; **chép con số
đó vào `size` của `SPRITES.boss` trong [src/config.js](src/config.js)**, vì bản vẽ mới có thể
rộng hẹp khác bản cũ. Frame nào bị xén script cũng báo.

Layout khác 7×3 thì sửa `COLS`/`ROWS` trong script lẫn `cols`/`rows` trong config.

Hero vẫn đọc từ SVG khi mở: lấy ảnh bitmap nhúng bên trong, dùng lớp mask làm nền trong suốt,
tự phát hiện ảnh pixel bị phóng to bao nhiêu lần (hiện là ×3) rồi thu về đúng 1 pixel art = 1 pixel game.

Yêu cầu khi thay file SVG khác:
- Các frame **vuông, xếp thành 1 hàng ngang**: chiều rộng viewBox = số frame × chiều cao.
- Nhân vật xoay 360° phải theo thứ tự: `down-right, right, up-right, up, up-left, left, down-left`.
- Thay file cùng tên rồi F5, hoặc đổi đường dẫn/thứ tự trong `SPRITES` ở đầu `src/main.js`.

Game tự tìm `assets/fox.json` + `assets/fox.png` khi mở. Chưa có thì dùng con cáo vẽ bằng code (procedural).
Bấm **K** trong game để xuất sprite sheet đang dùng ra `fox.png` + `fox.json` — mở bằng Aseprite để vẽ đè lên làm template.

## Thay sprite cáo ăn mừng

Clip chiến thắng cuối chương trình (`src/victory-film.js`) không dùng sprite trong game: nó có
bộ riêng, 35 con cáo nhìn thẳng đang ăn mừng.

1. Chép bản vẽ gốc (giữ nguyên, đừng sửa) vào `assets/source/fox-cheer-raw.webp` — lưới 7×5,
   nền trong suốt, giữa các con phải có khoảng trống để script tách được từng con.
2. `python tools/build-fox-cheer-sheet.py`
3. `node scripts/render-victory.mjs` để dựng lại clip `.webm` (xem đầu file script về ffmpeg
   và Playwright). Không chạy bước này thì máy chiếu vẫn phát clip cũ.

Script canh từng con theo hai mốc của chính nó: **đáy người** (chỗ nó đứng) và **tâm cái đầu**
(chỗ căn giữa). Lấy tâm theo bounding box cả con là cái đuôi kéo lệch hẳn sang một bên. Nó in ra
bề rộng ô và `pivot.y`; **chép hai con số đó vào `SPRITES.foxCheer` trong
[src/config.js](src/config.js)**. Con nào bị xén script cũng báo.

Số ô của từng con cáo trong clip nằm ở bảng `FOXES` trong
[src/victory-film.js](src/victory-film.js) (`idle` lúc đứng chờ, `cheer` là hai ô đổi qua lại
lúc hò reo) — đếm từ 0, trái sang phải, trên xuống dưới.

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

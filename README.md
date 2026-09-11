# Buddy vs Quái Vật Dễ Sợ 🦊

Game quiz đánh boss cho event, chơi trên điện thoại hoặc máy tính.

- **Map:** đấu trường không gian (`assets/source/map/space-arena-empty.png`) với **30 vòng neon = 30 ụ súng**. Máy tính thấy trọn map; điện thoại vừa khít chiều cao và kéo ngang theo con cáo. Toạ độ 30 vòng, mép sàn và vị trí boss nằm trong `ARENA` ở [src/config.js](src/config.js).
- **Phòng chờ:** mọi người ở chung map, thấy con cáo và tên của nhau. Mỗi người chạy tới một vòng neon (1 ụ = 1 người) và bấm **Tham gia**; đổi ý thì **Thoát ụ**. Tối đa 30 người có ụ; từ người thứ 31 vẫn trả lời và có điểm nhưng không có ụ.
- **MC bấm Bắt đầu:** ụ súng khoá cố định. Ai chưa chọn ụ được xếp vào ụ trống.
- **Mỗi câu hỏi:** 4 đáp án bật lên, bấm để chọn. Đúng thì nòng ụ của người đó xoay về phía Quái Vật Dễ Sợ rồi bắn ngay lập tức; sai hoặc hết giờ thì Quái Vật Dễ Sợ bắn trả vào ụ đó. Mọi người đều thấy ụ nào bắn, ụ nào bị bắn.
- **Máu Quái Vật Dễ Sợ** là chung cho cả phòng; điểm và Top 5 vẫn tính theo từng người.

## Vật phẩm

Mỗi người có sẵn 1 bộ 3 món khi game bắt đầu, mỗi món dùng 1 lần, bấm ở khay cạnh phải màn hình. Server chấm hiệu ứng.

| Vật phẩm | Dùng lúc | Tác dụng |
|---|---|---|
| Buddy thông thái | Đang có câu hỏi, chưa trả lời | Loại 2 đáp án sai của câu đó |
| Khiên Research Lab | Bất kỳ lúc nào trong game | Bật sẵn tới lần sai/hết giờ kế tiếp: ụ không bị bắn, giữ chuỗi combo |
| Súng giọt tự tin | Bất kỳ lúc nào trong game | Bật sẵn tới câu đúng kế tiếp: x2 điểm, ụ bắn 2 phát |

Khiên và súng đang bật hiện trên ụ của người đó cho mọi người cùng thấy.
Đúng thì bắn Quái Vật Dễ Sợ, sai thì boss phản đòn. Màn chiếu hiện câu hỏi, số người đã trả lời, đáp án và Top 5.

## Chạy

```bash
node server.js
```

Terminal in ra 3 link:

| Link | Dùng cho |
|---|---|
| `http://<IP-wifi>:5173` | Người chơi. Màn chiếu tự hiện QR của link này |
| `http://localhost:5173/host?key=xxxxxx` | MC mở trên laptop nối máy chiếu. Key đổi mỗi lần chạy server |
| `http://localhost:5173/sandbox` | Bản swarm cũ, để test sprite |

Không cần `npm install`, chỉ cần Node 18+. Muốn đổi cổng: `node server.js --port=5174`.
Muốn cố định host key: đặt biến môi trường `HOST_KEY` trước khi chạy.

## Checklist trước event

- Laptop và điện thoại **chung một wifi**. Lần đầu chạy, Windows hỏi quyền mạng cho Node → chọn **Allow** (Private network).
- Test bằng 2–3 điện thoại thật: quét QR → vào được → trả lời được.
- Wifi công ty hay **chặn các máy nói chuyện với nhau** (client isolation). Nếu điện thoại không vào được:
  thử link khác trong ô chọn dưới QR, hoặc phát hotspot từ một điện thoại/router riêng rồi cho laptop + khán giả vào đó.
- Kết thúc game bấm **Tải CSV** để lấy danh sách điểm và đáp án từng người (trao quà Top 5).

## Điều khiển

| | Điện thoại | Máy tính |
|---|---|---|
| Di chuyển | Kéo ngón tay trên màn hình | WASD / mũi tên |
| Vào / thoát ụ súng (phòng chờ) | Đi tới gần ụ, bấm **Tham gia** / **Thoát ụ** | như điện thoại, hoặc phím E |
| Chọn đáp án | Chạm vào đáp án bật lên ở cuối màn hình | Bấm chuột vào đáp án, hoặc phím 1–4 |

MC trên màn chiếu: **Bắt đầu**, **Hiện đáp án / Câu tiếp** (hoặc phím Enter / →), bật tắt **Tự chuyển câu**, **Reset**.

## Luật tính điểm

- Đúng: 500 + tối đa 500 theo tốc độ trả lời, cộng thêm 50/câu khi đúng liên tiếp (tối đa +250).
- Sai hoặc hết giờ: 0 điểm, Quái Vật Dễ Sợ (đứng yên) bắn trả vào ụ súng của người đó. Không có quái nào khác.
- Bằng điểm thì ai tổng thời gian trả lời ít hơn xếp trên.
- Mỗi câu đảo thứ tự đáp án một lần cho cả phòng (điện thoại và màn chiếu thấy giống nhau).

## Sửa câu hỏi

Tất cả trong [data/questions.json](data/questions.json). Sửa xong bấm **Bắt đầu / Chơi lại** là áp dụng, không cần tắt server.

- `order`: danh sách ID câu hỏi theo thứ tự sẽ chơi.
- `answer`: vị trí đáp án đúng, **đếm từ 0** (A = 0, B = 1, C = 2, D = 3) theo thứ tự `options` trong file.
- `answerConfirmed: false`: đáp án do tôi suy ra, team cần xác nhận. Server in danh sách này khi khởi động.
- `timePerQuestion`, `revealSeconds`, `shuffleOptions`: thời gian mỗi câu, thời gian hiện đáp án, có đảo đáp án không.

File này không tải được từ trình duyệt nên người chơi không xem trộm đáp án được.

## Cấu trúc

```
server.js           server quiz: chạy câu hỏi, chấm điểm, đẩy realtime (Server-Sent Events), không dependency
data/questions.json bộ câu hỏi + đáp án
index.html          trang người chơi   → src/play.js
host.html           màn chiếu cho MC   → src/host.js
sandbox.html        bản swarm cũ       → src/main.js
src/sprites.js      đọc sprite SVG/Aseprite, vẽ slime/cây
src/entities.js     Player (di chuyển, lướt, animation)
src/config.js       đường dẫn sprite nhân vật + boss
ASSETS.md           spec và cách thay sprite
```

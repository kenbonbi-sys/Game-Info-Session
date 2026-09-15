# Buddy vs Quái Vật Dễ Sợ 🦊

Game quiz đánh boss cho event. Laptop của admin xuất **hai màn hình**: màn laptop là **bảng điều khiển** để theo dõi, máy chiếu **chỉ hiện game**. Điện thoại là tay cầm kiểu Kahoot.

- **Bảng điều khiển (`/host`, màn laptop):** mọi nút điều khiển, câu hỏi hiện tại kèm **đáp án đúng** (chỉ admin thấy), số người chọn từng ô theo thời gian thực, máu boss, phát bắn và tốc độ bắn, trạng thái máy chiếu (đã kết nối hay chưa), danh sách người chơi (online, ụ, đúng/sai câu này, điểm), nhật ký hoạt động, tiến trình 15 câu và khung **xem trước** đúng những gì máy chiếu đang hiện.
- **Màn game (`/screen`, máy chiếu):** không có nút nào. Thiết kế cố định **1920 × 1080**, tự co giãn vừa mọi màn hình (dư thì viền đen). Đấu trường ngang: Quái Vật Dễ Sợ bay trên lò phản ứng ở trên, bên dưới là **108 ụ súng** (6 hàng × 3 dãy, mỗi dãy 6 ụ, có 2 lối đi). Mỗi ụ có bảng tên người chơi. Nền pixel vẽ một lần trong [src/arena-scene.js](src/arena-scene.js); toạ độ ụ, lối đi, boss nằm trong `ARENA` ở [src/config.js](src/config.js).
- **Điện thoại (`/`):** nhập tên là có ngay một ụ (xếp từ giữa các hàng gần boss ra ngoài). Khi có câu hỏi, điện thoại chỉ hiện **4 ô màu + hình (A ▲ đỏ, B ◆ xanh dương, C ● vàng, D ■ xanh lá)**, không có chữ; câu hỏi và nội dung đáp án đọc trên màn hình lớn. Tối đa 108 người có ụ; người thứ 109 trở đi vẫn chơi, có điểm và bắn từ chân lối đi.

## Luồng mỗi câu

1. **Câu hỏi** (15s): màn chiếu hiện câu hỏi, 4 đáp án màu, đồng hồ và số người đã trả lời. Mọi người chọn trên điện thoại. **Chưa ai biết đúng sai**: điện thoại chỉ báo "Đã chọn". Khi mọi người đang kết nối đều đã chọn, câu hỏi đóng sau 1,5 giây.
2. **Đáp án** (5s): màn chiếu tô đáp án đúng, số người chọn từng ô và Top 5. Điện thoại báo Chính xác (+điểm, combo) / Chưa đúng / Hết giờ.
3. **Chuyển cảnh sang đấu trường, BẮN** (6s): ai trả lời đúng thì điện thoại hiện nút **BẮN!** to, **chạm liên tục** để ụ của mình bắn; cả hội trường bắn cùng lúc. Ai sai hoặc hết giờ thì Quái Vật phản đòn vào ụ đó (ụ bốc khói, lượt này không bắn được).
4. **Ngưng bắn** 2 giây rồi sang câu tiếp.

Tắt **Tự chuyển** thì game dừng ở bước 2 và sau bước 3, chờ admin bấm nút trên bảng điều khiển.

- **Máu Quái Vật** là chung cả phòng, tính bằng phát bắn: `số người lúc bắt đầu × số câu × 24`. Hội trường trả lời đúng và tap khoảng 4 lần/giây sẽ hạ boss gần câu cuối; nếu hết câu mà boss còn máu, cả hội trường tung **đòn kết liễu** chung trước khi hiện bảng xếp hạng.
- Server nhận tối đa **12 tap/giây mỗi người**; điện thoại gom tap gửi 4 lần/giây. Tap không cộng điểm xếp hạng, chỉ trừ máu boss.
- **Âm thanh** phát từ cửa sổ màn game (trình duyệt chỉ mở tiếng sau lần bấm phím/chuột đầu tiên trên cửa sổ đó, ví dụ lúc bấm F). Điện thoại rung nhẹ khi chạm (Android).

## Vật phẩm

Mỗi người có 1 bộ 3 món khi game bắt đầu, mỗi món dùng 1 lần, khay nằm dưới màn điện thoại (ẩn khi đang bắn). Server chấm hiệu ứng.

| Vật phẩm | Dùng lúc | Tác dụng |
|---|---|---|
| Buddy thông thái | Đang có câu hỏi, chưa chọn | Loại 2 ô sai trên điện thoại của bạn |
| Khiên Research Lab | Bất kỳ lúc nào trong game | Bật sẵn tới lần sai/hết giờ kế tiếp: ụ không bị phản đòn, giữ combo |
| Súng giọt tự tin | Bất kỳ lúc nào trong game | Bật sẵn tới câu đúng kế tiếp: x2 điểm, mỗi tap bắn x2 sát thương |

Khiên và súng đang bật hiện trên ụ của người đó ở màn chiếu.

## Chạy

```bash
node server.js
```

Terminal in ra các link:

| Link | Dùng cho |
|---|---|
| `http://<IP-wifi>:5173` | Người chơi. Màn game tự hiện QR của link này |
| `http://localhost:5173/host?key=xxxxxx` | **Bảng điều khiển**, mở trên màn laptop. Key đổi mỗi lần chạy server |
| `http://localhost:5173/screen?key=xxxxxx` | **Màn game** cho máy chiếu (thường mở bằng nút trên bảng điều khiển) |
| `http://localhost:5173/sandbox` | Bản swarm cũ, để test sprite |

Không cần `npm install`, chỉ cần Node 18+. Muốn đổi cổng: `node server.js --port=5174`.
Muốn cố định host key: đặt biến môi trường `HOST_KEY` trước khi chạy.

## Chạy trên internet (không cần chung wifi)

Chạy trên laptop thì điện thoại phải chung mạng LAN — hội trường có wifi khách tách mạng, hoặc
mọi người dùng 4G, là vào không được. Deploy lên [Render](https://render.com) để có link https
công khai: repo đã có sẵn `render.yaml`.

1. New → **Blueprint** → chọn repo này → Render đọc `render.yaml`.
2. Render hỏi `HOST_KEY`: tự đặt một chuỗi khó đoán (đây là mật khẩu vào `/host` và `/screen`).
3. Deploy xong sẽ có link dạng `https://fox-quiz-xxxx.onrender.com`. Đó là link người chơi;
   `/host?key=...` và `/screen?key=...` dùng đúng key vừa đặt.

Không cần khai `PUBLIC_URL` — server tự lấy `RENDER_EXTERNAL_URL` nên QR trên màn chiếu ra đúng
link công khai. Deploy chỗ khác (Railway, Fly.io, VPS) thì đặt `PUBLIC_URL` thủ công.

Lưu ý khi chạy trên Render:

- **Chỉ 1 instance.** Trạng thái ván chơi nằm trong RAM; scale lên 2 là hai nửa hội trường chơi
  hai ván khác nhau. Free plan vốn đã 1 instance.
- **Gói free ngủ sau 15 phút** không ai truy cập, lần đánh thức mất ~30-60 giây. Trước giờ chơi
  mở link trước vài phút, hoặc nâng lên gói Starter ($7/tháng) cho buổi sự kiện rồi hạ lại.
- **Deploy lại là mất ván đang chạy** (server khởi động lại, người chơi phải vào lại). Đừng push
  code trong lúc đang chơi.
- Region `singapore` cho ping từ VN thấp nhất (~30-60ms).

## Setup hai màn hình

1. Cắm máy chiếu, chỉnh Windows sang **Extend** (Win + P → Mở rộng), không dùng Duplicate.
2. Mở link `/host?key=...` trên màn laptop.
3. Bấm **Mở màn chiếu ↗**: một cửa sổ mới hiện ra. Kéo nó sang máy chiếu, bấm **F** (hoặc double-click) để toàn màn hình. Con trỏ chuột và dòng hướng dẫn tự ẩn sau 2 giây.
4. Trên bảng điều khiển, ô **Màn chiếu** chuyển xanh "đã kết nối". Nếu đỏ thì màn game đã bị đóng hoặc mất mạng; nhật ký cũng ghi lại.

Máy chiếu nối với máy khác cũng được: bấm **sao chép** link màn chiếu trong thẻ "Link vào chơi" rồi mở trên máy đó. Laptop yếu thì tắt ô **Xem trước** để đỡ tốn tài nguyên.

## Bảng điều khiển

| Phím / nút | Tác dụng |
|---|---|
| Nút cam lớn / Enter / → / Space | Làm bước tiếp theo, nhãn nút ghi rõ: Bắt đầu game → Khoá & hiện đáp án → Cho cả hội trường bắn → Sang câu sau → Chơi lại |
| **Tự chuyển: BẬT/TẮT** | Tắt thì game dừng chờ admin ở màn đáp án và sau lượt bắn |
| **Tải CSV**, **Reset** | Xuất điểm từng người (có cột số phát bắn), về phòng chờ |
| Ô chọn link (khi laptop có nhiều mạng) | Đổi link và QR mà màn game hiển thị |

Người chơi trên laptop: phím 1–4 chọn đáp án, Space/Enter để bắn.

## Checklist trước event

- Laptop và điện thoại **chung một wifi**. Lần đầu chạy, Windows hỏi quyền mạng cho Node → chọn **Allow** (Private network).
- Test bằng 2–3 điện thoại thật: quét QR → vào được → trả lời → tap bắn được.
- Wifi công ty hay **chặn các máy nói chuyện với nhau** (client isolation). Nếu điện thoại không vào được: thử link khác trong ô chọn link trên bảng điều khiển, hoặc phát hotspot từ một điện thoại/router riêng rồi cho laptop + khán giả vào đó.
- Test đủ bộ hai màn hình: bảng điều khiển trên laptop, màn game fullscreen trên máy chiếu, có tiếng.
- Lượt bắn gửi nhiều request (mỗi người ~4 request/giây trong 6 giây): nên thử với nhiều máy trên đúng wifi event.
- Kết thúc game bấm **Tải CSV** để lấy danh sách điểm và đáp án từng người (trao quà Top 5).

## Luật tính điểm

- Đúng: 500 + tối đa 500 theo tốc độ trả lời, cộng thêm 50/câu khi đúng liên tiếp (tối đa +250). Điểm được chấm cùng lúc cho mọi người khi hiện đáp án.
- Sai hoặc hết giờ: 0 điểm, Quái Vật phản đòn vào ụ súng, lượt đó không được bắn.
- Bằng điểm thì ai tổng thời gian trả lời ít hơn xếp trên.
- Mỗi câu đảo thứ tự đáp án một lần cho cả phòng (điện thoại và màn chiếu khớp màu/hình).

## Sửa câu hỏi

Tất cả trong [data/questions.json](data/questions.json). Sửa xong bấm **Bắt đầu / Chơi lại** là áp dụng, không cần tắt server.

- `order`: danh sách ID câu hỏi theo thứ tự sẽ chơi.
- `answer`: vị trí đáp án đúng, **đếm từ 0** (A = 0, B = 1, C = 2, D = 3) theo thứ tự `options` trong file. Mỗi câu 2–4 đáp án.
- `answerConfirmed: false`: đáp án do tôi suy ra, team cần xác nhận. Server in danh sách này khi khởi động.
- `timePerQuestion`, `revealSeconds`, `fireSeconds`, `shuffleOptions`: thời gian trả lời, hiện đáp án, lượt bắn, có đảo đáp án không.

File này không tải được từ trình duyệt nên người chơi không xem trộm đáp án được.

## Cấu trúc

```
server.js            server quiz: câu hỏi → đáp án → bắn, chấm điểm, nhận tap, đẩy realtime (SSE), không dependency
data/questions.json  bộ câu hỏi + đáp án
host.html            bảng điều khiển admin (màn laptop) → src/host.js, src/host.css
screen.html          màn game 1920×1080 (máy chiếu)    → src/screen.js, src/screen.css
index.html           tay cầm điện thoại                → src/play.js, src/play.css
sandbox.html         bản swarm cũ         → src/main.js
src/arena-view.js    vẽ đấu trường trên máy chiếu: ụ súng, bảng tên, boss, đạn, phản đòn
src/arena-scene.js   nền pixel của đấu trường, vẽ Canvas một lần
src/config.js        sprite, bố cục 108 ụ, thứ tự xếp ụ, màu/hình 4 đáp án, vật phẩm
src/guide-clips.js   4 clip hướng dẫn trên màn vào game
src/sprites.js       đọc sprite SVG/PNG dạng lưới
ASSETS.md            spec và cách thay sprite
```

# Buddy vs Quái Vật Dễ Sợ 🦊

Game quiz đánh boss cho event, chơi trên điện thoại hoặc máy tính.

- **Map:** đấu trường không gian dạng dọc **720 × 1160**, với **30 vòng neon = 30 ụ súng**, chia thành 5 hàng hai bên lối đi giữa. Boss bay chậm theo vòng số 8 ở đầu bản đồ (16 giây/vòng), Buddy xuất hiện ở cửa vào phía dưới. Đạn ụ súng tự bám theo boss và luôn trúng. Nền pixel được vẽ một lần bằng Canvas trong [src/arena-scene.js](src/arena-scene.js); toạ độ ụ, mép sàn, boss và điểm xuất hiện nằm trong `ARENA` ở [src/config.js](src/config.js).
- **Bố cục:** một thanh trạng thái trên cùng hiện máu boss, tên và điểm của bạn. Toàn bộ đấu trường nằm trong vùng riêng; vào hoặc thoát ụ không đổi góc nhìn. Điện thoại đặt câu hỏi và **4 đáp án theo lưới 2 × 2** phía dưới, kèm khay vật phẩm. Trên màn hình ngang rộng, đấu trường dọc và một cột câu hỏi nằm cạnh nhau; đáp án xếp một cột, còn điện thoại ngang dùng lưới 2 × 2.
- **Phòng chờ:** mọi người ở chung map, thấy con cáo và tên của nhau. Mỗi người chạy tới một vòng neon (1 ụ = 1 người) và bấm **Tham gia**; đổi ý thì **Thoát ụ**. Tối đa 30 người có ụ; từ người thứ 31 vẫn trả lời và có điểm nhưng không có ụ.
- **Nhận biết ụ:** chỉ trong phòng chờ, ụ trống có aura xanh `#1C66BB` lan ra ngoài chân ụ và bốc lên nhẹ, nhịp sáng alpha 0.2–0.4 lệch pha từng ụ. Ụ đang chọn sáng hơn, ụ của bạn sáng cam; ụ của người khác tắt aura. Tên nổi trên đầu cáo/ụ không có khung: tên của bạn xanh lá, người khác trắng; tên ở ụ có thể xuống hai dòng trên màn hình nhỏ.
- **MC bấm Bắt đầu:** ụ súng khoá cố định. Ai chưa chọn ụ được xếp vào ụ trống.
- **Mỗi câu hỏi:** 4 đáp án bật lên, bấm để chọn. Đúng thì nòng ụ của người đó xoay về phía Quái Vật Dễ Sợ rồi bắn ngay lập tức; sai hoặc hết giờ thì Quái Vật Dễ Sợ bắn trả vào ụ đó. Mọi người đều thấy ụ nào bắn, ụ nào bị bắn.
- **Âm thanh:** ụ bắn có tiếng súng nước, boss phản đòn có âm trầm riêng; hai phát của vật phẩm x2 có hai tiếng. Âm thanh được mở sau lần chạm/bấm phím đầu tiên, tiếng của người khác nhỏ hơn và được giới hạn khi cả phòng bắn cùng lúc.
- **Máu Quái Vật Dễ Sợ** là chung cho cả phòng; điểm và Top 5 vẫn tính theo từng người.

## Vật phẩm

Mỗi người có sẵn 1 bộ 3 món khi game bắt đầu, mỗi món dùng 1 lần. Khay vật phẩm nằm dưới phần câu hỏi trong cùng bảng điều khiển trên cả điện thoại và máy tính; tác dụng ghi ngay trên từng nút. Server chấm hiệu ứng.

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
| Di chuyển | Kéo ngón tay trên đấu trường | WASD / mũi tên |
| Vào / thoát ụ súng (phòng chờ) | Đi tới gần ụ, bấm **Tham gia** / **Thoát ụ** | như điện thoại, hoặc phím E |
| Chọn đáp án | Chạm một trong 4 nút đáp án dưới câu hỏi | Bấm chuột vào đáp án, hoặc phím 1–4 |

Nội dung câu hỏi và đáp án dài có thể cuộn trong bảng điều khiển; khay vật phẩm nằm cố định dưới vùng cuộn khi trận đấu đang diễn ra. Sau khi chọn, các nút đáp án giữ nguyên vị trí và hiện dấu đúng/sai. Đồng hồ hiện số giây còn lại. Nếu lỗi mạng khi gửi, nút **Gửi lại đáp án** gửi lại đúng lựa chọn trước đó, không đổi đáp án.

Giao diện người chơi dùng `src/play.css`, tách khỏi bộ pixel chung `src/pixel.css`. Bố cục hỗ trợ safe area của iPhone và bàn phím qua `visualViewport`; vẫn nên kiểm tra Safari trên điện thoại thật trước event.

MC trên màn chiếu: **Bắt đầu**, **Hiện đáp án / Câu tiếp** (hoặc phím Enter / →), bật tắt **Tự chuyển câu**, **Reset**.

## Luật tính điểm

- Đúng: 500 + tối đa 500 theo tốc độ trả lời, cộng thêm 50/câu khi đúng liên tiếp (tối đa +250).
- Sai hoặc hết giờ: 0 điểm, Quái Vật Dễ Sợ bắn trả vào ụ súng của người đó. Không có quái nào khác.
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
src/config.js       đường dẫn sprite, vật phẩm và hình học đấu trường dọc
src/arena-scene.js  nền pixel của đấu trường, vẽ Canvas một lần
src/play.css        bố cục người chơi: thanh trạng thái, đấu trường và bảng câu hỏi
ASSETS.md           spec và cách thay sprite
```

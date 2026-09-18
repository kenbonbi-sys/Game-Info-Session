# Buddy vs Quái Vật Dễ Sợ 🦊

Game quiz đánh boss cho event. Laptop của admin xuất **hai màn hình**: màn laptop là **bảng điều khiển** để theo dõi, máy chiếu **chỉ hiện game**. Điện thoại là tay cầm kiểu Kahoot.

- **Bảng điều khiển (`/host`, màn laptop):** mọi nút điều khiển, câu hỏi hiện tại kèm **đáp án đúng** (chỉ admin thấy), số người chọn từng ô theo thời gian thực, máu boss, phát bắn và tốc độ bắn, trạng thái máy chiếu (đã kết nối hay chưa), danh sách người chơi (online, ụ, đúng/sai câu này, điểm), nhật ký hoạt động, tiến trình 15 câu và khung **xem trước** đúng những gì máy chiếu đang hiện.
- **Màn game (`/screen`, máy chiếu):** không có nút nào. Thiết kế cố định **1920 × 1080**, tự co giãn vừa mọi màn hình (dư thì viền đen). Đấu trường ngang: Quái Vật Dễ Sợ bay trên lò phản ứng ở trên, bên dưới là **108 ụ súng** (6 hàng × 3 dãy, mỗi dãy 6 ụ, có 2 lối đi). Mỗi ụ có bảng tên người chơi. Nền pixel vẽ một lần trong [src/arena-scene.js](src/arena-scene.js); toạ độ ụ, lối đi, boss nằm trong `ARENA` ở [src/config.js](src/config.js).
- **Điện thoại (`/`):** nhập tên là có ngay một ụ (xếp từ giữa các hàng gần boss ra ngoài). Khi có câu hỏi, điện thoại chỉ hiện **4 ô màu + hình (A ▲ đỏ, B ◆ xanh dương, C ● vàng, D ■ xanh lá)**, không có chữ; câu hỏi và nội dung đáp án đọc trên màn hình lớn. Tối đa 108 người có ụ; người thứ 109 trở đi vẫn chơi, có điểm và bắn từ chân lối đi.

## Mở màn: Quái Vật được sinh ra từ đâu

Game đánh boss nằm cuối buổi. Đoạn này chạy ngay **đầu chương trình**, cách đó cả tiếng, và là chỗ
con boss có nguồn gốc: cả hội trường gõ điều mình sợ khi làm nghiên cứu, chữ hiện lên máy chiếu
thành đám mây, rồi MC bấm một nút để đám mây xoáy lại thành Quái Vật. Tới cuối buổi, thứ mọi người
cùng bắn không còn là một con quái vật vô danh — nó là nỗi sợ của chính họ.

Điều khiển nằm ở thẻ **Mở màn · Nỗi sợ** trên `/host`, một nút cho mỗi bước:

| Bước | MC bấm | Máy chiếu | Điện thoại (`/fear`) |
|---|---|---|---|
| 1 | ▶ Bắt đầu đoạn mở màn | QR to giữa màn hình | — |
| 2 | Mở bàn phím cho hội trường | Đám mây chữ, QR lùi xuống thanh dưới | Ô gõ, gửi bao nhiêu lần cũng được |
| 3 | 🌪️ Triệu hồi Quái Vật | Đoạn phim 15 giây | "Nhìn lên màn hình lớn!" |
| — | (tự động sau 15s) | Màn đen, Quái Vật hiện lại kèm câu hỏi của cả buổi — **đứng yên ở đây** | — |
| 4 | Xong phần nội dung · mở phòng chờ game | Phòng chờ của game | — |

Đoạn phim: chữ bị hút vào một xoáy khói → **3 nỗi sợ nhiều người gõ nhất** bay vào thật to kèm số
người đã gõ → bị nuốt nốt → Quái Vật bước ra, nói *"TA LÀ NỖI SỢ CỦA CÁC NGƯƠI!"*, cười, rồi bay đi.

Phim xong, máy chiếu **không tự về phòng chờ**: nó tối hẳn, Quái Vật hiện lại trong bóng tối và
màn hình hỏi *"TA NÊN LÀM GÌ ĐỂ CHIẾN ĐẤU VỚI NỖI SỢ ĐÂY? — Hãy cùng đón xem nhé!"*. Đó là tấm nền
để MC dẫn sang phần nội dung, và nó nằm yên đó cho tới khi MC bấm bước 4. Phòng chờ của game đã là
đấu trường với mấy chục ụ súng, thấy trước là lộ mất đoạn cuối buổi — nên bước 4 hỏi lại một câu
trước khi mở.

- **QR của đoạn này khác QR vào game**: `…/fear` là bàn phím, `…/` là tay cầm. Cùng một server.
- Máy chiếu mở muộn hay reload giữa đoạn phim vẫn **nhảy vào đúng khúc** chứ không chiếu lại từ đầu.
- Chữ gõ giống nhau được gom về một (`Sợ sai`, `sợ sai!`, `Sợ  sai` là một), giữ chữ người gõ đầu tiên.
- Mặc định đoạn này **tắt**: server khởi động lại giữa buổi (gói free ngủ dậy) thì máy chiếu về
  phòng chờ của game, không nhảy ngược về màn mở đầu đã diễn xong.
- Chữ nằm trong RAM. Server ngủ dậy là mất — không sao, vì lúc đó đoạn này đã chạy xong rồi.
- **Bỏ qua đoạn này** để về thẳng phòng chờ, **Xoá hết chữ** để tập lại từ đầu.

## Luồng mỗi câu

1. **Đọc đề** (10s): màn chiếu chỉ hiện câu hỏi — chưa có đáp án, chưa có đồng hồ trả lời. Cả hội trường đọc xong cùng lúc rồi mới tới lượt bấm, nên ai đọc chậm không bị mất lượt vì người khác bấm trước. MC bấm **Mở đáp án ngay** để cắt ngắn. Sửa độ dài ở ô *Đọc câu hỏi (giây)* trong trình sửa câu hỏi (`readSeconds`).
2. **Câu hỏi** (15s): 4 đáp án màu hiện ra đúng chỗ đã chừa sẵn, đồng hồ bắt đầu chạy, màn chiếu đếm số người đã trả lời. Mọi người chọn trên điện thoại. **Chưa ai biết đúng sai**: điện thoại chỉ báo "Đã chọn". Khi mọi người đang kết nối đều đã chọn, câu hỏi đóng sau 1,5 giây.
3. **Đáp án** (5s): màn chiếu tô đáp án đúng, số người chọn từng ô và Top 5. Điện thoại báo Chính xác (+điểm, combo) / Chưa đúng / Hết giờ.
4. **Chuyển cảnh sang đấu trường, BẮN** (6s): ai trả lời đúng thì điện thoại hiện nút **BẮN!** to, **chạm liên tục** để ụ của mình bắn; cả hội trường bắn cùng lúc. Ai sai hoặc hết giờ thì Quái Vật phản đòn vào ụ đó (ụ bốc khói, lượt này không bắn được).
4. **Ngưng bắn** 2 giây rồi sang câu tiếp.

Tắt **Tự chuyển** thì game dừng ở bước 2 và sau bước 3, chờ admin bấm nút trên bảng điều khiển.

- **Máu Quái Vật** là chung cả phòng, tính bằng phát bắn: `số người lúc bắt đầu × số câu × 24`. Nhưng **các câu thường chỉ trừ được tối đa xuống 15% máu** — tap nhanh cỡ nào boss cũng không chết giữa game. 15% cuối dành cho màn kết.
- Server nhận tối đa **12 tap/giây mỗi người**; điện thoại gom tap gửi 4 lần/giây. Tap không cộng điểm xếp hạng, chỉ trừ máu boss.

## Màn kết: câu đố vui + kamehameha

Hết 15 câu kiến thức là tới màn cuối, chạy tự động theo 4 bước:

1. **Câu đố vui** (`final`): một câu đố cho vui, **không tính điểm**, đọc từ khối `finale` trong `data/questions.json`. Đáp án giữ nguyên thứ tự A/B/C/D như file (không xáo), vì câu chốt thường nằm ở một chữ cái cụ thể.
2. **Đáp án** (`finalreveal`): màn chiếu hiện ai đoán gì, giống một reveal bình thường.
3. **Tích nước** (`charge`): **cả hội trường** cùng tap — kể cả người trả lời sai. Mỗi tap đổ nước vào một bình chung trên màn chiếu; bình sáng dần từ dưới lên, qua 90% thì rung và phát hào quang. Mục tiêu = `max(300, số người online × 25)` lượt tap.
4. **Đòn kết liễu** (`unleash`, 9 giây): tia nước dựng lên, nổ vào Quái Vật, boss quằn quại mấy giây rồi gục. Xong là bảng xếp hạng: Top 5 kèm **số lượt tap của từng người**, và tổng lượt tap của cả hội trường.

Hai lối thoát cho MC nếu hội trường vắng hoặc tap không tới:

- Bình **tự đầy sau 45 giây** (`chargeSeconds` trong `data/questions.json`).
- Nút **💧 Nạp đầy bình ngay** trên bảng điều khiển, hiện sẵn suốt màn tích nước.

Bỏ khối `finale` khỏi `data/questions.json` thì game quay lại kiểu cũ: hết câu là vào thẳng bảng xếp hạng.
- **Âm thanh** phát từ cửa sổ màn game (trình duyệt chỉ mở tiếng sau lần bấm phím/chuột đầu tiên trên cửa sổ đó, ví dụ lúc bấm F). Điện thoại rung nhẹ khi chạm (Android).

## Điện thoại vào phòng

1. Quét QR → **bảng hướng dẫn 4 bước tự mở ngay**, không phải bấm gì. Đọc xong bấm "Đã hiểu" là
   tới ô nhập tên; nút trên đó đổi thành **Xem lại hướng dẫn** cho ai muốn coi lại. Máy vào lại
   giữa ván (mất mạng, lỡ tắt trình duyệt) thì không bị chặn bởi bảng này.
2. Nút **Vào chơi** mở khoá ngay khi con Buddy tải xong (45 KB); ba tấm sprite nặng hơn tải tiếp ở
   nền, có thanh tiến trình ngay dưới nút để người ta biết máy đang chạy chứ không treo. Hướng dẫn
   mở trước khi hình về tới thì chữ vẫn đọc được, chỉ ô hình chờ và đồng hồ chưa chạy.
3. Nhập tên → **đoạn phim vào phòng** (ụ súng mang tên bạn hiện ra).
4. Trong lúc chờ MC bấm bắt đầu, dưới màn hình có **hàng 5 icon cáo** — thả cái nào thì cả hội
   trường thấy cáo đó bay lên trên máy mình, **và icon đó nhảy lên ngay trên ụ súng mang tên
   người thả** ở màn chiếu lẫn khung xem trước của MC. Chỉ mở ở phòng chờ; game bắt đầu là hàng
   icon biến mất để không ai bấm nhầm lúc đang cần chọn đáp án.

Server gom icon nửa giây một lượt rồi mới đẩy đi, mỗi người tối đa ~1,6 icon/giây, nên cả trăm
điện thoại cùng nghịch cũng không làm nghẽn đường truyền của chính buổi chơi. Thứ tự icon nằm ở
`REACTIONS` trong [src/config.js](src/config.js) — server đẩy đi chỉ số trong mảng đó, thêm thì
thêm vào cuối.

## Vật phẩm

Mỗi người có 1 bộ 3 món khi game bắt đầu, mỗi món dùng 1 lần, khay nằm **trên đầu màn điện thoại** ngay tầm mắt trước khi chọn đáp án (ẩn khi đang bắn); tên và điểm của mình lùi xuống đáy. Món nào còn dùng được thì viền cam. Server chấm hiệu ứng.

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
- **Ổ đĩa là tạm.** Câu hỏi MC sửa trên `/host` ghi vào `data/questions.json` trong container;
  container ngủ dậy hay deploy lại là file về đúng bản trong repo. Muốn sửa xong là còn mãi thì
  nối Supabase ở mục dưới.
- Region `singapore` cho ping từ VN thấp nhất (~30-60ms).

## Giữ bộ câu hỏi bằng Supabase

Chỉ cần khi chạy trên hosting và muốn sửa câu hỏi trực tiếp trên `/host`. Không đặt hai biến
dưới đây thì mọi thứ chạy y như cũ, đọc ghi thẳng `data/questions.json`.

1. [supabase.com](https://supabase.com) → **New project** (free), region Singapore.
2. Vào **SQL Editor**, chạy:

   ```sql
   create table if not exists quiz_bank (
     id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table quiz_bank enable row level security;
   ```

   Bật RLS mà không thêm policy nào là đúng ý: chỉ service key (bỏ qua RLS) đọc ghi được, khoá
   `anon` công khai không đụng tới bảng này được.

3. **Project Settings → API Keys**, lấy:
   - Project URL → `SUPABASE_URL` (dạng `https://xxxx.supabase.co`)
   - `service_role` secret → `SUPABASE_KEY`
4. Trên Render: **Environment** → thêm hai biến đó → service tự deploy lại.

Từ đây bấm **Lưu** trong bảng điều khiển là bộ câu hỏi nằm trên Supabase. Server khởi động sẽ kéo
bản đó về; lần đầu bảng còn trống thì nó đẩy bản trong repo lên làm bản gốc. Supabase lỗi lúc lưu
thì server báo lỗi và **không đổi gì cả** — bộ câu hỏi đang chạy vẫn nguyên vẹn. Supabase chết lúc
khởi động thì server vẫn lên, chạy tạm bản trong repo và in cảnh báo.

`SUPABASE_KEY` là service key, bỏ qua mọi RLS — chỉ để trong biến môi trường, đừng commit và
đừng để lọt vào code chạy ở trình duyệt.

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

Hai cách: sửa file [data/questions.json](data/questions.json), hoặc bấm **Sửa câu hỏi** trong bảng
điều khiển `/host`. Sửa xong bấm **Bắt đầu / Chơi lại** là áp dụng, không cần tắt server. Chạy trên
hosting thì xem mục [Giữ bộ câu hỏi bằng Supabase](#giữ-bộ-câu-hỏi-bằng-supabase) để bản sửa không
mất khi server ngủ dậy.

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
fear.html            bàn phím gõ nỗi sợ (mở màn)       → src/fear.js, src/fear.css
src/fear-cloud.js    đám mây chữ + đoạn phim triệu hồi Quái Vật (vẽ trên máy chiếu)
sandbox.html         bản swarm cũ         → src/main.js
src/arena-view.js    vẽ đấu trường trên máy chiếu: ụ súng, bảng tên, boss, đạn, phản đòn
src/arena-scene.js   nền pixel của đấu trường, vẽ Canvas một lần
src/config.js        sprite, bố cục 108 ụ, thứ tự xếp ụ, màu/hình 4 đáp án, vật phẩm
src/guide-clips.js   4 clip hướng dẫn trên màn vào game
src/sprites.js       đọc sprite SVG/PNG dạng lưới
ASSETS.md            spec và cách thay sprite
```

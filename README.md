# Buddy vs Quái Vật Dễ Sợ 🦊

Game quiz đánh boss cho event. Laptop của admin xuất **hai màn hình**: màn laptop là **bảng điều khiển** để theo dõi, máy chiếu **chỉ hiện game**. Điện thoại là tay cầm kiểu Kahoot.

- **Bảng điều khiển (`/host`, màn laptop):** mọi nút điều khiển, câu hỏi hiện tại kèm **đáp án đúng** (chỉ admin thấy), số người chọn từng ô theo thời gian thực, máu boss, phát bắn và tốc độ bắn, trạng thái máy chiếu (đã kết nối hay chưa), danh sách người chơi (online, ụ, đúng/sai câu này, điểm), nhật ký hoạt động, tiến trình 15 câu và khung **xem trước** đúng những gì máy chiếu đang hiện.
- **Màn game (`/screen`, máy chiếu):** không có nút nào. Thiết kế cố định **1920 × 1080**, tự co giãn vừa mọi màn hình (dư thì viền đen). Đấu trường ngang: Quái Vật Dễ Sợ bay trên lò phản ứng ở trên, bên dưới là **108 ụ súng** (6 hàng × 3 dãy, mỗi dãy 6 ụ, có 2 lối đi). Mỗi ụ có bảng tên người chơi. Nền pixel vẽ một lần trong [src/arena-scene.js](src/arena-scene.js); toạ độ ụ, lối đi, boss nằm trong `ARENA` ở [src/config.js](src/config.js).
- **Điện thoại (`/`):** gõ **domain mail công ty** (phần trước @, ví dụ `khang.pham2`) là có ngay một ụ (xếp từ giữa các hàng gần boss ra ngoài). Domain đó là khoá để nhận [phần thưởng chiến dịch 7 ngày](#phần-thưởng-chiến-dịch-7-ngày). Khi có câu hỏi, điện thoại chỉ hiện **4 ô màu + hình (A ▲ đỏ, B ◆ xanh dương, C ● vàng, D ■ xanh lá)**, không có chữ; câu hỏi và nội dung đáp án đọc trên màn hình lớn. Tối đa 108 người có ụ; người thứ 109 trở đi vẫn chơi, có điểm và bắn từ chân lối đi.

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
màn hình hỏi *"CHÚNG TA NÊN LÀM GÌ ĐỂ CHIẾN ĐẤU VỚI NỖI SỢ ĐÂY? — Hãy cùng đón xem nhé!"*. Đó là tấm nền
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
4. **Đòn kết liễu** (`unleash`, 5,5 giây): bình vừa đầy là **phim chạy ngay**, không chờ gì cả — cáo ném bình, nước nổ tung vào Quái Vật (**ÀO!**), nỗi sợ xèo thành vũng khói ướt (**XÈO…**). Phim có tiếng. Hết phim là vào thẳng clip cả đội cáo ăn mừng, rồi bảng xếp hạng: Top 5 kèm **số lượt tap của từng người**, và tổng lượt tap của cả hội trường. Điện thoại nhắc mọi người nhìn lên màn chiếu.

Hai lối thoát cho MC nếu hội trường vắng hoặc tap không tới:

- Bình **tự đầy sau 45 giây** (`chargeSeconds` trong `data/questions.json`).
- Nút **💧 Nạp đầy bình ngay** trên bảng điều khiển, hiện sẵn suốt màn tích nước.
- Ô **💧 Số tap để đầy bình** trên bảng điều khiển: để trống là tự động (`max(300, số người online × 25)`), gõ một con số là cố định. Đổi được cả lúc hội trường đang tap — bình trên màn chiếu co giãn theo ngay, hạ xuống dưới số đã tap thì bình đầy luôn. Con số nằm trong RAM: server khởi động lại thì về tự động.

Bỏ khối `finale` khỏi `data/questions.json` thì game quay lại kiểu cũ: hết câu là vào thẳng bảng xếp hạng.
- **Âm thanh** phát từ cửa sổ màn game (trình duyệt chỉ mở tiếng sau lần bấm phím/chuột đầu tiên trên cửa sổ đó, ví dụ lúc bấm F). Điện thoại rung nhẹ khi chạm (Android).
- **Nhạc nền kiểu Kahoot** ([src/music.js](src/music.js)), tự tổng hợp bằng Web Audio nên không có file nhạc nào: phòng chờ và bảng vinh danh có nhạc sảnh chờ vui nhộn; lúc đọc đề có tiếng tích tắc + bass, lúc trả lời thêm marimba và trống, 5 giây cuối trống dồn. Lật đáp án có tiếng "ta-da", đếm ngược giữa các câu có tiếng bíp. Lúc bắn và lúc chiếu phim thì im để nghe rõ tiếng bắn/tiếng phim. Nút **♪ Nhạc** trên bảng điều khiển tắt/bật ngay lập tức (ví dụ khi MC cần nói). Trình duyệt chặn tiếng tới khi có người bấm vào cửa sổ máy chiếu: lúc đó màn chiếu hiện dòng nhắc *"🔇 Bấm vào màn hình…"* ở góc dưới, và thanh trên bảng điều khiển báo vàng **"Màn chiếu chưa có tiếng"** — bấm vào màn chiếu một lần (hoặc nhấn F) là xong.

## Điện thoại vào phòng

1. Quét QR → **bảng hướng dẫn 4 bước tự mở ngay**, không phải bấm gì. Đọc xong bấm "Đã hiểu" là
   tới ô nhập tên; nút trên đó đổi thành **Xem lại hướng dẫn** cho ai muốn coi lại. Máy vào lại
   giữa ván (mất mạng, lỡ tắt trình duyệt) thì không bị chặn bởi bảng này.
2. Nút **Vào chơi** mở khoá ngay khi con Buddy tải xong (45 KB); ba tấm sprite nặng hơn tải tiếp ở
   nền, có thanh tiến trình ngay dưới nút để người ta biết máy đang chạy chứ không treo. Hướng dẫn
   mở trước khi hình về tới thì chữ vẫn đọc được, chỉ ô hình chờ và đồng hồ chưa chạy.
3. Gõ **domain** của mình → **đoạn phim vào phòng** (ụ súng mang tên bạn hiện ra). Nếu MC đã nạp
   danh sách chiến dịch thì ngay dưới ô nhập hiện những vật phẩm bạn sắp cầm vào trận; gõ lệch thì
   nó gợi ý đúng domain để chạm một cái là sửa xong. Tên trong trận (bảng tên ụ súng, Top 5) luôn
   là **đúng domain bạn gõ** — danh sách chỉ dùng để biết ai được nhận thưởng.
4. Trong lúc chờ MC bấm bắt đầu, dưới màn hình có **hàng 5 icon cáo** — thả cái nào thì cả hội
   trường thấy cáo đó bay lên trên máy mình, **và icon đó nhảy lên ngay trên ụ súng mang tên
   người thả** ở màn chiếu lẫn khung xem trước của MC. Chỉ mở ở phòng chờ; game bắt đầu là hàng
   icon biến mất để không ai bấm nhầm lúc đang cần chọn đáp án.

Server gom icon nửa giây một lượt rồi mới đẩy đi, mỗi người tối đa ~1,6 icon/giây, nên cả trăm
điện thoại cùng nghịch cũng không làm nghẽn đường truyền của chính buổi chơi. Thứ tự icon nằm ở
`REACTIONS` trong [src/config.js](src/config.js) — server đẩy đi chỉ số trong mảng đó, thêm thì
thêm vào cuối.

## Vật phẩm

Vật phẩm là phần thưởng của [chiến dịch 7 ngày](#phần-thưởng-chiến-dịch-7-ngày) trên platform: mỗi người vào trận với đúng những món mình đã kiếm được, mỗi món dùng 1 lần (chưa nạp danh sách chiến dịch thì cả phòng đủ 3 món). Khay khay nằm **trên đầu màn điện thoại** ngay tầm mắt trước khi chọn đáp án (ẩn khi đang bắn); tên và điểm của mình lùi xuống đáy. Món nào còn dùng được thì viền cam. Server chấm hiệu ứng.

| Vật phẩm | Dùng lúc | Tác dụng |
|---|---|---|
| Buddy thông thái | Đang có câu hỏi, chưa chọn | Loại 2 ô sai trên điện thoại của bạn |
| Khiên Research Lab | Bất kỳ lúc nào trong game | Bật sẵn tới lần sai/hết giờ kế tiếp: ụ không bị phản đòn, giữ combo |
| Súng giọt tự tin | Bất kỳ lúc nào trong game | Bật sẵn tới câu đúng kế tiếp: x2 điểm, mỗi tap bắn x2 sát thương |

Khiên và súng đang bật hiện trên ụ của người đó ở màn chiếu. Món chưa kiếm được ở chiến dịch hiện
ổ khoá 🔒 và mờ hẳn, khác với món đã dùng hết.

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
| `http://localhost:5173/sandbox` | **Fox Swarm** — màn chơi roguelike kiểu Vampire Survivors, cũng là chỗ test sprite |

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

## Phần thưởng chiến dịch 7 ngày

Trên platform học tập đang chạy chiến dịch 7 ngày, và vật phẩm trong game chính là phần thưởng
của chiến dịch đó:

| Làm được gì trên platform | Nhận vật phẩm |
|---|---|
| Đăng nhập tới **ngày 3** | Buddy thông thái — loại 2 đáp án sai |
| Đăng nhập tới **ngày 5** | Súng giọt tự tin — câu đúng kế tiếp x2 điểm, x2 đạn |
| **Có tạo bảng câu hỏi** | Khiên Research Lab — đỡ 1 lần sai, giữ combo |

Đó là lý do ô nhập tên hỏi **domain mail công ty** chứ không hỏi biệt danh: phần trước dấu @ của
`khang.pham2@mservice.com.vn` hay `khang.pham2@momo.com.vn` — cùng một `khang.pham2` — là khoá
nối người đang cầm điện thoại với dòng của họ trong bản xuất chiến dịch.

Dev xuất danh sách, MC dán vào thẻ **🎁 Phần thưởng** trên bảng điều khiển, và từ đó ai gõ đúng
domain là nhận đúng những món mình đã kiếm được.

### Nạp danh sách

Dán được: cả bảng copy từ Excel (ngăn bằng tab), file CSV tải về, hay chỉ một cột địa chỉ. Server
tự tìm cột:

- **địa chỉ** — đọc được cả `khang.pham2@momo.com.vn`, `khang.pham2` lẫn `Phạm Khang <khang.pham2@momo.com.vn>`;
- **tên** và **phòng ban** — chỉ hiện cho MC ở thẻ Phần thưởng và trong CSV; trong trận vẫn hiện domain người chơi gõ;
- **số ngày đăng nhập** (`ngày`, `days`, `streak`, `đăng nhập`, `check-in`…) → suy ra Buddy và Súng;
- **đã tạo bảng câu hỏi** (`bảng câu hỏi`, `quiz`, `created`…) → suy ra Khiên. Ô nào ghi `1`, `x`,
  `có`, `TRUE` đều tính là có; `0`, `không`, `no`, ô trống là không.

Dev tính sẵn thành ba cột vật phẩm (`Buddy thông thái`, `Khiên`, `Súng giọt tự tin`) cũng được —
có cột tính sẵn thì nghe cột đó, không suy lại từ số ngày.

Ví dụ một bản xuất đọc được:

```csv
Email,Họ tên,Số ngày đăng nhập,Đã tạo bảng câu hỏi,Phòng ban
khang.pham2@mservice.com.vn,Phạm Khang,7,x,Learning Hub
huong.nguyen@momo.com.vn,Nguyễn Thị Thanh Hương,5,,Research Lab
duc.anh@mservice.com.vn,Đức Anh,3,có,Data Platform
```

→ Khang đủ 3 món; Hương được Buddy + Súng (không tạo bảng câu hỏi nên không có Khiên); Đức Anh
được Buddy + Khiên (ngày 3 chưa tới mốc của Súng).

### Nạp lúc nào

| Nạp lúc nào | Được gì |
|---|---|
| **Trước buổi** (nên làm) | Điện thoại soát domain ngay lúc người ta gõ: đúng thì hiện **những món sắp cầm vào trận**, lệch thì gợi ý đúng domain để chạm một cái là sửa |
| **Giữa phòng chờ** | Ai đang ngồi trong phòng cũng được cập nhật lại khay vật phẩm ngay, không cần vào lại |
| **Sau khi game đã bắt đầu** | Suất mới chỉ áp cho ván sau: không ai bị lấy lại món vừa dùng, cũng không ai được phát thêm giữa ván |

### Khi máy không dò ra

Trước khi so, mọi chuỗi đều được đưa về một dạng: bỏ dấu tiếng Việt, viết thường, cắt phần sau @,
đổi dấu cách thành dấu chấm, bỏ ký tự lạ. Nên `Khang.Pham2@momo.com.vn`, `KHANG PHAM2` và
`khang.phạm2` đều là `khang.pham2`. Máy tự nhận ba kiểu:

- **khớp** — gõ đúng y.
- **khớp khi bỏ dấu chấm** — `khangpham2` về `khang.pham2`, chỉ nhận khi trong cả danh sách không
  còn ai khác trùng khoá.
- **MC ghép tay** — dòng chưa ghép hiện sẵn mấy cái tên gần giống kèm số vật phẩm của họ để bấm
  một phát, hoặc gõ tên người vào ô tìm (gõ "Thu Thảo" cũng ra). Ghép xong là vật phẩm về tay
  người chơi ngay. Trùng ai đó đã ghép rồi thì server từ chối.

**Không có gì chặn ai ở cửa.** Gõ một domain không có trong danh sách vẫn vào chơi được ngay — chỉ
là vào tay trắng, dòng chữ dưới ô nhập nhắc một câu, và nhật ký của MC ghi lại để còn ghép tay.
Trên điện thoại, món chưa kiếm được hiện ổ khoá 🔒 và mờ đi, khác hẳn món đã dùng hết, để không ai
ngồi chờ một thứ mình chưa từng có.

Hai cái mốc an toàn, để một file quên nạp không biến thành cả hội trường tay trắng:

- **Chưa nạp danh sách** → cả phòng nhận đủ 3 món, y như trước khi có tính năng này.
- **Nạp file không có cột phần thưởng nào** (chỉ là danh sách tên) → có tên trong danh sách là đủ
  3 món. Bảng điều khiển nói rõ nó đang chạy kiểu nào.

Con số cam trên nút **🎁 Phần thưởng** là số người MC còn sửa được: gõ sai domain nên chưa ghép ra
ai. Người ghép được mà tay trắng thì đúng luật chiến dịch rồi, không phải việc để MC chạy theo.

### Vào lại và trùng domain

- **Vào lại là về đúng chỗ cũ.** Máy hết pin, lỡ tắt trình duyệt, quét lại QR — gõ đúng domain cũ
  là nhận lại ụ, điểm và vật phẩm của chính mình (chỉ khi máy cũ đã rớt mạng).
- **Hai máy cùng một domain** thì vẫn cho chơi nhưng nhật ký cảnh báo, và bảng ghép đánh dấu dòng
  đó để MC biết mà xử lý.

### Sau buổi

**Tải CSV** có `domain` (người ta tự gõ) cạnh `campaign_email`, `campaign_name`, `campaign_unit`,
`match`, `login_days` và ba cột `got_hint` / `got_shield` / `got_boost` — giữ cả hai đầu để soát
lại được ai đã cầm gì vào trận, chứ không phải tin một cột đã bị sửa.

### Danh sách nằm ở đâu

`data/roster.json`, **không nằm trong repo** (đây là dữ liệu người học, `.gitignore` đã chặn).
Chạy trên hosting thì nó lưu lên Supabase cùng bảng với bộ câu hỏi, ở dòng `<SUPABASE_ROW>:roster`,
nên container ngủ dậy vẫn còn — xem [Giữ bộ câu hỏi bằng Supabase](#giữ-bộ-câu-hỏi-bằng-supabase),
không cần tạo thêm bảng nào.

Đường `/api/lookup` mà điện thoại gọi là đường công khai (ai quét được QR là gọi được), nên nó chỉ
xác nhận cái người ta đã gõ gần đúng sẵn: gợi ý chỉ hiện khi lệch một hai ký tự, tối đa 3 cái, và
mỗi máy tối đa 60 lượt một phút. Nó không bao giờ trả về một danh sách để dò dần.

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
| **Tải CSV**, **Reset** | Xuất điểm từng người (kèm domain, người trong chiến dịch, vật phẩm đã nhận và số phát bắn), về phòng chờ |
| **🎁 Phần thưởng** | Nạp bản xuất chiến dịch 7 ngày để phát vật phẩm, và ghép tay ai gõ sai domain. Con số cam trên nút là số người chưa ghép được nên đang tay trắng |
| Ô chọn link (khi laptop có nhiều mạng) | Đổi link và QR mà màn game hiển thị |

Người chơi trên laptop: phím 1–4 chọn đáp án, Space/Enter để bắn.

## Checklist trước event

- Laptop và điện thoại **chung một wifi**. Lần đầu chạy, Windows hỏi quyền mạng cho Node → chọn **Allow** (Private network).
- Test bằng 2–3 điện thoại thật: quét QR → vào được → trả lời → tap bắn được.
- Wifi công ty hay **chặn các máy nói chuyện với nhau** (client isolation). Nếu điện thoại không vào được: thử link khác trong ô chọn link trên bảng điều khiển, hoặc phát hotspot từ một điện thoại/router riêng rồi cho laptop + khán giả vào đó.
- Test đủ bộ hai màn hình: bảng điều khiển trên laptop, màn game fullscreen trên máy chiếu, có tiếng.
- Lượt bắn gửi nhiều request (mỗi người ~4 request/giây trong 6 giây): nên thử với nhiều máy trên đúng wifi event.
- Kết thúc game bấm **Tải CSV** để lấy danh sách điểm và đáp án từng người (trao quà Top 5).
- Có danh sách chiến dịch trước buổi thì nạp sẵn ở **🎁 Phần thưởng**: không nạp là cả phòng nhận
  đủ 3 món thay vì đúng suất đã kiếm, và điện thoại cũng không soát được domain lúc người ta gõ.

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
- `readSeconds`, `timePerQuestion`, `revealSeconds`, `fireSeconds`, `shuffleOptions`: thời gian đọc đề, trả lời, hiện đáp án, lượt bắn, có đảo đáp án không.
- `breakSeconds`: quãng nghỉ sau lượt bắn để hội trường chuẩn bị, trước khi câu sau hiện ra (mặc định 5 giây, thấp nhất 1). MC chỉnh ngay trong **Sửa câu hỏi → Nghỉ chuẩn bị**.

File này không tải được từ trình duyệt nên người chơi không xem trộm đáp án được.

## Fox Swarm (`/sandbox`)

Màn chơi một người kiểu **Vampire Survivors**: cáo chỉ chạy, mọi chiêu tự đánh. Sống càng lâu quái
càng đông; mỗi lần lên cấp chọn 1 trong 3 (4 nếu có Vận May Lv.3). Số liệu nằm gọn trong
[src/entities.js](src/entities.js) — sửa bảng là đổi cân bằng, không phải sửa logic.

**9 chiêu** (mang tối đa 6 cùng lúc). Chiêu đã kịch trần + perk đi kèm đạt Lv.3 thì hiện thêm lựa
chọn **tiến hoá** viền vàng, đổi hẳn cách đánh:

| Chiêu | Đánh thế nào | Perk cần | Tiến hoá |
|---|---|---|---|
| 🔥 Hỏa Hồ | Cầu lửa tự tìm quái gần nhất | Uy Lực | 🌋 Cửu Vĩ Hỏa — cầu lửa nổ lan |
| 🔮 Ngọc Linh | Cầu xoay quanh cáo | Bao Phủ | 🌙 Nguyệt Luân — hai vành ngược chiều |
| 🌀 Quét Đuôi | Nổ sát thương quanh mình, đẩy lùi | Tốc Chiêu | 🌪️ Bão Đuôi — quẫy hai vòng, gây choáng |
| 🐾 Vuốt Gió | Vệt vuốt hình quạt về hướng đang quay mặt | Uy Lực | ⚔️ Song Trảo — bổ cả hai bên |
| ⚡ Thiên Lôi | Sét giáng xuống quái ngẫu nhiên | Vận May | 🌩️ Lôi Vũ — nảy sang 2 con, luôn chí mạng |
| ❄️ Băng Vụn | Chùm mảnh băng xuyên, làm chậm | Bội Kích | 🌨️ Bão Tuyết — mảnh vỡ ra tiếp |
| 🌟 Hồ Quang | Vầng sáng đốt liên tục quanh cáo | Bao Phủ | 👁️ Nuốt Hồn — đốt trúng thì hút máu |
| 🏮 Đèn Hồ Ly | Thả vũng lửa xuống đất | Hồi Máu | 🔆 Hỏa Ngục — vũng lửa nổ khi tắt |
| 🎴 Lá Bùa | Bay vòng ra rồi quay về tay | Chân Gió | 💮 Bùa Truy Hồn — tự bám theo quái |

**13 perk** (mang tối đa 6): Uy Lực, Tốc Chiêu, Bao Phủ, Bội Kích, Chân Gió, Sinh Lực, Giáp Vảy,
Hồi Máu, Nam Châm, Vận May, Học Nhanh, Lướt Gió, và Cửu Mệnh — gục một lần rồi đứng dậy với 50% máu.

**14 loại quái.** Nhớt xanh/tím/đá chỉ biết lao thẳng; dơi bay zíc zắc; bóng ma xuyên qua cây cối;
heo lòi lùi lại lấy đà rồi húc; cóc độc và cướp bắn cung đứng xa nhả đạn — đạn của quái phải né bằng
tay; nấm nổ chết là nổ, đứng gần thì cáo cũng ăn.

**Băng cướp** là nhánh riêng: cướp thường lao vào, cướp bắn cung kèo xa, **Cướp Đầu Gấu** là elite có
thanh máu, **Đầu Lĩnh Cướp** bắn nguyên vòng đạn 8 hướng và gọi thêm quân. Riêng **Cướp Áp Tải** ôm
rương bỏ chạy — đuổi kịp trong 20 giây thì được rương, nâng thẳng 2–3 cấp chiêu; không kịp thì nó mất hút.

**Lịch ra quái** trong [src/swarm.js](src/swarm.js): 90 giây đầu chỉ có quái chậm hơn cáo để còn kịp
build, sau đó cứ vài chục giây một màn — bầy dơi, băng cướp phục kích, chuyến áp tải, hàng nấm nổ,
Quái Khói, rồi Đầu Lĩnh Cướp ở phút 5. Hết lịch thì các màn đó quay vòng 45 giây một lần, quái khoẻ dần.

Đồ rơi: ngọc EXP, vàng, tim hồi máu, 🧲 hút sạch ngọc trên màn, 💣 nổ sạch quái đang thấy.

Phím tắt khi test: <kbd>H</kbd> hitbox · <kbd>B</kbd> gọi Quái Khói · <kbd>N</kbd> gọi Đầu Lĩnh ·
<kbd>K</kbd> xuất sprite · <kbd>Esc</kbd> tạm dừng (có luôn danh sách đang mang).

## Cấu trúc

```
server.js            server quiz: câu hỏi → đáp án → bắn, chấm điểm, nhận tap, đẩy realtime (SSE), không dependency
data/questions.json  bộ câu hỏi + đáp án
host.html            bảng điều khiển admin (màn laptop) → src/host.js, src/host.css
screen.html          màn game 1920×1080 (máy chiếu)    → src/screen.js, src/screen.css
index.html           tay cầm điện thoại                → src/play.js, src/play.css
src/identity.js      chuẩn hoá domain, đọc bản xuất chiến dịch, luật phần thưởng, dò ghép (dùng chung server + trình duyệt)
data/roster.json     danh sách chiến dịch đã nạp (không có trong repo, sinh ra khi MC dán vào)
fear.html            bàn phím gõ nỗi sợ (mở màn)       → src/fear.js, src/fear.css
src/fear-cloud.js    đám mây chữ + đoạn phim triệu hồi Quái Vật (vẽ trên máy chiếu)
sandbox.html         Fox Swarm, bản roguelike kiểu Vampire Survivors → src/main.js
src/entities.js      số liệu của Fox Swarm: 9 chiêu + tiến hoá, 13 perk, 14 loại quái, class Player/Enemy
src/weapons.js       9 chiêu bắn ra cái gì, đạn/vũng lửa/sét bay thế nào, vẽ hiệu ứng
src/swarm.js         AI từng loại quái, lịch ra quái theo phút, băng cướp, rương và đồ rơi
src/draw.js          mấy hàm vẽ dùng chung cho Fox Swarm (chữ pixel, bóng, thanh máu)
src/arena-view.js    vẽ đấu trường trên máy chiếu: ụ súng, bảng tên, boss, đạn, phản đòn
src/arena-scene.js   nền pixel của đấu trường, vẽ Canvas một lần
src/config.js        sprite, bố cục 108 ụ, thứ tự xếp ụ, màu/hình 4 đáp án, vật phẩm
src/guide-clips.js   4 clip hướng dẫn trên màn vào game
src/sprites.js       đọc sprite SVG/PNG dạng lưới
ASSETS.md            spec và cách thay sprite
```

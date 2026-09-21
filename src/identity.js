// Nối mỗi người chơi với suất phần thưởng họ đã kiếm được ở chiến dịch 7 ngày trên platform.
//
// Ô nhập tên không hỏi biệt danh: hội trường gõ phần trước @ của mail công ty
// ("khang.pham2" của khang.pham2@mservice.com.vn hoặc @momo.com.vn). Đó là khoá duy nhất
// nối ván chơi này với bản xuất danh sách chiến dịch mà dev gửi sang.
//
// Người ta gõ sai đủ kiểu: dán nguyên địa chỉ, viết hoa, gõ dấu tiếng Việt, gõ dấu cách thay dấu
// chấm, thừa khoảng trắng do autocorrect. Mọi chỗ chạm vào chuỗi đó — điện thoại, server, bảng
// ghép của MC — đều đi qua normalizeDomain() trước, nên ba nơi luôn nghĩ giống nhau.
//
// Module này thuần tính toán, không đụng mạng và không đụng file: server.js import nó như một
// module Node, còn play.js và host.js import nó thẳng vào trình duyệt.

// Hai tên miền của công ty. Dán địa chỉ đầy đủ ở đâu cũng được, phần sau @ bị cắt bỏ.
export const MAIL_DOMAINS = ['mservice.com.vn', 'momo.com.vn'];

// "Phạm" và "Pham" là một người: LMS xuất ra không dấu, người gõ thì có bộ gõ đang bật.
const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// Chuỗi người ta gõ → khoá chính tắc. Trả về '' nếu không còn gì dùng được.
export function normalizeDomain(raw) {
  let s = deaccent(String(raw ?? '')).trim().toLowerCase();
  // Outlook copy ra "Khang Phạm <khang.pham2@momo.com.vn>"; lấy phần trong ngoặc trước, không thì
  // cái tên đằng trước cũng bị gộp vào thành một domain không có thật.
  s = /<([^>]*@[^>]*)>/.exec(s)?.[1].trim() ?? s;
  s = s.replace(/^@+/, '');
  const at = s.indexOf('@');
  if (at >= 0) s = s.slice(0, at);
  // Dấu cách, phẩy, gạch đứng đều là chỗ đáng lẽ phải là dấu chấm ("khang pham2").
  s = s.replace(/[\s,;|]+/g, '.');
  s = s.replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/\.{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '');
  return s.slice(0, 40);
}

// Bỏ nốt dấu chấm/gạch để "khang.pham2", "khangpham2" và "khang_pham2" về cùng một khoá. Chỉ dùng
// để dò, không bao giờ để hiển thị hay ghi xuống CSV.
export const loginKey = domain => normalizeDomain(domain).replace(/[._-]/g, '');

// Nhãn trên bảng tên ụ súng khi LMS chưa cho biết tên thật.
export function prettyName(domain) {
  return normalizeDomain(domain)
    .split('.')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Buddy';
}

export const fullEmail = (domain, mailDomain = MAIL_DOMAINS[0]) => (domain ? `${domain}@${mailDomain}` : '');

// Bảng tên trên ụ súng rộng chừng 18 ký tự rồi cắt bằng dấu "…". "Nguyễn Thị Thanh Hương" cắt máy
// móc thành "Nguyễn Thị T…" thì chủ nhân nó cũng không nhận ra ụ của mình, nên bỏ bớt từ đầu —
// đúng cách người Việt gọi nhau — và giữ lại phần tên.
export function shortName(full, max = 18) {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 2 && words.join(' ').length > max) words.shift();
  return words.join(' ') || 'Buddy';
}

// ---- Phần thưởng của chiến dịch 7 ngày --------------------------------------------------
// Luật của chiến dịch trên platform, chép nguyên sang đây:
//   · đăng nhập tới ngày 3  → Buddy thông thái (loại 2 đáp án sai)
//   · đăng nhập tới ngày 5  → Súng giọt tự tin (câu đúng kế tiếp x2 điểm, x2 đạn)
//   · có tạo bảng câu hỏi   → Khiên Research Lab (đỡ 1 lần sai, giữ combo)
// Bản xuất của dev có thể ghi theo ngày đăng nhập, hoặc đã tính sẵn thành từng cột vật phẩm —
// cột tính sẵn nói gì thì nghe cột đó, không có mới suy từ số ngày.
export const REWARD_DAY = { hint: 3, boost: 5 };

export const NO_ITEMS = { hint: 0, shield: 0, boost: 0 };
export const ALL_ITEMS = { hint: 1, shield: 1, boost: 1 };

const NEGATIVE = new Set(['', '0', 'no', 'n', 'false', 'khong', 'chua', '-', '_', 'na', 'n/a', 'null', 'x0']);
// Bảng tính của người Việt đánh dấu bằng đủ thứ: 1, x, ✔, "có", "đã tạo", "TRUE". Coi là có hết,
// trừ mấy chữ nói thẳng là không.
const truthy = cell => !NEGATIVE.has(deaccent(String(cell ?? '')).trim().toLowerCase());

// ---- Đọc danh sách chiến dịch -----------------------------------------------------------
// Bản xuất mỗi lần một kiểu: file CSV tải về, dán thẳng từ Excel (ngăn bằng tab), hay chỉ một cột
// địa chỉ copy từ mail. Đọc hết, tự đoán cột nào là địa chỉ, cột nào là tên, cột nào là phần thưởng.

function parseTable(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
      continue;
    }
    if (c === '"' && !field) quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter(r => r.some(c => c.trim()));
}

const HEAD_MAIL = /(e-?mail|mail|account|username|user ?name|domain|tài khoản|địa chỉ)/i;
const HEAD_NAME = /(full ?name|display ?name|\bname\b|họ|tên|nhân viên|employee|learner|học viên|người học)/i;
const HEAD_UNIT = /(department|team|unit|division|block|title|position|phòng|ban|bộ phận|khối|chức danh|chức vụ)/i;
// Cột số ngày đăng nhập của chiến dịch — chỗ suy ra Buddy thông thái và Súng giọt tự tin.
const HEAD_DAYS = /(ngày|ngay|streak|chuỗi|\bdays?\b|login|log-?in|đăng nhập|dang nhap|check-?in|điểm danh)/i;
// Cột đánh dấu đã tạo bảng câu hỏi — chỗ suy ra Khiên.
const HEAD_QUIZ = /(bảng câu hỏi|bang cau hoi|bộ câu hỏi|tạo quiz|tao quiz|\bquiz\b|question ?(bank|set)|đề|created)/i;
// Ba cột vật phẩm nếu dev đã tính sẵn giúp.
const HEAD_ITEM = {
  hint: /(buddy|thông thái|thong thai|\bhint\b|gợi ý|goi y)/i,
  shield: /(khiên|khien|shield)/i,
  boost: /(súng|sung|giọt tự tin|giot tu tin|boost|nhân đôi|x ?2)/i,
};

// "Khang Phạm <khang.pham2@momo.com.vn>" — mail client dán ra kiểu này suốt.
function splitAngle(cell) {
  const m = /^(.*?)<([^>]+)>\s*$/.exec(cell);
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), mail: m[2].trim() } : { name: '', mail: cell };
}

export function parseRoster(text) {
  const raw = String(text ?? '');
  const head = raw.slice(0, 4000);
  const counts = ['\t', ',', ';'].map(d => [d, head.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ',';
  const table = parseTable(raw, delim).map(r => r.map(c => c.trim()));
  if (!table.length) return { people: [], columns: null, skipped: 0, duplicates: 0 };

  const width = Math.max(...table.map(r => r.length));
  const at = (r, i) => (r[i] ?? '').trim();
  const head0 = table[0];
  const hasHeader = !head0.some(c => c.includes('@')) && head0.some(c => HEAD_MAIL.test(c) || HEAD_NAME.test(c));
  const body = hasHeader ? table.slice(1) : table;

  const headerCol = re => (hasHeader ? head0.findIndex(c => re.test(c)) : -1);
  const bestCol = (test, skip = -1) => {
    let best = -1;
    let bestHits = 0;
    for (let i = 0; i < width; i++) {
      if (i === skip) continue;
      const hits = body.filter(r => test(at(r, i))).length;
      if (hits > bestHits) { best = i; bestHits = hits; }
    }
    return best;
  };

  let mailCol = headerCol(HEAD_MAIL);
  if (mailCol < 0) mailCol = bestCol(c => c.includes('@'));
  if (mailCol < 0) mailCol = bestCol(c => /^[a-z][a-z0-9._-]{2,}$/i.test(deaccent(c)));
  if (mailCol < 0) mailCol = 0;
  let nameCol = headerCol(HEAD_NAME);
  if (nameCol === mailCol) nameCol = -1;
  if (nameCol < 0) nameCol = bestCol(c => c.includes(' ') && !c.includes('@'), mailCol);
  // Mấy cột dưới đây chỉ nhận ra được khi bản xuất có dòng tiêu đề; không có thì cả danh sách chỉ
  // là "ai có mặt trong chiến dịch", và MC chọn phát gì cho cả nhóm ở bảng điều khiển.
  const taken = new Set([mailCol, nameCol]);
  const pick = re => {
    const i = headerCol(re);
    if (i < 0 || taken.has(i)) return -1;
    taken.add(i);
    return i;
  };
  const daysCol = pick(HEAD_DAYS);
  const itemCols = { hint: pick(HEAD_ITEM.hint), shield: pick(HEAD_ITEM.shield), boost: pick(HEAD_ITEM.boost) };
  const quizCol = pick(HEAD_QUIZ);
  const unitCol = pick(HEAD_UNIT);

  const people = [];
  const seen = new Set();
  let skipped = 0;
  let duplicates = 0;
  for (const r of body) {
    const cell = splitAngle(at(r, mailCol));
    const domain = normalizeDomain(cell.mail);
    if (!domain) { skipped++; continue; }
    if (seen.has(domain)) { duplicates++; continue; }
    seen.add(domain);
    const mail = cell.mail.includes('@') ? deaccent(cell.mail).trim().toLowerCase() : '';
    const days = daysCol >= 0 ? Math.max(0, Math.trunc(Number(at(r, daysCol).replace(/[^\d.-]/g, '')) || 0)) : null;
    const madeQuiz = quizCol >= 0 ? truthy(at(r, quizCol)) : null;
    const item = (key, earned) => (itemCols[key] >= 0 ? Number(truthy(at(r, itemCols[key]))) : Number(earned));
    people.push({
      domain,
      email: mail || fullEmail(domain),
      name: (nameCol >= 0 ? at(r, nameCol) : '') || cell.name || '',
      unit: unitCol >= 0 ? at(r, unitCol) : '',
      days,
      quiz: madeQuiz,
      items: {
        hint: item('hint', days !== null && days >= REWARD_DAY.hint),
        shield: item('shield', madeQuiz === true),
        boost: item('boost', days !== null && days >= REWARD_DAY.boost),
      },
    });
  }
  return {
    people,
    columns: { mail: mailCol, name: nameCol, unit: unitCol, days: daysCol, quiz: quizCol, ...itemCols, header: hasHeader ? head0 : null },
    // Bản xuất có nói gì về phần thưởng không, hay chỉ là một danh sách tên trơn.
    rewards: daysCol >= 0 || quizCol >= 0 || Object.values(itemCols).some(i => i >= 0),
    skipped,
    duplicates,
  };
}

// ---- Dò một chuỗi về danh sách ----------------------------------------------------------

// keys[] đi song song với people[]: dò một chuỗi là quét cả danh sách, mà chuẩn hoá lại vài nghìn
// domain ở mỗi lần quét thì chính nó mới là phần tốn thời gian, chứ không phải phép so.
export function buildIndex(people) {
  const list = Array.isArray(people) ? people : [];
  const byDomain = new Map();
  const byKey = new Map();
  const keys = [];
  for (const person of list) {
    if (!byDomain.has(person.domain)) byDomain.set(person.domain, person);
    const k = loginKey(person.domain);
    keys.push(k);
    if (byKey.has(k)) byKey.get(k).push(person);
    else byKey.set(k, [person]);
  }
  return { people: list, keys, byDomain, byKey, size: byDomain.size };
}

export const EMPTY_INDEX = buildIndex([]);

// Levenshtein có trần: quá trần là bỏ ngay, khỏi chạy hết ma trận.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

// Gõ càng ngắn càng dễ đụng nhầm người khác, nên chuỗi ngắn chỉ cho lệch 1 ký tự.
const slack = key => (key.length <= 6 ? 1 : 2);

// prefix: chỉ bật ở bảng ghép của MC. Ô kiểm tra trên điện thoại là đường công khai, gợi ý rộng ở
// đó là biếu không cả danh bạ công ty cho bất kỳ ai quét được QR.
export function nearest(index, raw, { limit = 3, prefix = false } = {}) {
  const key = loginKey(raw);
  if (key.length < 3) return [];
  const max = slack(key);
  const out = [];
  for (let i = 0; i < index.people.length; i++) {
    const person = index.people[i];
    const other = index.keys[i];
    const d = distance(key, other, max);
    if (d <= max) out.push({ person, d });
    else if (prefix && other.startsWith(key)) out.push({ person, d: max + 1 });
    else if (prefix && other.length >= 4 && key.startsWith(other)) out.push({ person, d: max + 2 });
  }
  return out
    .sort((a, b) => a.d - b.d || a.person.domain.localeCompare(b.person.domain))
    .slice(0, limit)
    .map(o => o.person);
}

// how: 'exact' | 'key' (khớp sau khi bỏ dấu chấm) | 'ambiguous' | 'near' | 'miss' | 'empty' | 'off'.
// Chỉ 'exact' và 'key' là ghép được; còn lại người chơi vẫn vào chơi bình thường và MC ghép tay
// sau — chặn ai đó ở cửa vì gõ lệch một ký tự là hỏng cả buổi.
export function lookup(index, raw, opts = {}) {
  const domain = normalizeDomain(raw);
  if (!domain) return { domain, how: 'empty', person: null, near: [] };
  if (!index.size) return { domain, how: 'off', person: null, near: [] };
  const exact = index.byDomain.get(domain);
  if (exact) return { domain, how: 'exact', person: exact, near: [] };
  const hits = index.byKey.get(loginKey(domain)) ?? [];
  if (hits.length === 1) return { domain, how: 'key', person: hits[0], near: [] };
  if (hits.length > 1) return { domain, how: 'ambiguous', person: null, near: hits.slice(0, opts.limit ?? 3) };
  const near = nearest(index, domain, opts);
  return { domain, how: near.length ? 'near' : 'miss', person: null, near };
}

export const MATCHED = new Set(['exact', 'key', 'manual']);

// Lọc danh sách cho ô gợi ý khi MC ghép tay: gõ tên hay gõ địa chỉ đều ra.
export function search(index, query, limit = 8) {
  const q = deaccent(String(query ?? '')).trim().toLowerCase();
  if (!q) return index.people.slice(0, limit);
  const key = loginKey(q);
  const starts = [];
  const has = [];
  for (let i = 0; i < index.people.length; i++) {
    const person = index.people[i];
    const d = person.domain;
    const n = deaccent(person.name).toLowerCase();
    if (d.startsWith(q) || (key && index.keys[i].startsWith(key)) || n.startsWith(q)) starts.push(person);
    else if (d.includes(q) || n.includes(q)) has.push(person);
    if (starts.length >= limit) break;
  }
  return [...starts, ...has].slice(0, limit);
}

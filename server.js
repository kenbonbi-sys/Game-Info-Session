// Fox Quiz: static files + realtime quiz over Server-Sent Events. No dependencies.
//   node server.js               → cổng 5173
//   node server.js --port=5174   → cổng khác
// Three kinds of client: phones are answer pads, /screen is the game on the projector (no controls),
// and /host is the MC dashboard on the laptop. Each question runs question → reveal → fire:
// players who answered right tap to shoot, everyone else gets hit back.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA, SEAT_ORDER, ITEMS as ITEM_INFO, REACTIONS } from './src/config.js';
import { FINALE } from './src/finale-config.js';
import { normalizeDomain, prettyName, shortName, fullEmail, parseRoster, buildIndex, EMPTY_INDEX, lookup, nearest, search, MATCHED, NO_ITEMS, ALL_ITEMS, REWARD_DAY } from './src/identity.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const argPort = process.argv.find(a => a.startsWith('--port='))?.slice('--port='.length);
const PORT = Number(argPort || process.env.PORT) || 5173;
const HOST_KEY = process.env.HOST_KEY || randomBytes(3).toString('hex');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.md': 'text/markdown; charset=utf-8',
};
const ROUTES = { '/': '/index.html', '/host': '/host.html', '/screen': '/screen.html', '/fear': '/fear.html', '/sandbox': '/sandbox.html' };
// Never serve the answer key or server internals.
const PRIVATE = /^\/(data|\.claude|node_modules)(\/|$)|^\/server\.js$/i;

// Boss HP is counted in shots: players at the start × questions × this. A hall that answers
// right and taps about 4 times a second brings it down near the last question; a quieter hall
// finishes it with one shared volley when the game ends.
const BOSS_SHOTS_PER_ANSWER = 24;
// The quiz rounds can only wear the boss down to this much HP. However hard the hall taps, the
// last sliver belongs to the finale: the fun question, then one charged shot from everyone.
const BOSS_FLOOR = 0.15;
// Taps the whole hall must land to fill the bottle: this many each, but never a goal so low that
// a full room fills it before anyone sees it move.
const CHARGE_PER_PLAYER = 25;
const CHARGE_MIN = 300;
// Taps accepted per player: a steady rate with a small burst, so batching and jitter cost nothing
// but auto-clickers gain nothing either.
const TAP_RATE = 12;
const TAP_BURST = 12;
// Nghỉ giữa hai câu là thứ MC chỉnh được (breakSeconds), không phải hằng số ở đây.
// Seconds before the reveal once every connected player has answered.
const ALL_ANSWERED_DELAY = 1.5;
// A second "next" this soon after a step is a double press, not a request to skip the step.
const NEXT_GUARD_MS = 800;
// Dashboard activity feed: the last entries kept, and how often connection drops are summarised.
const LOG_LIMIT = 120;
const PRESENCE_FLUSH_MS = 3000;

// Real Wi-Fi/Ethernet adapters first; virtual ones (Hyper-V, WSL, VPN…) are unreachable from phones.
function lanUrls() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
      const virtual = /vethernet|wsl|hyper-v|virtual|vmware|vbox|docker|tailscale|zerotier|loopback/i.test(name);
      found.push({ url: `http://${a.address}:${PORT}`, virtual });
    }
  }
  return found.sort((a, b) => a.virtual - b.virtual).map(f => f.url);
}

// Hosted on the internet (Render sets RENDER_EXTERNAL_URL itself) the phones reach one public
// address, so there is nothing to choose between; on a laptop it is the LAN addresses.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const JOIN_URLS = PUBLIC_URL ? [PUBLIC_URL] : lanUrls();
const JOIN_URL = JOIN_URLS[0] ?? `http://localhost:${PORT}`;

// ---- Quiz ----------------------------------------------------------------------

const QUESTIONS_FILE = join(root, 'data', 'questions.json');

function readQuizFile() {
  return JSON.parse(readFileSync(QUESTIONS_FILE, 'utf8').replace(/^﻿/, ''));
}

// Everything the dashboard's editor may send back, checked before it reaches the file. Throwing
// here is the point: a malformed bank must never replace a working one minutes before an event.
function validateQuizData(data) {
  if (!data || typeof data !== 'object') throw new Error('Dữ liệu không hợp lệ');
  if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('Cần ít nhất 1 câu hỏi');
  if (!Array.isArray(data.order) || !data.order.length) throw new Error('Cần ít nhất 1 câu trong thứ tự chơi');
  const seen = new Set();
  const clean = data.questions.map(q => {
    const id = String(q.id ?? '').trim();
    if (!id) throw new Error('Mỗi câu cần một ID');
    if (seen.has(id)) throw new Error(`ID "${id}" bị trùng`);
    seen.add(id);
    const text = String(q.text ?? '').trim();
    if (!text) throw new Error(`Câu "${id}" chưa có nội dung`);
    const options = (Array.isArray(q.options) ? q.options : []).map(o => String(o ?? '').trim()).filter(Boolean);
    if (options.length < 2 || options.length > 4) throw new Error(`Câu "${id}" cần 2–4 đáp án`);
    const answer = Number(q.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new Error(`Câu "${id}" có đáp án đúng không hợp lệ`);
    const out = { id, group: String(q.group ?? '').trim() || undefined, answer, text, options };
    if (q.answerConfirmed === false) out.answerConfirmed = false;
    if (q.note) out.note = String(q.note);
    return out;
  });
  const order = data.order.map(id => String(id));
  for (const id of order) if (!seen.has(id)) throw new Error(`Thứ tự chơi có "${id}" nhưng không còn câu hỏi này`);

  let finale;
  if (data.finale) {
    const f = data.finale;
    const options = (Array.isArray(f.options) ? f.options : []).map(o => String(o ?? '').trim()).filter(Boolean);
    const answer = Number(f.answer);
    if (!String(f.text ?? '').trim()) throw new Error('Câu đố vui chưa có nội dung');
    if (options.length < 2 || options.length > 4) throw new Error('Câu đố vui cần 2–4 đáp án');
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new Error('Câu đố vui có đáp án đúng không hợp lệ');
    finale = { id: String(f.id ?? 'Finale'), group: String(f.group ?? 'Câu đố vui'), answer, text: String(f.text).trim(), options };
    if (f.note) finale.note = String(f.note);
  }
  const secs = (v, fallback, lo, hi) => {
    const n = Number(v ?? fallback);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`Thời gian phải trong khoảng ${lo}–${hi} giây`);
    return Math.round(n);
  };
  return {
    readSeconds: secs(data.readSeconds, 10, 3, 60),
    timePerQuestion: secs(data.timePerQuestion, 15, 5, 120),
    revealSeconds: secs(data.revealSeconds, 5, 1, 60),
    fireSeconds: secs(data.fireSeconds, 6, 1, 60),
    breakSeconds: secs(data.breakSeconds, 5, 1, 60),
    shuffleOptions: data.shuffleOptions !== false,
    chargeSeconds: secs(data.chargeSeconds, 45, 5, 300),
    ...(finale ? { finale } : {}),
    order,
    questions: clean,
  };
}

// Written through a temp file: a crash mid-write leaves the old bank intact rather than half a file.
function writeQuizFile(data) {
  const tmp = `${QUESTIONS_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, QUESTIONS_FILE);
}

// ---- Bộ câu hỏi trên Supabase --------------------------------------------------
// Hosting miễn phí có ổ đĩa tạm: container ngủ dậy là data/questions.json quay về bản trong repo,
// nuốt mất mọi chỉnh sửa của MC. Khi có SUPABASE_URL + SUPABASE_KEY thì bản trên Supabase mới là
// bản thật, còn file chỉ là cache sống cùng container — nhờ vậy mọi chỗ đọc file phía dưới không
// phải đổi một dòng nào, và chạy ở nhà (không đặt biến) vẫn y như cũ.
// Trang Data API của Supabase hiện endpoint kèm sẵn /rest/v1/, dán nguyên cụm là chuyện thường —
// cắt đi, thay vì để server gọi /rest/v1/rest/v1/ rồi báo 404 khó hiểu ngay trước giờ diễn.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'quiz_bank';
const SUPABASE_ROW = process.env.SUPABASE_ROW || 'default';
const REMOTE_QUIZ = !!(SUPABASE_URL && SUPABASE_KEY);

async function supabaseFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} — ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function supabaseLoadQuiz() {
  const res = await supabaseFetch(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_ROW)}&select=data`);
  const rows = await res.json();
  return rows[0]?.data ?? null;
}

async function supabaseSaveQuiz(data) {
  await supabaseFetch(`${SUPABASE_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: SUPABASE_ROW, data, updated_at: new Date().toISOString() }),
  });
}

// Chạy một lần lúc khởi động: kéo bản trên Supabase về file, hoặc đẩy bản trong repo lên làm bản
// đầu tiên. Mạng hỏng ở đây không được giết server — sự kiện vẫn phải chạy được với bản trong repo.
async function hydrateQuizFromSupabase() {
  if (!REMOTE_QUIZ) return 'off';
  try {
    const remote = await supabaseLoadQuiz();
    if (remote) {
      writeQuizFile(validateQuizData(remote));
      return 'pulled';
    }
    await supabaseSaveQuiz(validateQuizData(readQuizFile()));
    return 'seeded';
  } catch (err) {
    console.error(`⚠ Supabase không đọc được (${err.message}) — dùng tạm bộ câu hỏi trong repo.`);
    return 'error';
  }
}

// ---- Danh sách chiến dịch 7 ngày -------------------------------------------------
// Trên platform học tập đang chạy chiến dịch 7 ngày: đăng nhập tới ngày 3 được Buddy thông thái,
// tới ngày 5 được Súng giọt tự tin, có tạo bảng câu hỏi thì được Khiên. Dev xuất danh sách ai
// được gì, MC dán vào bảng điều khiển, và người chơi gõ đúng domain của mình là **nhận đúng
// những món đã kiếm được** — đó là toàn bộ lý do ô nhập tên hỏi domain chứ không hỏi biệt danh.
//
// Chưa dán danh sách thì cả phòng nhận đủ 3 món như cũ: quên nạp file không được phép biến thành
// cả hội trường tay trắng.
const ROSTER_FILE = join(root, 'data', 'roster.json');
const SUPABASE_ROSTER_ROW = `${SUPABASE_ROW}:roster`;
const EMPTY_ROSTER = { updatedAt: null, source: '', rewards: false, people: [] };

let roster = EMPTY_ROSTER;
let rosterIndex = EMPTY_INDEX;

const cleanItems = raw => Object.fromEntries(ITEMS.map(k => [k, raw?.[k] ? 1 : 0]));

function validateRoster(data) {
  const people = (Array.isArray(data?.people) ? data.people : []).flatMap(p => {
    const domain = normalizeDomain(p?.domain ?? p?.email);
    return domain ? [{
      domain,
      email: String(p?.email ?? '').trim().toLowerCase() || fullEmail(domain),
      name: String(p?.name ?? '').trim(),
      unit: String(p?.unit ?? '').trim(),
      days: Number.isFinite(Number(p?.days)) && p?.days !== null ? Math.max(0, Math.trunc(Number(p.days))) : null,
      quiz: typeof p?.quiz === 'boolean' ? p.quiz : null,
      items: cleanItems(p?.items),
    }] : [];
  });
  return {
    updatedAt: data?.updatedAt ?? new Date().toISOString(),
    source: String(data?.source ?? '').slice(0, 120),
    // Bản xuất không có cột phần thưởng nào: coi như có tên trong danh sách là đủ điều kiện cả 3
    // món, thay vì phát tay trắng cho đúng một file thiếu cột.
    rewards: !!data?.rewards,
    people,
  };
}

// Đổi mỗi lần nạp danh sách mới: gợi ý đã tính cho từng người chơi chỉ hết hạn khi danh sách đổi.
let rosterStamp = 0;

function useRoster(data) {
  roster = validateRoster(data);
  rosterIndex = buildIndex(roster.people);
  rosterStamp++;
  return roster;
}

// Dò gần đúng phải quét cả danh sách, mà bảng ghép thì kéo lại mỗi khi có người mới vào phòng.
// Kết quả chỉ phụ thuộc domain và danh sách, nên tính một lần rồi giữ lại cho tới lần nạp sau.
function nearPeople(p) {
  if (p.nearAt !== rosterStamp) {
    p.nearAt = rosterStamp;
    p.nearList = nearest(rosterIndex, p.domain, { limit: 6, prefix: true });
  }
  return p.nearList;
}

function writeRosterFile(data) {
  const tmp = `${ROSTER_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, ROSTER_FILE);
}

// Danh sách là dữ liệu nhân sự và có thể vài nghìn dòng: nó không nằm trong repo. Trên hosting ổ
// đĩa là tạm nên Supabase mới là bản thật, y hệt cách bộ câu hỏi đang làm.
async function loadRoster() {
  if (REMOTE_QUIZ) {
    try {
      const res = await supabaseFetch(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_ROSTER_ROW)}&select=data`);
      const remote = (await res.json())[0]?.data;
      if (remote) {
        useRoster(remote);
        try { writeRosterFile(roster); } catch { /* ổ đĩa chỉ là cache */ }
        return;
      }
    } catch (err) {
      console.error(`⚠ Supabase không đọc được danh sách LMS (${err.message}) — dùng bản trong container.`);
    }
  }
  try {
    useRoster(JSON.parse(readFileSync(ROSTER_FILE, 'utf8').replace(/^﻿/, '')));
  } catch {
    useRoster(EMPTY_ROSTER);
  }
}

async function saveRoster(data) {
  const clean = validateRoster(data);
  if (REMOTE_QUIZ) {
    await supabaseFetch(`${SUPABASE_TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: SUPABASE_ROSTER_ROW, data: clean, updated_at: clean.updatedAt }),
    });
  }
  try {
    writeRosterFile(clean);
  } catch (err) {
    // Có Supabase thì file chỉ là cache của container: ổ đĩa hỏng không được phép chặn MC nạp
    // danh sách. Không có Supabase thì file chính là bản thật, hỏng là phải báo.
    if (!REMOTE_QUIZ) throw err;
    console.error(`⚠ Không ghi được data/roster.json (${err.message}) — bản trên Supabase vẫn đúng.`);
  }
  useRoster(clean);
  return roster;
}

// Suất vật phẩm của một người: chưa có danh sách thì đủ 3 món như cũ; có danh sách mà bản xuất
// không nói gì về phần thưởng thì có tên là đủ 3 món; có cột phần thưởng thì đúng những gì kiếm
// được, và không có tên trong danh sách nghĩa là chiến dịch chưa ghi nhận gì.
function grantFor(person) {
  if (!rosterIndex.size) return { ...ALL_ITEMS };
  if (!person) return { ...NO_ITEMS };
  return roster.rewards ? { ...person.items } : { ...ALL_ITEMS };
}

// Ai trong phòng cũng dò lại, trừ người MC đã chỉ tay: chỉ tay là quyết định của người, không được
// để một lần dán danh sách đè lên.
function applyIdentity(p) {
  if (p.match !== 'manual') {
    const hit = lookup(rosterIndex, p.domain);
    p.match = MATCHED.has(hit.how) ? hit.how : 'none';
    p.campaign = hit.person ?? null;
  }
  p.name = shortName(p.campaign?.name || prettyName(p.domain));
  p.grant = grantFor(p.campaign);
  return p;
}

// Nạp danh sách giữa chừng: suất mới ghi vào p.grant để ván sau đúng, nhưng khay vật phẩm đang
// cầm trên tay thì chỉ thay khi còn ở phòng chờ — không ai bị lấy lại món vừa dùng, và cũng
// không ai được phát thêm một món mới giữa ván.
function rematchPlayers() {
  const lobby = ['lobby', 'end'].includes(game.phase);
  for (const p of players.values()) {
    applyIdentity(p);
    if (lobby) p.items = { ...p.grant };
  }
  if (players.size) {
    broadcastScreens(seatsMessage());
    // Khay vật phẩm trên điện thoại đổi ngay khi MC nạp danh sách, không đợi tới lượt sau.
    sendRanks();
  }
  refreshHost();
}

function rosterMeta() {
  const board = [...players.values()];
  return {
    size: rosterIndex.size,
    updatedAt: roster.updatedAt,
    source: roster.source,
    remote: REMOTE_QUIZ,
    // Bản xuất có cột phần thưởng không. Không có thì ai trong danh sách cũng đủ 3 món.
    rewards: roster.rewards,
    rewardDay: REWARD_DAY,
    matched: board.filter(p => MATCHED.has(p.match)).length,
    players: board.length,
    // Số người trong phòng đang tay trắng vì chưa ghép được — con số MC cần nhìn trước giờ chơi.
    empty: rosterIndex.size ? board.filter(p => !ITEMS.some(k => p.grant[k])).length : 0,
  };
}

function loadQuiz() {
  const data = readQuizFile();
  const byId = new Map(data.questions.map(q => [q.id, q]));
  const ids = data.order?.length ? data.order : data.questions.map(q => q.id);
  const questions = ids.map(id => {
    const q = byId.get(id);
    if (!q) throw new Error(`data/questions.json: "order" có "${id}" nhưng không có câu hỏi này`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !(q.answer >= 0 && q.answer < q.options.length)) {
      throw new Error(`data/questions.json: câu "${id}" cần 2–4 options và answer hợp lệ`);
    }
    return q;
  });
  const finale = data.finale;
  if (finale && (!Array.isArray(finale.options) || !(finale.answer >= 0 && finale.answer < finale.options.length))) {
    throw new Error('data/questions.json: "finale" cần options và answer hợp lệ');
  }
  return {
    // Câu hỏi hiện một mình chừng này giây trước khi đáp án và đồng hồ cùng bật lên. Không có
    // quãng này thì ai đọc nhanh bấm trước, ai đọc chậm mất lượt — thi đọc chứ không phải thi hiểu.
    read: data.readSeconds ?? 10,
    time: data.timePerQuestion ?? 15,
    reveal: data.revealSeconds ?? 5,
    fire: data.fireSeconds ?? 6,
    // Bắn xong là hội trường còn đang thở: chừng này giây để ngẩng lên, đặt tay lại rồi mới
    // tới câu sau. MC chỉnh được trong phần cài đặt, thấp nhất 1 giây để vòng lặp không đứng.
    pause: Math.max(1, Number(data.breakSeconds) || 5),
    shuffle: data.shuffleOptions !== false,
    // The hall gets this long to fill the bottle before it tops itself up, so a quiet or
    // half-empty room can never leave the finale hanging.
    chargeLimit: data.chargeSeconds ?? 45,
    // Options stay in the authored order: the joke depends on which letter the punchline lands on.
    finale: finale ? { ...finale, group: finale.group ?? 'Câu đố vui' } : null,
    questions,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LETTERS = 'ABCD';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const game = {
  phase: 'lobby', phaseAt: 0, quiz: loadQuiz(), round: [], index: -1, startedAt: 0, endsAt: 0, timer: null, auto: true,
  // firing: the shooting window of the 'fire' phase is open (it stays in 'fire' briefly after).
  firing: false, turrets: [], boss: { max: 1, dmg: 0, finisher: false, fellAt: -1 }, roundShots: 0, totalShots: 0,
  // The finale's shared meter: taps the hall has landed into the bottle, and what it takes to fill it.
  charge: { taps: 0, goal: CHARGE_MIN, full: false },
  // pid → the letter each player guessed on the fun question.
  finalePick: {},
  joinUrl: JOIN_URL,
};
const players = new Map();          // pid → player
const playerStreams = new Map();    // pid → Set<res>
const screenStreams = new Set();    // projector windows
const previewStreams = new Set();   // the dashboard's embedded preview: same feed, not counted as a projector
const adminStreams = new Set();     // MC dashboards
const fearStreams = new Set();      // điện thoại ở đoạn gõ nỗi sợ, mở màn chương trình
const activity = [];                // dashboard feed, newest last
let nextPlayerNo = 1;

// Water-cannon turrets, one seat each (game.turrets[i] = pid | null), one per slot painted on the
// projector map. Every player gets the next free seat when they join; beyond that they still play
// and shoot from the aisles.
const TURRET_SLOTS = ARENA.slots.length;

function autoSeat(p) {
  if (p.turret >= 0) return;
  while (game.turrets.length < TURRET_SLOTS) game.turrets.push(null);
  const i = SEAT_ORDER.find(slot => !game.turrets[slot]);
  if (i === undefined) return;
  game.turrets[i] = p.pid;
  p.turret = i;
}

function seatsMessage() {
  return {
    type: 'seats',
    count: TURRET_SLOTS,
    seats: game.turrets.flatMap((pid, i) => {
      const p = pid && players.get(pid);
      return p ? [[i, p.n, p.name]] : [];
    }),
  };
}

const ITEMS = ['hint', 'shield', 'boost'];

function freshStats(p) {
  return Object.assign(p, {
    score: 0, correct: 0, streak: 0, timeMs: 0, shots: 0, chargeTaps: 0,
    // picks[i] = { choice, ms } as submitted; results[i] is scored at the reveal, never before.
    picks: {}, results: {}, roundShots: 0, tapTokens: 0, tapAt: 0, reactAt: 0,
    // Khay vật phẩm đầu ván là đúng suất người này kiếm được ở chiến dịch 7 ngày (p.grant), chứ
    // không còn là đủ 3 món cho tất cả. Chưa nạp danh sách thì grant vốn đã là đủ 3 món.
    items: { ...(p.grant ?? ALL_ITEMS) }, armed: { shield: false, boost: false }, hints: {},
  });
}

// ---- Icon vui trong lúc chờ ------------------------------------------------------
// Phòng chờ là quãng im lặng dài nhất của buổi diễn: ai vào sớm ngồi nhìn màn hình đứng yên.
// Cho cả hội trường thả icon cho nhau xem, nhưng gom lại rồi đẩy mỗi nửa giây một
// lượt — 100 điện thoại tap loạn mà bắn thẳng từng cái là tự làm nghẽn chính mình.
const REACT_EVERY_MS = 600;   // mỗi người, giữa hai lần thả
const REACT_FLUSH_MS = 500;
const REACT_MAX_PER_FLUSH = 40;
const reactBuffer = new Map();  // chỉ số icon → số lượt trong cửa sổ hiện tại
const reactSeats = [];          // [ụ súng, chỉ số icon] để màn chiếu thả icon đúng chỗ người đó ngồi
let reactTimer = null;

// Chỉ mở ở phòng chờ. Màn tổng kết cũng là lúc chờ nhưng bảng xếp hạng phủ kín điện thoại,
// icon thả lên sẽ nằm khuất phía sau — mở ở đó chỉ là nút bấm không ai thấy kết quả.
const reactionsOpen = () => game.phase === 'lobby';

function flushReactions() {
  reactTimer = null;
  if (!reactBuffer.size && !reactSeats.length) return;
  // Điện thoại chỉ cần biết icon nào bao nhiêu cái; màn chiếu và khung xem trước của MC cần biết
  // ụ nào thả, để icon nhảy lên đúng ụ mang tên người đó.
  if (reactBuffer.size) broadcastPlayers({ type: 'react', icons: [...reactBuffer.entries()] });
  if (reactSeats.length) broadcastScreens({ type: 'react', seats: [...reactSeats] });
  reactBuffer.clear();
  reactSeats.length = 0;
}

function react(p, icon) {
  if (!reactionsOpen()) return [409, { error: 'Chưa tới lúc thả icon' }];
  const i = REACTIONS.findIndex(r => r.id === String(icon));
  if (i < 0) return [400, { error: 'Icon không hợp lệ' }];
  const now = Date.now();
  if (now - (p.reactAt ?? 0) < REACT_EVERY_MS) return [200, { ok: true, dropped: true }];
  p.reactAt = now;
  const total = [...reactBuffer.values()].reduce((a, b) => a + b, 0);
  if (total < REACT_MAX_PER_FLUSH) {
    reactBuffer.set(i, (reactBuffer.get(i) ?? 0) + 1);
    // Người vào sau khi hết 108 ụ vẫn thả được icon cho cả phòng, chỉ là không có ụ để nhảy lên.
    if (p.turret >= 0) reactSeats.push([p.turret, i]);
  }
  reactTimer ??= setTimeout(flushReactions, REACT_FLUSH_MS);
  return [200, { ok: true }];
}

// ---- Nỗi sợ: word cloud mở màn chương trình --------------------------------------
// Game đánh boss nằm cuối buổi, cách đoạn này cả tiếng đồng hồ. Đây là chỗ con boss được sinh ra:
// cả hội trường gõ điều mình sợ khi làm nghiên cứu, chữ hiện lên màn chiếu thành đám mây, rồi MC
// bấm một nút để đám mây xoáy lại thành Quái Vật. Tới cuối buổi, thứ họ bắn là chính nỗi sợ đó.
const FEAR_MAX_LEN = 32;
const FEAR_MAX_WORDS = 400;     // đủ cho một hội trường; chặn người rảnh tay làm màn chiếu ì ra
const FEAR_EVERY_MS = 600;      // giữa hai lần gửi của cùng một máy: chặn spam, không chặn người gõ nhanh
const FEAR_FLUSH_MS = 600;      // gom lại rồi mới đẩy, như icon phòng chờ
const STORM_SECONDS = 15;       // dài bằng đoạn phim triệu hồi ở src/fear-cloud.js
// Hội trường im ru mà MC vẫn bấm triệu hồi thì vẫn phải có cái để chiếu.
const FEAR_FALLBACK = ['Sợ làm sai', 'Sợ bị đánh giá', 'Sợ không kịp deadline'];

const fear = {
  // done → wait (đang quét mã) → open (gõ) → storm (triệu hồi) → outro (câu hỏi đọng lại) → done.
  // Chỉ mỗi 'storm' tự hết giờ. 'outro' đứng yên chờ MC: sau nó là phòng chờ của game, mà phòng
  // chờ đã là đấu trường với mấy chục ụ súng — tự nhảy sang là lộ mất đoạn cuối buổi.
  // Mặc định là 'done', không phải 'wait': gói hosting miễn phí ngủ dậy là dựng lại từ đầu, mà
  // game nằm cuối buổi — máy chiếu bật lên phải là phòng chờ của game, không phải màn mở đầu đã
  // diễn xong từ một tiếng trước. MC bấm một nút để mở đoạn này.
  phase: 'done',
  phaseAt: Date.now(),
  words: new Map(),       // khoá đã chuẩn hoá → { text, count, at }
  people: new Map(),      // pid → { at, n }
  top: [],
  timer: null,
  dirty: false,
  flush: null,
};

// Gom "Sợ sai", "sợ sai!", "Sợ  sai" về một từ, nhưng giữ nguyên chữ người đầu tiên gõ để chiếu lên.
function normFear(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, FEAR_MAX_LEN);
  const key = text.toLowerCase().replace(/[.,!?;:"'`~()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
  return key ? { key, text } : null;
}

function fearWordList() {
  return [...fear.words.values()].sort((a, b) => b.count - a.count || a.at - b.at).map(w => [w.text, w.count]);
}

function fearMessage(role) {
  const total = [...fear.words.values()].reduce((a, w) => a + w.count, 0);
  const msg = {
    type: 'fear',
    phase: fear.phase,
    phaseAt: fear.phaseAt,
    now: Date.now(),
    people: fear.people.size,
    total,
    kinds: fear.words.size,
    top: fear.top,
  };
  // Điện thoại không cần cả đám mây: chữ nằm trên màn chiếu, máy chỉ là bàn phím.
  if (role !== 'player') msg.words = fearWordList();
  return msg;
}

function broadcastFear() {
  fear.dirty = false;
  broadcastScreens(fearMessage('screen'));
  broadcastAdmins(fearMessage('admin'));
  const forPhones = fearMessage('player');
  for (const res of fearStreams) send(res, forPhones);
}

// Cả trăm người gõ cùng lúc: dồn lại nửa giây một lần thay vì vẽ lại đám mây sau mỗi chữ.
function fearChanged() {
  fear.dirty = true;
  fear.flush ??= setTimeout(() => {
    fear.flush = null;
    if (fear.dirty) broadcastFear();
  }, FEAR_FLUSH_MS);
}

function setFearPhase(next) {
  fear.phase = next;
  fear.phaseAt = Date.now();
  clearTimeout(fear.timer);
  fear.timer = null;
  if (next === 'storm') {
    const list = [...fear.words.values()].sort((a, b) => b.count - a.count || a.at - b.at);
    fear.top = (list.length ? list.slice(0, 3) : FEAR_FALLBACK.map(text => ({ text, count: 0 })))
      .map(w => ({ text: w.text, count: w.count }));
    fear.timer = setTimeout(() => setFearPhase('outro'), STORM_SECONDS * 1000);
  }
  broadcastFear();
}

function fearJoin() {
  const pid = randomUUID();
  fear.people.set(pid, { at: 0, n: fear.people.size + 1 });
  fearChanged();
  return [200, { pid, phase: fear.phase }];
}

function addFear(pid, raw) {
  const person = fear.people.get(pid);
  if (!person) return [404, { error: 'Chưa vào phòng, hãy quét lại mã' }];
  if (fear.phase !== 'open') return [409, { error: 'Chưa tới lượt gõ, nhìn màn hình lớn nhé' }];
  const w = normFear(raw);
  if (!w) return [400, { error: 'Gõ một điều làm bạn sợ nhé' }];
  const now = Date.now();
  if (now - person.at < FEAR_EVERY_MS) return [429, { error: 'Từ từ thôi nào!' }];
  person.at = now;
  const hit = fear.words.get(w.key);
  if (hit) hit.count++;
  else if (fear.words.size < FEAR_MAX_WORDS) fear.words.set(w.key, { text: w.text, count: 1, at: now });
  else return [200, { ok: true, text: w.text, full: true }];
  fearChanged();
  return [200, { ok: true, text: hit?.text ?? w.text }];
}

const isOnline = p => (playerStreams.get(p.pid)?.size ?? 0) > 0;
const bossPercent = () => Math.round(100 * clamp(1 - game.boss.dmg / game.boss.max, 0, 1));

function youMessage(p, rank) {
  const i = game.index;
  const inRound = ['reading', 'question', 'reveal', 'fire'].includes(game.phase);
  return {
    type: 'you', score: p.score, correct: p.correct, rank, players: players.size, turret: p.turret,
    // items: còn dùng được mấy lần · granted: suất kiếm được ở chiến dịch, để khay vật phẩm nói
    // đúng "đã dùng" hay "chưa bao giờ có".
    items: p.items, granted: p.grant, armed: p.armed,
    hint: game.phase === 'question' ? p.hints[i] ?? null : null,
    picked: inRound ? p.picks[i]?.choice ?? null
      : ['finalreading', 'final', 'finalreveal'].includes(game.phase) ? game.finalePick?.[p.pid] ?? null
      : null,
    result: game.phase === 'reveal' || game.phase === 'fire' ? p.results[i] ?? null : null,
    shots: game.phase === 'fire' ? p.roundShots : game.phase === 'charge' ? p.chargeTaps ?? 0 : 0,
    totalShots: p.shots,
  };
}

function leaderboard() {
  return [...players.values()].sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);
}

function answerCounts() {
  const q = game.round[game.index];
  const counts = new Array(q?.options.length ?? 4).fill(0);
  let answered = 0;
  for (const p of players.values()) {
    const pick = p.picks[game.index];
    if (!pick) continue;
    counts[pick.choice]++;
    answered++;
  }
  return { counts, answered };
}

// Where a player stands on the current question, for the dashboard's roster.
function roundStatus(p) {
  if (game.phase === 'final') return game.finalePick?.[p.pid] !== undefined ? 'answered' : '';
  if (game.phase === 'finalreveal') return game.finalePick?.[p.pid] === game.quiz.finale?.answer ? 'correct' : 'wrong';
  if (game.phase === 'question') return p.picks[game.index] ? 'answered' : '';
  const r = (game.phase === 'reveal' || game.phase === 'fire') && p.results[game.index];
  if (!r) return '';
  return r.correct ? 'correct' : r.blocked ? 'blocked' : r.timeout ? 'timeout' : 'wrong';
}

// role: 'player' (phones), 'screen' (projector and preview) or 'admin' (dashboard).
function stateFor(role) {
  const q = game.round[game.index];
  const inRound = q && ['reading', 'question', 'reveal', 'fire'].includes(game.phase);
  const s = {
    type: 'state',
    phase: game.phase,
    phaseAt: game.phaseAt,
    index: game.index,
    total: game.round.length || game.quiz.questions.length,
    read: game.quiz.read,
    time: game.quiz.time,
    reveal: game.quiz.reveal,
    fire: game.quiz.fire,
    pause: game.quiz.pause,
    endsAt: game.endsAt,
    now: Date.now(),
    players: players.size,
    react: reactionsOpen(),
    firing: game.firing,
    auto: game.auto,
    boss: bossPercent(),
  };
  const fq = game.quiz.finale;
  const inFinale = fq && ['finalreading', 'final', 'finalreveal'].includes(game.phase);
  // Phones get the number of tiles only: the question itself is read off the big screen.
  if (inRound) {
    s.options = q.options.length;
    if (!['reading', 'question'].includes(game.phase)) s.answer = q.answer;
  }
  if (inFinale) {
    s.options = fq.options.length;
    if (!['finalreading', 'final'].includes(game.phase)) s.answer = fq.answer;
  }
  if (['charge', 'unleash', 'victory'].includes(game.phase)) s.charge = { ...game.charge };
  if (role === 'player') return s;
  if (inRound) s.question = { id: q.id, group: q.group, text: q.text, options: q.options };
  if (inFinale) s.question = { id: fq.id, group: fq.group, text: fq.text, options: fq.options };
  const board = leaderboard();
  Object.assign(s, inFinale ? finaleCounts() : answerCounts(), {
    joinUrl: game.joinUrl,
    joinUrls: JOIN_URLS,
    online: board.filter(isOnline).length,
    top: board.slice(0, 5).map(p => ({ name: p.name, score: p.score, correct: p.correct, shots: p.shots })),
    bossDmg: game.boss.dmg,
    bossMax: game.boss.max,
    finisher: game.boss.finisher,
    roundShots: game.roundShots,
    totalShots: game.totalShots,
  });
  if (role === 'admin') {
    // Only the dashboard knows the answer while players are still choosing.
    if (inRound) s.answerKey = q.answer;
    if (inFinale) s.answerKey = fq.answer;
    if (fq) s.finaleReady = true;
    Object.assign(s, {
      screens: screenStreams.size,
      bossFellAt: game.boss.fellAt,
      turrets: TURRET_SLOTS,
      roster: board.map(p => [p.n, p.name, p.turret, isOnline(p) ? 1 : 0, p.score, p.correct, roundStatus(p), p.roundShots, p.shots, p.domain, p.match]),
      campaign: rosterMeta(),
    });
  }
  return s;
}

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastScreens(msg = stateFor('screen')) {
  for (const set of [screenStreams, previewStreams]) for (const res of set) send(res, msg);
}

function broadcastAdmins(msg = stateFor('admin')) {
  for (const res of adminStreams) send(res, msg);
}

function broadcastPlayers(msg) {
  for (const set of playerStreams.values()) for (const res of set) send(res, msg);
}

// Everyone who isn't a phone: projector, preview and dashboard.
function broadcastHost() {
  if (screenStreams.size || previewStreams.size) broadcastScreens();
  if (adminStreams.size) broadcastAdmins();
}

function broadcast() {
  broadcastPlayers(stateFor('player'));
  broadcastHost();
}

function sendRanks() {
  leaderboard().forEach((p, i) => {
    const you = youMessage(p, i + 1);
    for (const res of playerStreams.get(p.pid) ?? []) send(res, you);
  });
}

// Joins, answers and taps refresh the projector and dashboard counters a quarter second later, batched.
let hostTimer = null;
function refreshHost() {
  hostTimer ??= setTimeout(() => {
    hostTimer = null;
    broadcastHost();
  }, 250);
}

function logEvent(text, tone = 'info') {
  const entry = { t: Date.now(), text, tone };
  activity.push(entry);
  if (activity.length > LOG_LIMIT) activity.shift();
  broadcastAdmins({ type: 'log', entry });
}

function roundMessage() {
  const confirmed = new Map(game.quiz.questions.map(q => [q.id, q.answerConfirmed !== false]));
  const list = game.round.length ? game.round : game.quiz.questions;
  return { type: 'round', questions: list.map(q => ({ id: q.id, group: q.group, text: q.text, unconfirmed: !confirmed.get(q.id) })) };
}

// Phones drop and reconnect all the time on event wifi: summarise instead of logging every blip.
const wentOffline = new Set();
const cameBack = new Set();
function notePresence(p, online) {
  if (online) {
    if (wentOffline.delete(p.pid)) return;
    if (p.seen) cameBack.add(p.pid);
    p.seen = true;
  } else if (!cameBack.delete(p.pid)) {
    wentOffline.add(p.pid);
  }
}

setInterval(() => {
  const names = ids => [...ids].map(pid => players.get(pid)?.name).filter(Boolean);
  const list = ids => {
    const all = names(ids);
    return all.length > 4 ? `${all.slice(0, 4).join(', ')} và ${all.length - 4} người khác` : all.join(', ');
  };
  if (wentOffline.size) logEvent(`${wentOffline.size} người mất kết nối: ${list(wentOffline)}`, 'warn');
  if (cameBack.size) logEvent(`${cameBack.size} người kết nối lại: ${list(cameBack)}`, 'info');
  wentOffline.clear();
  cameBack.clear();
}, PRESENCE_FLUSH_MS);

// Accepted taps go to the projector 10×/s as shots per turret (-1 = players without a turret).
const pendingShots = new Map();
let bossChanged = false;

setInterval(broadcastHost, 1000);
setInterval(() => {
  for (const set of playerStreams.values()) for (const res of set) res.write(': ping\n\n');
  for (const set of [screenStreams, previewStreams, adminStreams]) for (const res of set) res.write(': ping\n\n');
}, 15000);
setInterval(() => {
  if (!pendingShots.size) return;
  broadcastScreens({ type: 'shots', s: [...pendingShots], dmg: game.boss.dmg, max: game.boss.max });
  pendingShots.clear();
}, 100);
setInterval(() => {
  if (!bossChanged) return;
  bossChanged = false;
  broadcastPlayers({ type: 'boss', boss: bossPercent() });
}, 1000);

const phaseTimers = new Set();

function schedule(phase, seconds, next) {
  clearTimeout(game.timer);
  for (const timer of phaseTimers) clearTimeout(timer);
  phaseTimers.clear();
  game.timer = null;
  game.phase = phase;
  game.phaseAt = Date.now();
  if (phase !== 'fire') game.firing = false;
  game.endsAt = seconds > 0 ? game.phaseAt + seconds * 1000 : 0;
  if (seconds > 0 && next) game.timer = setTimeout(next, seconds * 1000);
  broadcast();
}

function startGame() {
  game.quiz = loadQuiz();
  game.round = game.quiz.questions.map(q => {
    const order = q.options.map((_, i) => i);
    if (game.quiz.shuffle) shuffle(order);
    return { id: q.id, group: q.group, text: q.text, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
  });
  game.index = -1;
  for (const p of players.values()) {
    freshStats(p);
    autoSeat(p);
  }
  game.boss = { max: Math.max(1, players.size) * game.round.length * BOSS_SHOTS_PER_ANSWER, dmg: 0, finisher: false, fellAt: -1 };
  game.roundShots = 0;
  game.totalShots = 0;
  game.charge = { taps: 0, goal: CHARGE_MIN, full: false };
  game.finalePick = {};
  broadcastScreens(seatsMessage());
  broadcastAdmins(roundMessage());
  logEvent(`Bắt đầu game: ${players.size} người chơi, ${game.round.length} câu`, 'phase');
  schedule('countdown', 3, nextQuestion);
  sendRanks();
}

function nextQuestion() {
  if (game.phase === 'fire' && game.index >= 0) logEvent(`Lượt bắn câu ${game.index + 1}: ${game.roundShots.toLocaleString('vi-VN')} phát`, 'info');
  game.index++;
  game.roundShots = 0;
  if (game.index >= game.round.length) {
    startFinale();
    return;
  }
  logEvent(`Câu ${game.index + 1}/${game.round.length} (${game.round[game.index].id})`, 'phase');
  if (game.quiz.read > 0) schedule('reading', game.quiz.read, openQuestion);
  else openQuestion();
  sendRanks();
}

// Đồng hồ chỉ chạy từ lúc đáp án hiện ra, nên điểm theo tốc độ đo từ đây — quãng đọc không tính.
function openQuestion() {
  game.startedAt = Date.now();
  schedule('question', game.quiz.time, revealAnswer);
}

// ---- Finale: fill the bottle, throw it, defeat the boss, celebrate, then show Top 5 --

// The quiz is over and the boss is still standing on its last sliver. One joke question, then
// everyone — right answer or not — taps the bottle full and it goes off in the boss's face.
function startFinale() {
  if (!game.quiz.finale) {
    startCharge();
    return;
  }
  game.finalePick = {};
  logEvent('Câu đố vui cuối: cả hội trường cùng chuẩn bị đòn kết liễu', 'phase');
  if (game.quiz.read > 0) schedule('finalreading', game.quiz.read, openFinale);
  else openFinale();
  sendRanks();
}

function openFinale() {
  schedule('final', game.quiz.time, revealFinale);
}

function revealFinale() {
  const { counts } = finaleCounts();
  const q = game.quiz.finale;
  logEvent(`Đáp án câu vui: ${LETTERS[q.answer]}. ${q.options[q.answer]} (${counts[q.answer] ?? 0} người đoán đúng)`, 'good');
  schedule('finalreveal', game.quiz.reveal, startCharge);
}

function startCharge() {
  const online = [...players.values()].filter(isOnline).length || players.size;
  game.charge = { taps: 0, goal: Math.max(CHARGE_MIN, online * CHARGE_PER_PLAYER), full: false };
  const now = Date.now();
  for (const p of players.values()) Object.assign(p, { chargeTaps: 0, tapTokens: TAP_BURST, tapAt: now });
  logEvent(`Tích nước: cần ${game.charge.goal.toLocaleString('vi-VN')} lượt tap từ cả hội trường`, 'phase');
  // The timer is the safety net, not the rule: filling the bottle early cuts it short.
  schedule('charge', game.quiz.chargeLimit, () => fillCharge('hết giờ tích nước'));
  broadcastScreens(chargeMessage());
}

function fillCharge(why) {
  if (game.phase !== 'charge' || game.charge.full) return;
  game.charge.full = true;
  game.charge.taps = Math.max(game.charge.taps, game.charge.goal);
  game.boss.finisher = true;
  logEvent(`Bình nước đầy (${why}) — cùng ném bình vào Quái Vật!`, 'good');
  schedule('unleash', FINALE.unleashSeconds, startVictory);
  // The boss stays alive while the film plays: it only loses its last HP on the frame the hall
  // watches the fear go out. schedule() also cancels this on reset.
  const timer = setTimeout(() => {
    phaseTimers.delete(timer);
    defeatBoss();
  }, FINALE.defeatAt * 1000);
  phaseTimers.add(timer);
  broadcastScreens(chargeMessage());
}

function defeatBoss() {
  if (game.phase !== 'unleash' || game.boss.dmg >= game.boss.max) return;
  game.boss.dmg = game.boss.max;
  bossChanged = true;
  logEvent('Quái Vật đã bị hạ gục nhờ bình nước của cả đội cáo!', 'good');
  broadcast();
}

function startVictory() {
  if (game.phase !== 'unleash') return;
  defeatBoss();
  logEvent('Chiếu clip chiến thắng của cả đội cáo — sau clip sẽ vinh danh Top 5', 'phase');
  schedule('victory', FINALE.victorySeconds, endGame);
}

function finaleCounts() {
  const q = game.quiz.finale;
  const counts = new Array(q?.options.length ?? 4).fill(0);
  let answered = 0;
  for (const p of players.values()) {
    const choice = game.finalePick?.[p.pid];
    if (choice === undefined) continue;
    counts[choice]++;
    answered++;
  }
  return { counts, answered };
}

const chargeMessage = () => ({ type: 'charge', taps: game.charge.taps, goal: game.charge.goal, full: game.charge.full });

// The fun question is not scored, so this only records what the hall guessed.
function answerFinale(p, choice) {
  if (game.phase !== 'final') return [409, { error: 'Câu này đã đóng' }];
  const q = game.quiz.finale;
  if (!(choice >= 0 && choice < q.options.length)) return [400, { error: 'Đáp án không hợp lệ' }];
  if (game.finalePick[p.pid] !== undefined) return [409, { error: 'Bạn đã trả lời câu này rồi' }];
  game.finalePick[p.pid] = choice;
  broadcast();
  refreshHost();
  return [200, { recorded: true, choice }];
}

function tapCharge(p, n) {
  if (game.phase !== 'charge' || game.charge.full) return [409, { error: 'Chưa tới lượt tích nước' }];
  const now = Date.now();
  p.tapTokens = Math.min(TAP_BURST, p.tapTokens + ((now - p.tapAt) / 1000) * TAP_RATE);
  p.tapAt = now;
  const taps = Math.min(Math.floor(p.tapTokens), clamp(Math.trunc(Number(n)) || 0, 0, TAP_BURST));
  if (taps > 0) {
    p.tapTokens -= taps;
    p.chargeTaps = (p.chargeTaps ?? 0) + taps;
    p.shots += taps;
    game.charge.taps += taps;
    game.totalShots += taps;
    // No muzzle flashes here: the taps pour into the bottle, they do not shoot the boss.
    broadcastScreens(chargeMessage());
    if (game.charge.taps >= game.charge.goal) fillCharge('cả hội trường tap đầy');
  }
  return [200, { taps, charge: game.charge.taps, goal: game.charge.goal, mine: p.chargeTaps ?? 0 }];
}

function endGame() {
  if (game.phase !== 'victory') return;
  const [first] = leaderboard();
  logEvent(`Kết thúc game${game.boss.finisher ? ' (đòn kết liễu chung)' : ''}${first ? ` · Top 1: ${first.name}, ${first.score.toLocaleString('vi-VN')} điểm` : ''}`, 'good');
  schedule('end', 0);
  sendRanks();
}

// Scores every player at once, so nobody learns the answer from their own result early.
function revealAnswer() {
  const q = game.round[game.index];
  const limit = game.quiz.time * 1000;
  const { answered } = answerCounts();
  let right = 0;
  for (const p of players.values()) {
    const pick = p.picks[game.index];
    const correct = pick?.choice === q.answer;
    // A miss (wrong or no answer) is absorbed by an armed shield, which also keeps the streak.
    const double = correct && p.armed.boost;
    const blocked = !correct && p.armed.shield;
    if (double) p.armed.boost = false;
    if (blocked) p.armed.shield = false;
    if (correct) p.streak++;
    else if (!blocked) p.streak = 0;
    const ms = pick?.ms ?? limit;
    let points = correct ? Math.round(500 + 500 * (1 - ms / limit)) + Math.min(p.streak - 1, 5) * 50 : 0;
    if (double) points *= 2;
    p.score += points;
    p.correct += correct ? 1 : 0;
    right += correct ? 1 : 0;
    p.timeMs += ms;
    p.results[game.index] = { choice: pick?.choice ?? null, correct, points, streak: p.streak, double, blocked, timeout: !pick };
  }
  logEvent(`Đáp án câu ${game.index + 1}: ${LETTERS[q.answer]} · ${right}/${answered} trả lời đúng`, 'phase');
  schedule('reveal', game.auto ? game.quiz.reveal : 0, startFire);
  sendRanks();
}

// Who fires this round and who the boss strikes back at, per turret.
function attackMessage(replay = false) {
  const msg = { type: 'attack', index: game.index, replay, ready: [], double: [], hit: [], blocked: [] };
  for (const p of players.values()) {
    const r = p.results[game.index];
    if (!r || p.turret < 0) continue;
    if (r.correct) {
      msg.ready.push(p.turret);
      if (r.double) msg.double.push(p.turret);
    } else {
      msg[r.blocked ? 'blocked' : 'hit'].push(p.turret);
    }
  }
  return msg;
}

function startFire() {
  const now = Date.now();
  for (const p of players.values()) Object.assign(p, { roundShots: 0, tapTokens: TAP_BURST, tapAt: now });
  game.roundShots = 0;
  game.firing = true;
  broadcastScreens(attackMessage());
  schedule('fire', game.quiz.fire, endFire);
  sendRanks();
}

function endFire() {
  game.firing = false;
  schedule('fire', game.auto ? game.quiz.pause : 0, nextQuestion);
}

function hostAction(action) {
  switch (action) {
    // Đoạn mở màn: mở bàn phím cho hội trường, rồi triệu hồi con boss từ chính những chữ đó.
    case 'fear-wait':
      setFearPhase('wait');
      logEvent('Mở màn: máy chiếu hiện mã QR cho hội trường quét', 'phase');
      return true;
    case 'fear-open':
      if (fear.phase !== 'storm') {
        setFearPhase('open');
        logEvent('Mở cho hội trường gõ nỗi sợ', 'phase');
      }
      return true;
    case 'fear-storm':
      if (fear.phase === 'open' || fear.phase === 'wait') {
        setFearPhase('storm');
        const names = fear.top.map(w => w.text).join(' · ');
        logEvent(fear.words.size ? `Triệu hồi Quái Vật từ ${fear.words.size} nỗi sợ — top 3: ${names}` : `Chưa ai gõ, triệu hồi bằng nỗi sợ mặc định: ${names}`, fear.words.size ? 'phase' : 'warn');
      }
      return true;
    case 'fear-reset':
      fear.words.clear();
      fear.people.clear();
      fear.top = [];
      setFearPhase('wait');
      logEvent('Xoá sạch nỗi sợ, về lại màn quét mã', 'warn');
      return true;
    case 'fear-done':
      setFearPhase('done');
      logEvent('Hết đoạn mở màn, máy chiếu về phòng chờ của game', 'phase');
      return true;
    case 'fear-skip':
      setFearPhase('done');
      logEvent('Bỏ qua đoạn nỗi sợ', 'info');
      return true;
    case 'start':
      if (game.phase === 'lobby' || game.phase === 'end') startGame();
      return true;
    case 'next':
      if (Date.now() - game.phaseAt < NEXT_GUARD_MS) return true;
      if (game.phase === 'countdown' || game.phase === 'fire') nextQuestion();
      else if (game.phase === 'reading') openQuestion();
      else if (game.phase === 'question') revealAnswer();
      else if (game.phase === 'finalreading') openFinale();
      else if (game.phase === 'reveal') startFire();
      else if (game.phase === 'final') revealFinale();
      else if (game.phase === 'finalreveal') startCharge();
      return true;
    // The MC can top up a slow bottle. The throw, defeat and victory clip still play in full.
    case 'fill':
      if (game.phase === 'charge') fillCharge('MC nạp đầy');
      return true;
    case 'reset':
      game.round = [];
      game.index = -1;
      game.boss = { max: 1, dmg: 0, finisher: false, fellAt: -1 };
      game.totalShots = 0;
      game.roundShots = 0;
      pendingShots.clear();
      bossChanged = false;
      game.charge = { taps: 0, goal: CHARGE_MIN, full: false };
      game.finalePick = {};
      for (const p of players.values()) freshStats(p);
      logEvent('MC reset về phòng chờ', 'warn');
      broadcastAdmins(roundMessage());
      schedule('lobby', 0);
      sendRanks();
      return true;
    case 'auto':
      game.auto = !game.auto;
      logEvent(`Tự chuyển: ${game.auto ? 'BẬT' : 'TẮT'}`, 'info');
      // Takes effect on the current pause too: off holds it for the MC, on resumes the countdown.
      if (game.phase === 'reveal') schedule('reveal', game.auto ? game.quiz.reveal : 0, startFire);
      else if (game.phase === 'fire' && !game.firing) schedule('fire', game.auto ? game.quiz.pause : 0, nextQuestion);
      else broadcast();
      return true;
    default:
      return false;
  }
}

// Câu ngắn cho nhật ký MC: người này vào phòng với những món gì trong tay.
function grantLabel(p) {
  const got = ITEMS.filter(k => p.grant[k]);
  if (!rosterIndex.size) return 'đủ 3 vật phẩm (chưa nạp danh sách chiến dịch)';
  if (!got.length) return 'chưa có vật phẩm nào từ chiến dịch';
  return `nhận ${got.map(k => ITEM_INFO[k].name).join(' + ')}`;
}

const joinPayload = p => ({
  pid: p.pid, n: p.n, name: p.name, domain: p.domain, turret: p.turret, match: p.match,
  // granted đứng riêng chứ không nằm trong campaign: chưa nạp danh sách thì campaign là null mà
  // suất vẫn là đủ 3 món, và điện thoại không phải đoán chuyện đó.
  granted: p.grant,
  campaign: p.campaign ? { name: p.campaign.name, email: p.campaign.email, days: p.campaign.days } : null,
});

function joinPlayer(body) {
  const domain = normalizeDomain(body.name ?? body.domain);
  let p = typeof body.pid === 'string' ? players.get(body.pid) : undefined;
  // Hết pin, lỡ xoá tab, quét lại QR: cùng một domain mà người cũ đang rớt mạng thì đó là chính
  // họ quay lại — trả về đúng ụ và đúng điểm, và bản ghép sau buổi chỉ có một dòng cho một người.
  if (!p && domain) {
    const back = [...players.values()].find(o => o.domain === domain && !isOnline(o));
    if (back) {
      p = back;
      logEvent(`${p.name} (${domain}) vào lại phòng · giữ nguyên ${p.score.toLocaleString('vi-VN')} điểm${p.turret >= 0 ? ` và ụ ${p.turret + 1}` : ''}`, 'join');
    }
  }
  if (!p) {
    if (!domain) {
      const typed = String(body.name ?? '').trim();
      return [400, { error: typed ? 'Domain chỉ gồm chữ, số và dấu chấm — ví dụ: khang.pham2' : 'Nhập domain của bạn để vào chơi' }];
    }
    const twin = [...players.values()].find(o => o.domain === domain);
    // applyIdentity trước freshStats: chính nó đặt p.grant, còn freshStats mới là chỗ đổ suất đó
    // vào khay vật phẩm của ván này.
    p = freshStats(applyIdentity({ pid: randomUUID(), n: nextPlayerNo++, domain, name: domain, match: 'none', campaign: null, turret: -1 }));
    players.set(p.pid, p);
    autoSeat(p);
    logEvent(`${p.name} (${domain}) vào phòng · ${p.turret >= 0 ? `ụ ${p.turret + 1}` : 'hết ụ, bắn từ lối đi'} · ${grantLabel(p)}`, 'join');
    if (twin) logEvent(`⚠ ${domain} đang mở trên hai máy — chiến dịch sẽ thấy hai dòng cho một người`, 'warn');
    if (rosterIndex.size && p.match === 'none') logEvent(`⚠ ${domain} không có trong danh sách chiến dịch — ghép tay ở thẻ Phần thưởng để họ nhận được vật phẩm`, 'warn');
    broadcastScreens(seatsMessage());
    refreshHost();
  } else if (domain && domain !== p.domain) {
    const was = p.name;
    p.domain = domain;
    p.match = 'none';
    applyIdentity(p);
    // Gõ lại domain khác khi còn ở phòng chờ là đổi hẳn người, nên khay vật phẩm theo người mới.
    if (['lobby', 'end'].includes(game.phase)) p.items = { ...p.grant };
    logEvent(`${was} đổi domain thành ${domain} · ${grantLabel(p)}`, 'info');
    if (p.turret >= 0) broadcastScreens(seatsMessage());
    refreshHost();
  }
  return [200, joinPayload(p)];
}

// Ô nhập tên trên điện thoại hỏi đường này trong lúc người ta gõ. Đây là đường công khai (ai quét
// được QR là gọi được), nên nó chỉ xác nhận cái người gõ đã gần đúng sẵn: gợi ý chỉ hiện khi lệch
// một hai ký tự, không bao giờ trả về một danh sách để dò dần.
const lookupHits = new Map();   // IP → [số lượt trong cửa sổ, mốc thời gian]
const LOOKUP_PER_MINUTE = 60;

function lookupDomain(req, raw) {
  // Sau proxy của Render, remoteAddress là IP của chính proxy — cả hội trường dùng chung một rổ
  // và đếm tới 40 là khoá hết cả phòng. Lấy hop đầu của x-forwarded-for để mỗi máy một rổ.
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const who = forwarded || req.socket.remoteAddress || '?';
  const now = Date.now();
  const seen = lookupHits.get(who);
  if (!seen || now - seen[1] > 60000) lookupHits.set(who, [1, now]);
  else if (++seen[0] > LOOKUP_PER_MINUTE) return [429, { on: true, busy: true }];
  if (lookupHits.size > 500) for (const [k, v] of lookupHits) if (now - v[1] > 60000) lookupHits.delete(k);

  const hit = lookup(rosterIndex, raw);
  return [200, {
    on: rosterIndex.size > 0,
    domain: hit.domain,
    ok: MATCHED.has(hit.how),
    how: hit.how,
    name: hit.person?.name ?? '',
    unit: hit.person?.unit ?? '',
    // Gõ đúng rồi thì cho người ta thấy luôn mình sắp cầm những gì vào trận.
    items: hit.person ? grantFor(hit.person) : null,
    days: hit.person?.days ?? null,
    near: hit.near.map(person => ({ domain: person.domain, name: person.name })),
  }];
}

// Thẻ Phần thưởng của MC: ai nhận được đúng suất của mình, ai chưa ghép được (nên đang tay
// trắng), và trong danh sách chiến dịch còn bao nhiêu người hôm nay không tới chơi.
function mappingReport() {
  const board = leaderboard();
  const taken = new Set(board.map(p => p.campaign?.domain).filter(Boolean));
  const seen = new Map();
  for (const p of board) seen.set(p.domain, (seen.get(p.domain) ?? 0) + 1);
  const row = p => ({
    pid: p.pid, n: p.n, name: p.name, domain: p.domain, match: p.match, score: p.score,
    correct: p.correct, shots: p.shots, online: isOnline(p) ? 1 : 0, duplicate: seen.get(p.domain) > 1 ? 1 : 0,
    grant: { ...p.grant }, items: { ...p.items },
    campaign: p.campaign
      ? { domain: p.campaign.domain, email: p.campaign.email, name: p.campaign.name, unit: p.campaign.unit, days: p.campaign.days, quiz: p.campaign.quiz }
      : null,
    near: MATCHED.has(p.match) ? [] : nearPeople(p)
      .filter(person => !taken.has(person.domain))
      .slice(0, 4)
      .map(person => ({ domain: person.domain, email: person.email, name: person.name, unit: person.unit, items: grantFor(person) })),
  });
  return {
    roster: rosterMeta(),
    matched: board.filter(p => MATCHED.has(p.match)).map(row),
    unmatched: board.filter(p => !MATCHED.has(p.match)).map(row),
    absent: rosterIndex.people.filter(person => !taken.has(person.domain)).length,
  };
}

// MC chỉ tay một người trong danh sách chiến dịch cho một người chơi (hoặc bỏ chỉ định, cho về
// dò tự động). Ghép xong là vật phẩm của người đó về tay ngay, nếu ván chưa bắt đầu.
function assignPlayer({ pid, domain }) {
  const p = players.get(pid);
  if (!p) return [404, { error: 'Không còn người chơi này' }];
  if (domain === null || domain === '') {
    p.match = 'none';
    applyIdentity(p);
  } else {
    const person = rosterIndex.byDomain.get(normalizeDomain(domain));
    if (!person) return [400, { error: 'Không có ai trong danh sách chiến dịch với domain này' }];
    const clash = [...players.values()].find(o => o !== p && o.campaign?.domain === person.domain);
    if (clash) return [409, { error: `${person.email} đã ghép cho người chơi gõ "${clash.domain}" — bỏ ghép người đó trước` }];
    p.match = 'manual';
    p.campaign = person;
    applyIdentity(p);
    logEvent(`MC ghép ${p.domain} → ${person.email} · ${grantLabel(p)}`, 'info');
  }
  if (['lobby', 'end'].includes(game.phase)) p.items = { ...p.grant };
  if (p.turret >= 0) broadcastScreens(seatsMessage());
  sendRanks();
  refreshHost();
  return [200, { ok: true, match: p.match, name: p.name }];
}

function submitAnswer(p, index, choice) {
  if (game.phase !== 'question' || index !== game.index) return [409, { error: 'Câu hỏi này đã đóng' }];
  if (p.picks[index]) return [409, { error: 'Bạn đã trả lời câu này rồi' }];
  const q = game.round[index];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return [400, { error: 'Đáp án không hợp lệ' }];
  if (p.hints[index]?.includes(choice)) return [400, { error: 'Đáp án này đã bị Buddy loại' }];
  p.picks[index] = { choice, ms: Math.min(game.quiz.time * 1000, Date.now() - game.startedAt) };
  // Everyone connected has answered → reveal shortly instead of waiting out the timer.
  const online = [...players.values()].filter(isOnline);
  if (online.length && online.every(o => o.picks[index])) {
    const at = Date.now() + ALL_ANSWERED_DELAY * 1000;
    if (at < game.endsAt) {
      clearTimeout(game.timer);
      game.endsAt = at;
      game.timer = setTimeout(revealAnswer, ALL_ANSWERED_DELAY * 1000);
      logEvent(`Cả ${online.length} người online đã trả lời câu ${index + 1}`, 'info');
      broadcast();
    }
  }
  refreshHost();
  return [200, { recorded: true, choice }];
}

function tapFire(p, index, n) {
  if (game.phase !== 'fire' || !game.firing || index !== game.index) return [409, { error: 'Chưa tới lượt bắn' }];
  const result = p.results[index];
  if (!result?.correct) return [403, { error: 'Chỉ ai trả lời đúng mới được bắn lượt này' }];
  const now = Date.now();
  p.tapTokens = Math.min(TAP_BURST, p.tapTokens + ((now - p.tapAt) / 1000) * TAP_RATE);
  p.tapAt = now;
  const taps = Math.min(Math.floor(p.tapTokens), clamp(Math.trunc(Number(n)) || 0, 0, TAP_BURST));
  if (taps > 0) {
    p.tapTokens -= taps;
    // The quiz rounds stop at the floor: however hard the hall taps, the boss survives to the
    // finale, where the charged shot — and only that — finishes it.
    const cap = game.boss.max * (1 - BOSS_FLOOR);
    const wasCapped = game.boss.dmg >= cap;
    game.boss.dmg = Math.min(cap, game.boss.dmg + taps * (result.double ? 2 : 1));
    p.shots += taps;
    p.roundShots += taps;
    game.roundShots += taps;
    game.totalShots += taps;
    pendingShots.set(p.turret, (pendingShots.get(p.turret) ?? 0) + taps);
    bossChanged = true;
    if (!wasCapped && game.boss.dmg >= cap) logEvent(`Quái Vật chỉ còn ${Math.round(BOSS_FLOOR * 100)}% máu — chờ đòn kết liễu ở câu cuối`, 'info');
  }
  return [200, { taps, shots: p.roundShots, boss: bossPercent() }];
}

function useItem(p, item) {
  if (!ITEMS.includes(item)) return [400, { error: 'Vật phẩm không tồn tại' }];
  if (!['countdown', 'reading', 'question', 'reveal', 'fire'].includes(game.phase)) return [409, { error: 'Chỉ dùng vật phẩm trong lúc chơi' }];
  if (!(p.items[item] > 0)) return [409, { error: 'Bạn đã dùng vật phẩm này rồi' }];
  let removed = null;
  if (item === 'hint') {
    if (game.phase !== 'question') return [409, { error: 'Buddy thông thái chỉ dùng được khi đang có câu hỏi' }];
    if (p.picks[game.index]) return [409, { error: 'Bạn đã trả lời câu này rồi' }];
    const q = game.round[game.index];
    const wrong = q.options.map((_, i) => i).filter(i => i !== q.answer);
    removed = shuffle(wrong).slice(0, Math.max(0, q.options.length - 2));
    p.hints[game.index] = removed;
  } else {
    if (p.armed[item]) return [409, { error: 'Vật phẩm này đang bật sẵn rồi' }];
    p.armed[item] = true;
    if (p.turret >= 0) broadcastScreens({ type: 'item', t: p.turret, item });
  }
  p.items[item]--;
  logEvent(`${p.name} dùng ${ITEM_INFO[item].name}`, 'item');
  return [200, { item, removed, items: p.items, armed: p.armed }];
}

const MATCH_LABEL = { exact: 'khớp', key: 'khớp (thiếu dấu chấm)', manual: 'MC ghép tay', none: 'chưa ghép' };

// Cột `domain` là chuỗi người ta tự gõ, `campaign_email` là người trong danh sách chiến dịch mà
// nó ghép về — giữ cả hai để sau buổi còn soát lại được, chứ không phải tin một cột đã bị sửa.
// Ba cột `got_*` ghi lại đúng những gì người đó cầm vào trận, để đối chiếu với chiến dịch.
function resultsCsv() {
  const cell = v => {
    const s = String(v ?? '');
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const header = [
    'domain', 'campaign_email', 'campaign_name', 'campaign_unit', 'match', 'name',
    'login_days', 'got_hint', 'got_shield', 'got_boost',
    'score', 'correct', 'time_s', 'shots', ...game.round.map(q => q.id),
  ];
  const yesNo = n => (n ? 'có' : '');
  const rows = leaderboard().map(p => [
    p.domain, p.campaign?.email ?? '', p.campaign?.name ?? '', p.campaign?.unit ?? '', MATCH_LABEL[p.match] ?? p.match, p.name,
    p.campaign?.days ?? '', yesNo(p.grant.hint), yesNo(p.grant.shield), yesNo(p.grant.boost),
    p.score, p.correct, (p.timeMs / 1000).toFixed(1), p.shots,
    ...game.round.map((q, qi) => {
      const a = p.picks[qi]?.choice;
      return a === undefined ? '' : `${LETTERS[a]} ${a === q.answer ? '✔' : '✘'}`;
    }),
  ]);
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

// ---- HTTP ----------------------------------------------------------------------

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Mặc định chật, vì mọi đường của điện thoại đều chỉ gửi vài chục byte. Riêng danh sách LMS là cả
// một bản xuất nhân sự dán vào, nên nó tự khai trần rộng hơn.
async function readJson(req, limit = 16_000) {
  const chunks = [];
  let size = 0;
  let over = false;
  for await (const chunk of req) {
    size += chunk.length;
    // Quá cỡ thì vẫn đọc cho hết rồi mới từ chối: cắt ngang lúc client còn đang gửi thì nó nhận
    // được "connection reset" chứ không phải câu báo lỗi mình vừa viết ra.
    if (over) {
      if (size > limit * 4 + 1_000_000) { req.destroy(); break; }
    } else if (size > limit) {
      over = true;
      chunks.length = 0;
    } else {
      chunks.push(chunk);
    }
  }
  if (over) throw new Error('Body too large');
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function openStream(req, res, set, onClose) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  set.add(res);
  req.on('close', () => {
    set.delete(res);
    onClose?.();
  });
}

function openHostStream(req, res, view) {
  if (view === 'screen' || view === 'preview') {
    const projector = view === 'screen';
    openStream(req, res, projector ? screenStreams : previewStreams, () => {
      if (!projector) return;
      logEvent(screenStreams.size ? `Một màn chiếu đã đóng (còn ${screenStreams.size})` : 'Màn chiếu mất kết nối', 'bad');
      refreshHost();
    });
    send(res, stateFor('screen'));
    send(res, seatsMessage());
    send(res, fearMessage('screen'));
    // A projector reloaded mid-round lights up this round's shooters again, without replaying the hits.
    if (game.phase === 'fire') send(res, attackMessage(true));
    if (projector) {
      logEvent(screenStreams.size > 1 ? `Có thêm màn chiếu (${screenStreams.size} màn)` : 'Màn chiếu đã kết nối', 'good');
      refreshHost();
    }
    return;
  }
  openStream(req, res, adminStreams);
  send(res, stateFor('admin'));
  send(res, roundMessage());
  send(res, fearMessage('admin'));
  send(res, { type: 'logs', entries: activity });
}

async function handleApi(req, res, url, path) {
  if (path === '/api/join' && req.method === 'POST') return json(res, ...joinPlayer(await readJson(req)));
  // Soát domain trong lúc người ta còn đang gõ, trước khi bấm Vào chơi.
  if (path === '/api/lookup') return json(res, ...lookupDomain(req, url.searchParams.get('d')));

  // Đoạn mở màn có đường riêng: nó chạy trước game cả tiếng, không dính gì tới ụ súng hay điểm.
  if (path === '/api/fear/join' && req.method === 'POST') return json(res, ...fearJoin());
  if (path === '/api/fear/word' && req.method === 'POST') {
    const body = await readJson(req);
    return json(res, ...addFear(body.pid, body.text));
  }
  if (path === '/api/fear/events') {
    openStream(req, res, fearStreams);
    send(res, fearMessage('player'));
    return;
  }

  const playerRoutes = { '/api/answer': 'answer', '/api/tap': 'tap', '/api/item': 'item', '/api/react': 'react' };
  if (playerRoutes[path] && req.method === 'POST') {
    const body = await readJson(req);
    const p = players.get(body.pid);
    if (!p) return json(res, 404, { error: 'Không tìm thấy người chơi, hãy vào lại' });
    // index -1 marks the finale: its question is not part of the round and is not scored.
    if (path === '/api/answer') {
      return json(res, ...(body.index === -1 ? answerFinale(p, body.choice) : submitAnswer(p, body.index, body.choice)));
    }
    if (path === '/api/tap') return json(res, ...(body.index === -1 ? tapCharge(p, body.n) : tapFire(p, body.index, body.n)));
    if (path === '/api/react') return json(res, ...react(p, body.icon));
    return json(res, ...useItem(p, body.item));
  }

  if (path === '/api/events') {
    const pid = url.searchParams.get('pid');
    const p = players.get(pid);
    if (!p) return json(res, 404, { error: 'Unknown player' });
    if (!playerStreams.has(pid)) playerStreams.set(pid, new Set());
    const streams = playerStreams.get(pid);
    if (!streams.size) notePresence(p, true);
    openStream(req, res, streams, () => {
      if (!streams.size) notePresence(p, false);
      refreshHost();
    });
    send(res, stateFor('player'));
    send(res, youMessage(p, leaderboard().indexOf(p) + 1));
    refreshHost();
    return;
  }

  if (path.startsWith('/api/host/')) {
    if (url.searchParams.get('key') !== HOST_KEY) return json(res, 403, { error: 'Sai host key' });
    const action = path.slice('/api/host/'.length);
    if (action === 'events') {
      openHostStream(req, res, url.searchParams.get('view'));
      return;
    }
    if (action === 'results.csv') {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="fox-quiz-results.csv"',
      });
      res.end(resultsCsv());
      return;
    }
    // The dashboard's question editor. Reading is safe at any time; writing never touches a game
    // in progress — it lands in the file and takes effect on the next "Bắt đầu / Chơi lại".
    if (action === 'questions' && req.method === 'GET') {
      return json(res, 200, {
        data: readQuizFile(),
        ephemeral: !!PUBLIC_URL && !REMOTE_QUIZ,
        remote: REMOTE_QUIZ,
        live: !['lobby', 'end'].includes(game.phase),
      });
    }
    if (action === 'questions' && req.method === 'POST') {
      let clean;
      try {
        clean = validateQuizData(await readJson(req));
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
      if (REMOTE_QUIZ) {
        try {
          await supabaseSaveQuiz(clean);
        } catch (err) {
          return json(res, 500, { error: `Không lưu lên Supabase được nên chưa đổi gì: ${err.message}` });
        }
      }
      try {
        writeQuizFile(clean);
      } catch (err) {
        return json(res, 500, { error: `Không ghi được data/questions.json: ${err.message}` });
      }
      const applied = ['lobby', 'end'].includes(game.phase);
      if (applied) game.quiz = loadQuiz();
      logEvent(`MC sửa bộ câu hỏi: ${clean.order.length} câu${applied ? '' : ' (áp dụng ở ván sau)'}`, 'warn');
      broadcastHost();
      return json(res, 200, { ok: true, applied, remote: REMOTE_QUIZ, count: clean.order.length });
    }
    // ---- Ghép danh sách LMS ----
    if (action === 'mapping' && req.method === 'GET') return json(res, 200, mappingReport());
    if (action === 'people' && req.method === 'GET') {
      // Ô tìm của MC: cả danh sách nằm trên server, chỉ 8 dòng khớp mới đi qua đường truyền.
      const taken = new Set([...players.values()].map(p => p.campaign?.domain).filter(Boolean));
      return json(res, 200, {
        people: search(rosterIndex, url.searchParams.get('q'), 20)
          .filter(person => !taken.has(person.domain))
          .slice(0, 8)
          .map(person => ({ domain: person.domain, email: person.email, name: person.name, unit: person.unit })),
      });
    }
    if (action === 'roster' && req.method === 'POST') {
      // Vài nghìn nhân sự dán một lượt: 8 MB đủ cho cỡ 80 nghìn dòng, vẫn chặn được ai dán nhầm
      // cả file Excel nhị phân vào đây.
      let body;
      try {
        body = await readJson(req, 8_000_000);
      } catch (err) {
        return json(res, 413, { error: err.message === 'Body too large' ? 'Danh sách quá lớn (>8 MB) — xuất lại chỉ cột email, tên và phòng ban' : err.message });
      }
      const parsed = parseRoster(body.text ?? '');
      if (!parsed.people.length) return json(res, 400, { error: 'Không đọc ra địa chỉ nào — dán lại cột email hoặc cả bảng từ Excel' });
      try {
        await saveRoster({ people: parsed.people, rewards: parsed.rewards, source: String(body.source ?? 'dán tay').slice(0, 120), updatedAt: new Date().toISOString() });
      } catch (err) {
        return json(res, 500, { error: `Không lưu lên Supabase được nên chưa đổi gì: ${err.message}` });
      }
      rematchPlayers();
      const how = parsed.rewards ? 'theo phần thưởng trong file' : 'không có cột phần thưởng — ai trong danh sách nhận đủ 3 món';
      logEvent(`Nạp danh sách chiến dịch: ${parsed.people.length} người, ${how}${parsed.duplicates ? `, bỏ ${parsed.duplicates} dòng trùng` : ''}`, 'good');
      return json(res, 200, { ok: true, ...rosterMeta(), skipped: parsed.skipped, duplicates: parsed.duplicates, columns: parsed.columns });
    }
    if (action === 'roster' && req.method === 'DELETE') {
      try {
        await saveRoster(EMPTY_ROSTER);
      } catch (err) {
        return json(res, 500, { error: `Không xoá trên Supabase được: ${err.message}` });
      }
      for (const p of players.values()) p.match = 'none';
      rematchPlayers();
      logEvent('Đã xoá danh sách chiến dịch — cả phòng quay lại nhận đủ 3 vật phẩm', 'warn');
      return json(res, 200, { ok: true, ...rosterMeta() });
    }
    if (action === 'assign' && req.method === 'POST') {
      const body = await readJson(req);
      return json(res, ...assignPlayer({ pid: String(body.pid ?? ''), domain: body.domain ?? null }));
    }

    if (action === 'joinurl' && req.method === 'POST') {
      const { url: chosen } = await readJson(req);
      if (!JOIN_URLS.includes(chosen)) return json(res, 400, { error: 'Link không hợp lệ' });
      game.joinUrl = chosen;
      logEvent(`Màn chiếu đổi link vào chơi: ${chosen}`, 'info');
      broadcastHost();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST') {
      try {
        if (hostAction(action)) return json(res, 200, { ok: true });
      } catch (err) {
        return json(res, 500, { error: err.message });
      }
    }
  }
  json(res, 404, { error: 'Not found' });
}

// Browsers request byte ranges when resuming or seeking a victory clip after reconnecting.
async function serveVideo(req, res, file, type) {
  const { size } = await stat(file);
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  let start = 0;
  let end = size - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      if (match[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      } else {
        start = Math.max(0, size - Number(match[2]));
      }
    } else start = size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD' || !size) res.end();
  else createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

async function serveStatic(req, res, urlPath) {
  const clean = normalize(ROUTES[urlPath] ?? urlPath).replace(/\\/g, '/');
  if (PRIVATE.test(clean)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const file = join(root, clean.replace(/^\/+/, ''));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    if (type.startsWith('video/')) return await serveVideo(req, res, file, type);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/')) await handleApi(req, res, url, path);
    else await serveStatic(req, res, path);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Lỗi server' });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Cổng ${PORT} đang bị dùng. Tắt server cũ (Ctrl+C) hoặc chạy: node server.js --port=${PORT + 1}`);
  else console.error(err);
  process.exit(1);
});

const quizSource = await hydrateQuizFromSupabase();
if (quizSource === 'pulled') game.quiz = loadQuiz();
await loadRoster();

server.listen(PORT, () => {
  const unconfirmed = game.quiz.questions.filter(q => q.answerConfirmed === false).map(q => q.id);
  console.log('\n🦊 Fox Quiz đang chạy\n');
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  console.log(`  Người chơi (điện thoại${PUBLIC_URL ? ', mạng nào cũng được' : ', chung wifi'}): ${JOIN_URL}`);
  for (const u of JOIN_URLS.slice(1)) console.log(`                                       ${u}`);
  console.log(`  Bảng điều khiển MC (màn laptop):     ${base}/host?key=${HOST_KEY}`);
  console.log(`  Màn game cho máy chiếu:              ${base}/screen?key=${HOST_KEY}`);
  console.log(`  Bản swarm cũ để test sprite:         ${base}/sandbox\n`);
  const store = {
    pulled: 'Supabase (bản MC sửa lần trước)',
    seeded: 'Supabase (vừa đẩy bản trong repo lên làm bản đầu)',
    error: '⚠ data/questions.json — Supabase lỗi, sửa xong sẽ mất khi server ngủ dậy',
    off: 'data/questions.json (máy này thôi)',
  }[quizSource];
  console.log(`  Bộ câu hỏi: ${game.quiz.questions.length} câu, ${game.quiz.time}s trả lời + ${game.quiz.fire}s bắn/câu, ${TURRET_SLOTS} ụ súng`);
  console.log(`  Lưu ở: ${store}`);
  console.log(rosterIndex.size
    ? `  Chiến dịch 7 ngày: ${rosterIndex.size} người${roster.rewards ? ', phát vật phẩm theo file' : ' (file không có cột phần thưởng → ai trong danh sách nhận đủ 3 món)'}`
    : '  Chiến dịch 7 ngày: chưa nạp danh sách — cả phòng nhận đủ 3 vật phẩm');
  if (unconfirmed.length) console.log(`  ⚠ Đáp án cần team xác nhận: ${unconfirmed.join(', ')}`);
});

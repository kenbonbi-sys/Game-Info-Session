// Fox Quiz: static files + realtime quiz over Server-Sent Events. No dependencies.
//   node server.js               → cổng 5173
//   node server.js --port=5174   → cổng khác
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  '.md': 'text/markdown; charset=utf-8',
};
const ROUTES = { '/': '/index.html', '/host': '/host.html', '/sandbox': '/sandbox.html' };
// Never serve the answer key or server internals.
const PRIVATE = /^\/(data|\.claude|node_modules)(\/|$)|^\/server\.js$/i;

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

const JOIN_URLS = process.env.PUBLIC_URL ? [process.env.PUBLIC_URL] : lanUrls();
const JOIN_URL = JOIN_URLS[0] ?? `http://localhost:${PORT}`;

// ---- Quiz ----------------------------------------------------------------------

function loadQuiz() {
  const raw = readFileSync(join(root, 'data', 'questions.json'), 'utf8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);
  const byId = new Map(data.questions.map(q => [q.id, q]));
  const ids = data.order?.length ? data.order : data.questions.map(q => q.id);
  const questions = ids.map(id => {
    const q = byId.get(id);
    if (!q) throw new Error(`data/questions.json: "order" có "${id}" nhưng không có câu hỏi này`);
    if (!Array.isArray(q.options) || q.options.length < 2 || !(q.answer >= 0 && q.answer < q.options.length)) {
      throw new Error(`data/questions.json: câu "${id}" thiếu options hoặc answer sai`);
    }
    return q;
  });
  return {
    time: data.timePerQuestion ?? 15,
    reveal: data.revealSeconds ?? 5,
    shuffle: data.shuffleOptions !== false,
    questions,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const game = { phase: 'lobby', quiz: loadQuiz(), round: [], index: -1, startedAt: 0, endsAt: 0, timer: null, auto: true, turrets: [] };
const players = new Map();        // pid → player
const playerStreams = new Map();  // pid → Set<res>
const hostStreams = new Set();

// Every online fox is visible to every player: positions are batched and flushed 5×/s.
let nextPlayerNo = 1;
const movedPlayers = new Set();  // player numbers whose position changed since the last flush
const cameOnline = new Map();    // player number → name (joined, renamed or reconnected)
const wentOffline = new Set();

// Water-cannon turrets, one seat each (game.turrets[i] = pid | null). The space arena map has
// exactly 30 painted slots, so there are always 30 turrets. Picked in the lobby, locked once the
// game starts; unseated players get the first free one, and play without a turret if all are taken.
const TURRET_SLOTS = 30;

function ensureTurrets() {
  while (game.turrets.length < TURRET_SLOTS) game.turrets.push(null);
}

function autoSeat(p) {
  if (p.turret >= 0) return;
  ensureTurrets();
  const i = game.turrets.indexOf(null);
  if (i < 0) return;
  game.turrets[i] = p.pid;
  p.turret = i;
}

function turretsMessage() {
  ensureTurrets();
  return {
    type: 'turrets',
    count: game.turrets.length,
    seats: game.turrets.flatMap((pid, i) => {
      const p = pid && players.get(pid);
      return p ? [[i, p.n, p.name]] : [];
    }),
  };
}

function hallScore() {
  let sum = 0;
  for (const p of players.values()) sum += p.score;
  return sum;
}

const ITEMS = ['hint', 'shield', 'boost'];

function freshStats(p) {
  return Object.assign(p, {
    score: 0, correct: 0, streak: 0, timeMs: 0, answers: {},
    // One of each item per game: hint removes 2 wrong options, shield absorbs the next miss,
    // boost doubles the next correct answer.
    items: { hint: 1, shield: 1, boost: 1 }, armed: { shield: false, boost: false }, hints: {},
  });
}

function youMessage(p, rank) {
  return {
    type: 'you', score: p.score, correct: p.correct, rank, players: players.size,
    items: p.items, armed: p.armed, hint: game.phase === 'question' ? p.hints[game.index] ?? null : null,
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
    const c = p.answers[game.index];
    if (c === undefined) continue;
    counts[c]++;
    answered++;
  }
  return { counts, answered };
}

function stateFor(role) {
  const q = game.round[game.index];
  const s = {
    type: 'state',
    phase: game.phase,
    index: game.index,
    total: game.round.length || game.quiz.questions.length,
    time: game.quiz.time,
    endsAt: game.endsAt,
    now: Date.now(),
    players: players.size,
    hall: hallScore(),
  };
  if (q && (game.phase === 'question' || game.phase === 'reveal')) {
    s.question = { id: q.id, group: q.group, text: q.text, options: q.options };
    if (game.phase === 'reveal') s.answer = q.answer;
  }
  if (role === 'host') {
    Object.assign(s, answerCounts(), {
      joinUrl: JOIN_URL,
      joinUrls: JOIN_URLS,
      auto: game.auto,
      names: [...players.values()].slice(-80).map(p => p.name),
      top: leaderboard().slice(0, 5).map(p => ({ name: p.name, score: p.score, correct: p.correct })),
      hallScore: s.hall,
    });
  }
  return s;
}

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastHost() {
  if (!hostStreams.size) return;
  const s = stateFor('host');
  for (const res of hostStreams) send(res, s);
}

function broadcastPlayers(msg) {
  for (const set of playerStreams.values()) for (const res of set) send(res, msg);
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

setInterval(broadcastHost, 1000);
setInterval(() => {
  for (const set of playerStreams.values()) for (const res of set) res.write(': ping\n\n');
  for (const res of hostStreams) res.write(': ping\n\n');
}, 15000);
setInterval(() => {
  if (!movedPlayers.size && !cameOnline.size && !wentOffline.size) return;
  const msg = {
    type: 'pos',
    left: [...wentOffline],
    names: [...cameOnline],
    p: [...players.values()].filter(p => movedPlayers.has(p.n)).map(p => [p.n, p.x, p.y, p.v]),
  };
  movedPlayers.clear();
  cameOnline.clear();
  wentOffline.clear();
  broadcastPlayers(msg);
}, 200);

function schedule(phase, seconds, next) {
  clearTimeout(game.timer);
  game.timer = null;
  game.phase = phase;
  game.endsAt = seconds > 0 ? Date.now() + seconds * 1000 : 0;
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
  broadcastPlayers(turretsMessage());
  schedule('countdown', 3, nextQuestion);
  sendRanks();
}

function nextQuestion() {
  game.index++;
  if (game.index >= game.round.length) {
    schedule('end', 0);
    sendRanks();
    return;
  }
  game.startedAt = Date.now();
  schedule('question', game.quiz.time, revealAnswer);
}

function revealAnswer() {
  const limit = game.quiz.time * 1000;
  const missed = [];
  const blocked = [];
  for (const p of players.values()) {
    if (p.answers[game.index] !== undefined) continue;
    p.timeMs += limit;
    // No answer counts as wrong: the boss shoots the turret, unless a shield absorbs it (streak kept).
    if (p.armed.shield) {
      p.armed.shield = false;
      if (p.turret >= 0) blocked.push(p.turret);
    } else {
      p.streak = 0;
      if (p.turret >= 0) missed.push(p.turret);
    }
  }
  if (missed.length || blocked.length) broadcastPlayers({ type: 'miss', turrets: missed, blocked });
  schedule('reveal', game.auto ? game.quiz.reveal : 0, nextQuestion);
  sendRanks();
}

function hostAction(action) {
  switch (action) {
    case 'start':
      if (game.phase === 'lobby' || game.phase === 'end') startGame();
      return true;
    case 'next':
      if (game.phase === 'question') revealAnswer();
      else if (game.phase === 'countdown' || game.phase === 'reveal') nextQuestion();
      return true;
    case 'reset':
      game.round = [];
      game.index = -1;
      for (const p of players.values()) freshStats(p);
      schedule('lobby', 0);
      sendRanks();
      return true;
    case 'auto':
      game.auto = !game.auto;
      if (game.phase === 'reveal' && game.auto) schedule('reveal', game.quiz.reveal, nextQuestion);
      else broadcast();
      return true;
    default:
      return false;
  }
}

function joinPlayer(body) {
  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  let p = typeof body.pid === 'string' ? players.get(body.pid) : undefined;
  if (!p) {
    if (!name) return [400, { error: 'Nhập tên để vào chơi' }];
    p = freshStats({ pid: randomUUID(), n: nextPlayerNo++, name, x: -1, y: -1, v: 0, turret: -1 });
    players.set(p.pid, p);
    if (game.phase !== 'lobby') autoSeat(p);
    broadcast();
    broadcastPlayers(turretsMessage());
  } else if (name) {
    p.name = name;
    if (playerStreams.get(p.pid)?.size) cameOnline.set(p.n, p.name);
    if (p.turret >= 0) broadcastPlayers(turretsMessage());
  }
  return [200, { pid: p.pid, n: p.n, name: p.name, score: p.score, answered: Object.keys(p.answers).map(Number) }];
}

function submitAnswer(p, index, choice) {
  if (game.phase !== 'question' || index !== game.index) return [409, { error: 'Câu hỏi này đã đóng' }];
  if (p.answers[index] !== undefined) return [409, { error: 'Bạn đã trả lời câu này rồi' }];
  const q = game.round[index];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return [400, { error: 'Đáp án không hợp lệ' }];
  const limit = game.quiz.time * 1000;
  const elapsed = Math.min(limit, Date.now() - game.startedAt);
  const correct = choice === q.answer;
  const double = correct && p.armed.boost;
  const blocked = !correct && p.armed.shield;
  if (double) p.armed.boost = false;
  if (blocked) p.armed.shield = false;
  if (correct) p.streak++;
  else if (!blocked) p.streak = 0;
  let points = correct ? Math.round(500 + 500 * (1 - elapsed / limit)) + Math.min(p.streak - 1, 5) * 50 : 0;
  if (double) points *= 2;
  p.score += points;
  p.correct += correct ? 1 : 0;
  p.timeMs += elapsed;
  p.answers[index] = choice;
  // Everyone sees this player's turret fire (correct) or get shot by the boss (wrong).
  broadcastPlayers({ type: 'fire', t: p.turret, n: p.n, ok: correct, pts: points, hall: hallScore(), double, blocked });
  // Everyone answered → close the question 2s later instead of waiting out the timer.
  if ([...players.values()].every(o => o.answers[index] !== undefined)) {
    clearTimeout(game.timer);
    game.endsAt = Math.min(game.endsAt, Date.now() + 2000);
    game.timer = setTimeout(revealAnswer, Math.max(0, game.endsAt - Date.now()));
    broadcast();
  }
  return [200, { correct, points, answer: q.answer, score: p.score, streak: p.streak, double, blocked, items: p.items, armed: p.armed }];
}

function useItem(p, item) {
  if (!ITEMS.includes(item)) return [400, { error: 'Vật phẩm không tồn tại' }];
  if (!['countdown', 'question', 'reveal'].includes(game.phase)) return [409, { error: 'Chỉ dùng vật phẩm trong lúc chơi' }];
  if (!(p.items[item] > 0)) return [409, { error: 'Bạn đã dùng vật phẩm này rồi' }];
  let removed = null;
  if (item === 'hint') {
    if (game.phase !== 'question') return [409, { error: 'Buddy thông thái chỉ dùng được khi đang có câu hỏi' }];
    if (p.answers[game.index] !== undefined) return [409, { error: 'Bạn đã trả lời câu này rồi' }];
    const q = game.round[game.index];
    const wrong = q.options.map((_, i) => i).filter(i => i !== q.answer);
    removed = shuffle(wrong).slice(0, Math.max(0, q.options.length - 2));
    p.hints[game.index] = removed;
  } else {
    if (p.armed[item]) return [409, { error: 'Vật phẩm này đang bật sẵn rồi' }];
    p.armed[item] = true;
    broadcastPlayers({ type: 'item', t: p.turret, n: p.n, item });
  }
  p.items[item]--;
  return [200, { item, removed, items: p.items, armed: p.armed }];
}

function resultsCsv() {
  const cell = v => {
    const s = String(v);
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const header = ['rank', 'name', 'score', 'correct', 'time_s', ...game.round.map(q => q.id)];
  const rows = leaderboard().map((p, i) => [
    i + 1, p.name, p.score, p.correct, (p.timeMs / 1000).toFixed(1),
    ...game.round.map((q, qi) => {
      const a = p.answers[qi];
      return a === undefined ? '' : `${'ABCD'[a]} ${a === q.answer ? '✔' : '✘'}`;
    }),
  ]);
  return '\uFEFF' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

// ---- HTTP ----------------------------------------------------------------------

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_000) throw new Error('Body too large');
    chunks.push(chunk);
  }
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

async function handleApi(req, res, url, path) {
  if (path === '/api/join' && req.method === 'POST') return json(res, ...joinPlayer(await readJson(req)));

  if (path === '/api/answer' && req.method === 'POST') {
    const body = await readJson(req);
    const p = players.get(body.pid);
    if (!p) return json(res, 404, { error: 'Không tìm thấy người chơi, hãy vào lại' });
    return json(res, ...submitAnswer(p, body.index, body.choice));
  }

  if (path === '/api/move' && req.method === 'POST') {
    const body = await readJson(req);
    const p = players.get(body.pid);
    if (!p) return json(res, 404, { error: 'Unknown player' });
    const coord = v => clamp(Math.round(Number(v)) || 0, 0, 5000);
    p.x = coord(body.x);
    p.y = coord(body.y);
    p.v = clamp(Math.trunc(Number(body.v)) || 0, 0, 15);
    movedPlayers.add(p.n);
    res.writeHead(204).end();
    return;
  }

  if (path === '/api/item' && req.method === 'POST') {
    const body = await readJson(req);
    const p = players.get(body.pid);
    if (!p) return json(res, 404, { error: 'Không tìm thấy người chơi, hãy vào lại' });
    return json(res, ...useItem(p, body.item));
  }

  if (path === '/api/turret' && req.method === 'POST') {
    const body = await readJson(req);
    const p = players.get(body.pid);
    if (!p) return json(res, 404, { error: 'Không tìm thấy người chơi, hãy vào lại' });
    if (game.phase !== 'lobby') return json(res, 409, { error: 'Game đã bắt đầu, ụ súng đã khoá' });
    ensureTurrets();
    if (body.action === 'leave') {
      if (p.turret >= 0) game.turrets[p.turret] = null;
      p.turret = -1;
    } else if (body.action === 'join') {
      const i = Number(body.turret);
      if (!Number.isInteger(i) || i < 0 || i >= game.turrets.length) return json(res, 400, { error: 'Ụ súng không tồn tại' });
      if (game.turrets[i] && game.turrets[i] !== p.pid) return json(res, 409, { error: 'Ụ này vừa có người vào' });
      if (p.turret >= 0) game.turrets[p.turret] = null;
      game.turrets[i] = p.pid;
      p.turret = i;
    } else {
      return json(res, 400, { error: 'Thao tác không hợp lệ' });
    }
    broadcastPlayers(turretsMessage());
    return json(res, 200, { turret: p.turret });
  }

  if (path === '/api/events') {
    const pid = url.searchParams.get('pid');
    const p = players.get(pid);
    if (!p) return json(res, 404, { error: 'Unknown player' });
    if (!playerStreams.has(pid)) playerStreams.set(pid, new Set());
    const streams = playerStreams.get(pid);
    if (streams.size === 0) {
      wentOffline.delete(p.n);
      cameOnline.set(p.n, p.name);
    }
    openStream(req, res, streams, () => {
      if (streams.size > 0) return;
      cameOnline.delete(p.n);
      wentOffline.add(p.n);
    });
    send(res, stateFor('player'));
    const online = [...players.values()].filter(o => o !== p && playerStreams.get(o.pid)?.size);
    send(res, { type: 'world', you: p.n, players: online.map(o => [o.n, o.name, o.x, o.y, o.v]) });
    send(res, turretsMessage());
    send(res, youMessage(p, leaderboard().indexOf(p) + 1));
    return;
  }

  if (path.startsWith('/api/host/')) {
    if (url.searchParams.get('key') !== HOST_KEY) return json(res, 403, { error: 'Sai host key' });
    const action = path.slice('/api/host/'.length);
    if (action === 'events') {
      openStream(req, res, hostStreams);
      send(res, stateFor('host'));
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

async function serveStatic(res, urlPath) {
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
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/')) await handleApi(req, res, url, path);
    else await serveStatic(res, path);
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

server.listen(PORT, () => {
  const unconfirmed = game.quiz.questions.filter(q => q.answerConfirmed === false).map(q => q.id);
  console.log('\n🦊 Fox Quiz đang chạy\n');
  console.log(`  Người chơi (điện thoại, chung wifi): ${JOIN_URL}`);
  for (const u of JOIN_URLS.slice(1)) console.log(`                                       ${u}`);
  console.log(`  Màn chiếu cho MC:                    http://localhost:${PORT}/host?key=${HOST_KEY}`);
  console.log(`  Bản swarm cũ để test sprite:         http://localhost:${PORT}/sandbox\n`);
  console.log(`  Bộ câu hỏi: ${game.quiz.questions.length} câu, ${game.quiz.time}s/câu (data/questions.json)`);
  if (unconfirmed.length) console.log(`  ⚠ Đáp án cần team xác nhận: ${unconfirmed.join(', ')}`);
});

// Fox Quiz: static files + realtime quiz over Server-Sent Events. No dependencies.
//   node server.js               → cổng 5173
//   node server.js --port=5174   → cổng khác
// Three kinds of client: phones are answer pads, /screen is the game on the projector (no controls),
// and /host is the MC dashboard on the laptop. Each question runs question → reveal → fire:
// players who answered right tap to shoot, everyone else gets hit back.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA, SEAT_ORDER, ITEMS as ITEM_INFO } from './src/config.js';

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
const ROUTES = { '/': '/index.html', '/host': '/host.html', '/screen': '/screen.html', '/sandbox': '/sandbox.html' };
// Never serve the answer key or server internals.
const PRIVATE = /^\/(data|\.claude|node_modules)(\/|$)|^\/server\.js$/i;

// Boss HP is counted in shots: players at the start × questions × this. A hall that answers
// right and taps about 4 times a second brings it down near the last question; a quieter hall
// finishes it with one shared volley when the game ends.
const BOSS_SHOTS_PER_ANSWER = 24;
// Taps accepted per player: a steady rate with a small burst, so batching and jitter cost nothing
// but auto-clickers gain nothing either.
const TAP_RATE = 12;
const TAP_BURST = 12;
// Seconds between the end of shooting and the next question when auto-advance is on.
const FIRE_COOLDOWN = 2;
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

const JOIN_URLS = process.env.PUBLIC_URL ? [process.env.PUBLIC_URL] : lanUrls();
const JOIN_URL = JOIN_URLS[0] ?? `http://localhost:${PORT}`;

// ---- Quiz ----------------------------------------------------------------------

function loadQuiz() {
  const raw = readFileSync(join(root, 'data', 'questions.json'), 'utf8').replace(/^﻿/, '');
  const data = JSON.parse(raw);
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
  return {
    time: data.timePerQuestion ?? 15,
    reveal: data.revealSeconds ?? 5,
    fire: data.fireSeconds ?? 6,
    shuffle: data.shuffleOptions !== false,
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
  joinUrl: JOIN_URL,
};
const players = new Map();          // pid → player
const playerStreams = new Map();    // pid → Set<res>
const screenStreams = new Set();    // projector windows
const previewStreams = new Set();   // the dashboard's embedded preview: same feed, not counted as a projector
const adminStreams = new Set();     // MC dashboards
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
    score: 0, correct: 0, streak: 0, timeMs: 0, shots: 0,
    // picks[i] = { choice, ms } as submitted; results[i] is scored at the reveal, never before.
    picks: {}, results: {}, roundShots: 0, tapTokens: 0, tapAt: 0,
    // One of each item per game: hint removes 2 wrong options, shield absorbs the next miss,
    // boost doubles the next correct answer's points and shots.
    items: { hint: 1, shield: 1, boost: 1 }, armed: { shield: false, boost: false }, hints: {},
  });
}

const isOnline = p => (playerStreams.get(p.pid)?.size ?? 0) > 0;
const bossPercent = () => Math.round(100 * clamp(1 - game.boss.dmg / game.boss.max, 0, 1));

function youMessage(p, rank) {
  const i = game.index;
  const inRound = ['question', 'reveal', 'fire'].includes(game.phase);
  return {
    type: 'you', score: p.score, correct: p.correct, rank, players: players.size, turret: p.turret,
    items: p.items, armed: p.armed,
    hint: game.phase === 'question' ? p.hints[i] ?? null : null,
    picked: inRound ? p.picks[i]?.choice ?? null : null,
    result: game.phase === 'reveal' || game.phase === 'fire' ? p.results[i] ?? null : null,
    shots: game.phase === 'fire' ? p.roundShots : 0,
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
  if (game.phase === 'question') return p.picks[game.index] ? 'answered' : '';
  const r = (game.phase === 'reveal' || game.phase === 'fire') && p.results[game.index];
  if (!r) return '';
  return r.correct ? 'correct' : r.blocked ? 'blocked' : r.timeout ? 'timeout' : 'wrong';
}

// role: 'player' (phones), 'screen' (projector and preview) or 'admin' (dashboard).
function stateFor(role) {
  const q = game.round[game.index];
  const inRound = q && ['question', 'reveal', 'fire'].includes(game.phase);
  const s = {
    type: 'state',
    phase: game.phase,
    index: game.index,
    total: game.round.length || game.quiz.questions.length,
    time: game.quiz.time,
    reveal: game.quiz.reveal,
    fire: game.quiz.fire,
    endsAt: game.endsAt,
    now: Date.now(),
    players: players.size,
    firing: game.firing,
    auto: game.auto,
    boss: bossPercent(),
  };
  // Phones get the number of tiles only: the question itself is read off the big screen.
  if (inRound) {
    s.options = q.options.length;
    if (game.phase !== 'question') s.answer = q.answer;
  }
  if (role === 'player') return s;
  if (inRound) s.question = { id: q.id, group: q.group, text: q.text, options: q.options };
  const board = leaderboard();
  Object.assign(s, answerCounts(), {
    joinUrl: game.joinUrl,
    joinUrls: JOIN_URLS,
    online: board.filter(isOnline).length,
    top: board.slice(0, 5).map(p => ({ name: p.name, score: p.score, correct: p.correct })),
    bossDmg: game.boss.dmg,
    bossMax: game.boss.max,
    finisher: game.boss.finisher,
    roundShots: game.roundShots,
    totalShots: game.totalShots,
  });
  if (role === 'admin') {
    // Only the dashboard knows the answer while players are still choosing.
    if (inRound) s.answerKey = q.answer;
    Object.assign(s, {
      screens: screenStreams.size,
      bossFellAt: game.boss.fellAt,
      turrets: TURRET_SLOTS,
      roster: board.map(p => [p.n, p.name, p.turret, isOnline(p) ? 1 : 0, p.score, p.correct, roundStatus(p), p.roundShots, p.shots]),
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

function schedule(phase, seconds, next) {
  clearTimeout(game.timer);
  game.timer = null;
  game.phase = phase;
  game.phaseAt = Date.now();
  if (phase !== 'fire') game.firing = false;
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
  game.boss = { max: Math.max(1, players.size) * game.round.length * BOSS_SHOTS_PER_ANSWER, dmg: 0, finisher: false, fellAt: -1 };
  game.roundShots = 0;
  game.totalShots = 0;
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
    endGame();
    return;
  }
  game.startedAt = Date.now();
  logEvent(`Câu ${game.index + 1}/${game.round.length} (${game.round[game.index].id})`, 'phase');
  schedule('question', game.quiz.time, revealAnswer);
  sendRanks();
}

function endGame() {
  // Whatever is left of the boss falls to one last volley from the whole hall.
  if (game.boss.dmg < game.boss.max) Object.assign(game.boss, { dmg: game.boss.max, finisher: true });
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
  schedule('fire', game.auto ? FIRE_COOLDOWN : 0, nextQuestion);
}

function hostAction(action) {
  switch (action) {
    case 'start':
      if (game.phase === 'lobby' || game.phase === 'end') startGame();
      return true;
    case 'next':
      if (Date.now() - game.phaseAt < NEXT_GUARD_MS) return true;
      if (game.phase === 'countdown' || game.phase === 'fire') nextQuestion();
      else if (game.phase === 'question') revealAnswer();
      else if (game.phase === 'reveal') startFire();
      return true;
    case 'reset':
      game.round = [];
      game.index = -1;
      game.boss = { max: 1, dmg: 0, finisher: false, fellAt: -1 };
      game.totalShots = 0;
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
      else if (game.phase === 'fire' && !game.firing) schedule('fire', game.auto ? FIRE_COOLDOWN : 0, nextQuestion);
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
    p = freshStats({ pid: randomUUID(), n: nextPlayerNo++, name, turret: -1 });
    players.set(p.pid, p);
    autoSeat(p);
    logEvent(`${name} vào phòng · ${p.turret >= 0 ? `ụ ${p.turret + 1}` : 'hết ụ, bắn từ lối đi'}`, 'join');
    broadcastScreens(seatsMessage());
    refreshHost();
  } else if (name && name !== p.name) {
    logEvent(`${p.name} đổi tên thành ${name}`, 'info');
    p.name = name;
    if (p.turret >= 0) broadcastScreens(seatsMessage());
  }
  return [200, { pid: p.pid, n: p.n, name: p.name, turret: p.turret }];
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
    const alive = game.boss.dmg < game.boss.max;
    game.boss.dmg = Math.min(game.boss.max, game.boss.dmg + taps * (result.double ? 2 : 1));
    p.shots += taps;
    p.roundShots += taps;
    game.roundShots += taps;
    game.totalShots += taps;
    pendingShots.set(p.turret, (pendingShots.get(p.turret) ?? 0) + taps);
    bossChanged = true;
    if (alive && game.boss.dmg >= game.boss.max) {
      game.boss.fellAt = index;
      logEvent(`Quái Vật Dễ Sợ gục ngã ở câu ${index + 1}!`, 'good');
      broadcast();
    }
  }
  return [200, { taps, shots: p.roundShots, boss: bossPercent() }];
}

function useItem(p, item) {
  if (!ITEMS.includes(item)) return [400, { error: 'Vật phẩm không tồn tại' }];
  if (!['countdown', 'question', 'reveal', 'fire'].includes(game.phase)) return [409, { error: 'Chỉ dùng vật phẩm trong lúc chơi' }];
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

function resultsCsv() {
  const cell = v => {
    const s = String(v);
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const header = ['rank', 'name', 'score', 'correct', 'time_s', 'shots', ...game.round.map(q => q.id)];
  const rows = leaderboard().map((p, i) => [
    i + 1, p.name, p.score, p.correct, (p.timeMs / 1000).toFixed(1), p.shots,
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
  send(res, { type: 'logs', entries: activity });
}

async function handleApi(req, res, url, path) {
  if (path === '/api/join' && req.method === 'POST') return json(res, ...joinPlayer(await readJson(req)));

  const playerRoutes = { '/api/answer': 'answer', '/api/tap': 'tap', '/api/item': 'item' };
  if (playerRoutes[path] && req.method === 'POST') {
    const body = await readJson(req);
    const p = players.get(body.pid);
    if (!p) return json(res, 404, { error: 'Không tìm thấy người chơi, hãy vào lại' });
    if (path === '/api/answer') return json(res, ...submitAnswer(p, body.index, body.choice));
    if (path === '/api/tap') return json(res, ...tapFire(p, body.index, body.n));
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
  console.log(`  Bảng điều khiển MC (màn laptop):     http://localhost:${PORT}/host?key=${HOST_KEY}`);
  console.log(`  Màn game cho máy chiếu:              http://localhost:${PORT}/screen?key=${HOST_KEY}`);
  console.log(`  Bản swarm cũ để test sprite:         http://localhost:${PORT}/sandbox\n`);
  console.log(`  Bộ câu hỏi: ${game.quiz.questions.length} câu, ${game.quiz.time}s trả lời + ${game.quiz.fire}s bắn/câu, ${TURRET_SLOTS} ụ súng (data/questions.json)`);
  if (unconfirmed.length) console.log(`  ⚠ Đáp án cần team xác nhận: ${unconfirmed.join(', ')}`);
});

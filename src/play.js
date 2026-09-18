// Phone controller. The question, the arena and every shot are on the projector; the phone joins
// with a name (which seats a turret on the big screen), answers on four Kahoot-style tiles, and
// after the reveal, if the answer was right, taps as fast as it can while the whole hall shoots.
import { loadSvgStrip, loadGridSheet, buildFoxSheet } from './sprites.js';
import { SPRITES, ITEMS, ANSWERS, REACTIONS, shapeSvg } from './config.js';
import { paintHudPortrait, drawJoinDuel, galaxyDataUrl } from './hud-art.js';
import { drawGuideClip, GUIDE_CLIP_SECONDS } from './guide-clips.js';
import { drawCutscene, cutsceneLines } from './cutscene.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOUCH = matchMedia('(pointer: coarse)').matches;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
// Taps travel in small batches: one request per quarter second per player instead of one per tap.
const TAP_FLUSH_MS = 250;
const PLAY_VIEWS = ['countdown', 'reading', 'answer', 'answered', 'result', 'stunned', 'ceasefire'];

const net = { pid: null, name: '', no: null, es: null, offset: 0 };
const quiz = { phase: 'connecting', index: -1, total: 15, read: 10, time: 15, fire: 6, endsAt: 0, players: 0, options: 4, answer: null, firing: false, boss: 100 };
// picked: tile chosen for the current question · result: the server's verdict, known from the reveal on.
// removed: options the hint took away for removedIndex.
const me = {
  turret: -1, score: 0, correct: 0, rank: 0, players: 0,
  picked: null, submitting: false, error: null, result: null,
  items: { hint: 0, shield: 0, boost: 0 }, armed: { shield: false, boost: false }, removed: null, removedIndex: -1, busy: false,
};
// Shots this round: acked by the server, in flight, and tapped but not yet sent.
const taps = { index: -1, acked: 0, inflight: 0, pending: 0, timer: 0 };
let hero, bossSheet, turretSheet, turretEmptySheet;
// Màn nhập tên chỉ cần Buddy (45 KB); ba tấm sheet nặng hơn tải tiếp ở nền để hội trường vào
// phòng ngay thay vì ngồi nhìn nút "Đang tải…". Đoạn phim và hướng dẫn tự đợi phần của nó.
const loading = { total: 0, done: 0, sprites: false };
let spritesReady = Promise.resolve();
// "Đã xong", không phải "đã có": một tấm tải lỗi thì vẽ thiếu còn hơn kẹt ở chữ "đang tải".
const spritesDone = () => loading.sprites;

const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};
const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---- Networking ----------------------------------------------------------------

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

// ---- Tải hình ----------------------------------------------------------------------

function trackLoad(p) {
  loading.total++;
  const tick = () => {
    loading.done++;
    paintLoading();
  };
  p.then(tick, tick);
  return p;
}

function paintLoading() {
  const done = loading.done >= loading.total;
  const pct = loading.total ? Math.round((loading.done / loading.total) * 100) : 100;
  $('loadFill').style.width = `${pct}%`;
  $('loadText').textContent = done ? 'Đã tải xong' : `Đang tải hình ảnh… ${loading.done}/${loading.total}`;
  $('loadState').hidden = done;
}

// ---- Join cutscene -----------------------------------------------------------------

// pending: đã bấm vào phòng nhưng sprite của đoạn phim chưa về tới.
const cutscene = { start: 0, playing: false, pending: false };

// Only on a deliberate join: a reconnect or an auto-rejoin drops the player straight back in.
async function playCutscene() {
  if (REDUCED_MOTION.matches) return;
  const seat = me.turret >= 0 ? `Ụ số ${me.turret + 1}` : '';
  $('cutsceneSr').textContent = cutsceneLines(seat).join(' ');
  $('cutscene').hidden = false;
  $('cutsceneSkip').focus();
  // Máy yếu hay wifi hội trường chậm: giữ màn hình có chữ, đừng dựng phim lên khung đen.
  if (!spritesDone()) {
    cutscene.pending = true;
    $('cutsceneLoading').hidden = false;
    await spritesReady;
    $('cutsceneLoading').hidden = true;
    // Bỏ qua trong lúc chờ, hoặc MC đã bấm bắt đầu: thôi không chiếu nữa.
    if (!cutscene.pending) return;
    cutscene.pending = false;
  }
  cutscene.start = performance.now() / 1000;
  cutscene.playing = true;
}

function endCutscene() {
  if (!cutscene.playing && !cutscene.pending) return;
  cutscene.playing = false;
  cutscene.pending = false;
  $('cutscene').hidden = true;
  $('cutsceneLoading').hidden = true;
}

async function join(name, { cinematic = false } = {}) {
  $('joinError').textContent = '';
  $('joinBtn').disabled = true;
  $('joinBtn').textContent = 'Đang vào phòng…';
  try {
    const r = await post('/api/join', { name, pid: net.pid });
    if (!r.ok) throw new Error(r.data.error || `Lỗi ${r.status}`);
    Object.assign(net, { pid: r.data.pid, no: r.data.n, name: r.data.name });
    me.turret = r.data.turret;
    session.set('foxquiz.pid', net.pid);
    local.set('foxquiz.name', net.name);
    $('join').hidden = true;
    $('nameInput').blur();
    connect();
    render();
    if (cinematic) playCutscene();
  } catch (err) {
    $('joinError').textContent = err instanceof TypeError ? 'Không kết nối được server' : err.message;
    $('join').hidden = false;
  } finally {
    $('joinBtn').disabled = false;
    $('joinBtn').textContent = 'Vào chơi';
  }
}

function connect() {
  net.es?.close();
  const es = new EventSource(`/api/events?pid=${encodeURIComponent(net.pid)}`);
  net.es = es;
  es.onopen = () => { $('conn').hidden = true; };
  es.onmessage = e => onMessage(JSON.parse(e.data));
  es.onerror = () => {
    $('conn').hidden = false;
    if (es.readyState !== EventSource.CLOSED) return;
    // The server no longer knows this player (restarted) → join again under the same name.
    net.pid = null;
    setTimeout(() => join(net.name), 1500);
  };
}

function onMessage(msg) {
  switch (msg.type) {
    case 'state':
      onState(msg);
      return;
    case 'you':
      onYou(msg);
      return;
    case 'boss':
      quiz.boss = msg.boss;
      renderBoss();
      return;
    case 'react':
      // Server đã gom nửa giây một lượt; vẫn cắt thêm lần nữa ở đây cho máy yếu.
      for (const [i, n] of msg.icons ?? []) floatReaction(REACTIONS[i]?.id, Math.min(n, 4));
      return;
  }
}

function onState(msg) {
  net.offset = msg.now - Date.now();
  const prev = { phase: quiz.phase, index: quiz.index };
  Object.assign(quiz, {
    phase: msg.phase, phaseAt: msg.phaseAt, index: msg.index, total: msg.total, read: msg.read ?? quiz.read, time: msg.time, fire: msg.fire, endsAt: msg.endsAt,
    players: msg.players, options: msg.options ?? 4, answer: msg.answer ?? null, firing: msg.firing, boss: msg.boss, react: !!msg.react,
    charge: msg.charge ?? quiz.charge,
  });
  document.body.dataset.phase = msg.phase;
  const changed = prev.phase !== msg.phase || prev.index !== msg.index;
  if (changed && prev.index !== msg.index) {
    Object.assign(me, { picked: null, submitting: false, error: null, result: null });
  }
  // The fun question is not part of the round, so it needs its own clean slate.
  if (changed && msg.phase === 'final') Object.assign(me, { picked: null, submitting: false, error: null, result: null });
  if (changed && msg.phase === 'charge') {
    clearTimeout(taps.timer);
    Object.assign(taps, { index: -1, acked: 0, inflight: 0, pending: 0, timer: 0 });
    navigator.vibrate?.([40, 60, 40]);
  }
  if (changed && (msg.phase === 'lobby' || msg.phase === 'countdown')) Object.assign(me, { removed: null, removedIndex: -1 });
  if (changed && msg.phase === 'fire') {
    clearTimeout(taps.timer);
    Object.assign(taps, { index: msg.index, acked: 0, inflight: 0, pending: 0, timer: 0 });
  }
  if (changed && msg.phase === 'fire' && msg.firing && me.result?.correct) navigator.vibrate?.([40, 60, 40]);
  if (msg.phase === 'end') renderEnd();
  else $('end').hidden = true;
  render();
}

function onYou(msg) {
  Object.assign(me, { score: msg.score, correct: msg.correct, rank: msg.rank, players: msg.players, turret: msg.turret, items: msg.items, armed: msg.armed, totalShots: msg.totalShots ?? me.totalShots });
  if (msg.hint && quiz.phase === 'question') Object.assign(me, { removed: msg.hint, removedIndex: quiz.index });
  // Reconnecting after answering: the server remembers the pick.
  if (msg.picked !== null && me.picked === null) me.picked = msg.picked;
  if (msg.result) me.result = msg.result;
  if (quiz.phase === 'fire' || quiz.phase === 'charge') taps.acked = Math.max(taps.acked, msg.shots);
  render();
  if (quiz.phase === 'end') renderEnd();
}

// ---- Actions ---------------------------------------------------------------------

// Is the answer we sent still the one on screen? -1 addresses the finale, anything else a round.
const stillOn = index => (index === -1 ? quiz.phase === 'final' : index === quiz.index);

async function lock(i) {
  const finale = quiz.phase === 'final';
  if ((quiz.phase !== 'question' && !finale) || me.picked !== null || me.submitting || i < 0 || i >= quiz.options) return;
  if (!finale && me.removedIndex === quiz.index && me.removed?.includes(i)) return;
  // The finale's question lives outside the round, so it is addressed as index -1.
  const index = finale ? -1 : quiz.index;
  Object.assign(me, { picked: i, submitting: true, error: null });
  navigator.vibrate?.(15);
  render();
  try {
    const r = await post('/api/answer', { pid: net.pid, index, choice: i });
    if (!stillOn(index)) return;
    // A lost response may still have been accepted: the server never records a question twice.
    if (!r.ok && r.data.error !== 'Bạn đã trả lời câu này rồi') {
      me.error = { text: r.data.error || 'Không gửi được đáp án', retry: r.status >= 500 };
      if (r.status === 400) me.picked = null;
    }
  } catch {
    if (stillOn(index)) me.error = { text: 'Chưa gửi được đáp án. Bấm gửi lại nhé.', retry: true };
  } finally {
    if (stillOn(index)) me.submitting = false;
    render();
  }
}

function retryAnswer() {
  const choice = me.picked;
  if (choice === null || !me.error?.retry) return;
  Object.assign(me, { picked: null, error: null });
  lock(choice);
}

async function useItem(item) {
  if (me.busy || !['countdown', 'reading', 'question', 'reveal', 'fire'].includes(quiz.phase)) return;
  me.busy = true;
  renderItems();
  try {
    const r = await post('/api/item', { pid: net.pid, item });
    if (!r.ok) {
      banner(r.data.error || 'Không dùng được vật phẩm', 'bad');
      return;
    }
    Object.assign(me, { items: r.data.items, armed: r.data.armed });
    if (item === 'hint') {
      Object.assign(me, { removed: r.data.removed, removedIndex: quiz.index });
      banner('Buddy loại 2 đáp án sai!', 'warn');
    } else {
      banner(item === 'shield' ? 'Khiên đã bật!' : 'Câu đúng tới: ×2 điểm, ×2 đạn!', item === 'shield' ? 'info' : 'warn');
    }
  } catch {
    banner('Mất kết nối, thử lại nhé', 'bad');
  } finally {
    me.busy = false;
    render();
  }
}

const canFire = () => quiz.phase === 'fire' && quiz.firing && me.result?.correct && taps.index === quiz.index;
// The finale is open to the whole hall: no right answer needed, only a bottle that is not yet full.
const canCharge = () => quiz.phase === 'charge' && !quiz.charge?.full && taps.index === -1;

function fire() {
  const charging = canCharge();
  if (!charging && !canFire()) return;
  taps.pending++;
  taps.timer ||= setTimeout(flushTaps, TAP_FLUSH_MS);
  navigator.vibrate?.(8);
  const btn = $(charging ? 'chargeBtn' : 'fireBtn');
  btn.classList.remove('hit');
  void btn.offsetWidth;
  btn.classList.add('hit');
  if (!REDUCED_MOTION.matches && btn.querySelectorAll('.ripple').length < 6) {
    const ring = Object.assign(document.createElement('span'), { className: 'ripple' });
    ring.addEventListener('animationend', () => ring.remove());
    btn.append(ring);
  }
  renderShots();
}

async function flushTaps() {
  taps.timer = 0;
  if (!taps.pending) return;
  if (taps.inflight) {
    taps.timer = setTimeout(flushTaps, TAP_FLUSH_MS);
    return;
  }
  const { index } = taps;
  const n = taps.pending;
  Object.assign(taps, { pending: 0, inflight: n });
  try {
    const r = await post('/api/tap', { pid: net.pid, index, n });
    if (r.ok && index === taps.index) {
      if (index === -1) {
        taps.acked = r.data.mine;
        quiz.charge = { ...quiz.charge, taps: r.data.charge, goal: r.data.goal };
        renderCharge();
      } else {
        taps.acked = r.data.shots;
        quiz.boss = r.data.boss;
        renderBoss();
      }
    }
  } catch {
    // A lost batch only costs those shots; the next one carries on.
  } finally {
    if (index === taps.index) taps.inflight = 0;
    if (index === -1) renderCharge();
    else renderShots();
    if (taps.pending) taps.timer ||= setTimeout(flushTaps, TAP_FLUSH_MS);
  }
}

// ---- Rendering -------------------------------------------------------------------

function currentView() {
  if (!net.pid) return 'join';
  switch (quiz.phase) {
    case 'lobby': return 'lobby';
    case 'countdown': return 'countdown';
    case 'reading': return 'reading';
    case 'question': return me.picked === null ? 'answer' : 'answered';
    case 'reveal': return 'result';
    case 'fire': return !quiz.firing ? 'ceasefire' : me.result?.correct ? 'fire' : 'stunned';
    case 'finalreading': return 'reading';
    case 'final': return me.picked === null ? 'answer' : 'answered';
    case 'finalreveal': return 'finalresult';
    case 'charge': return 'charge';
    case 'unleash': return 'unleash';
    case 'victory': return 'victory';
    case 'end': return 'end';
    default: return 'connecting';
  }
}

function render() {
  const view = currentView();
  // The scene is a lobby flourish: the moment the MC starts, the question wins the screen.
  if (cutscene.playing && view !== 'lobby' && view !== 'connecting') endCutscene();
  document.body.dataset.view = view;
  $('answerView').hidden = view !== 'answer';
  $('fireView').hidden = view !== 'fire';
  $('chargeView').hidden = view !== 'charge';
  $('waitView').hidden = view === 'answer' || view === 'fire' || view === 'charge';
  if (view === 'answer') renderTiles();
  else if (view === 'fire') renderFire();
  else if (view === 'charge') renderCharge();
  else renderWait(view);
  renderReactBar(view);
  renderItems();
  renderTop();
}

function renderTiles() {
  const box = $('tiles');
  const removed = me.removedIndex === quiz.index ? me.removed ?? [] : [];
  const sig = `${quiz.phase === 'final' ? 'finale' : quiz.index}|${quiz.options}|${removed.join(',')}`;
  $('qMeta').textContent = quiz.phase === 'final' ? 'CÂU ĐỐ VUI · không tính điểm' : `Câu ${quiz.index + 1}/${quiz.total}`;
  $('timer').querySelector('[role="progressbar"]').setAttribute('aria-valuemax', quiz.time);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.dataset.count = quiz.options;
  box.replaceChildren(...ANSWERS.slice(0, quiz.options).map((a, i) => {
    const btn = document.createElement('button');
    const out = removed.includes(i);
    btn.type = 'button';
    btn.className = `tile${out ? ' out' : ''}`;
    btn.disabled = out;
    btn.style.setProperty('--c', a.color);
    btn.style.setProperty('--ledge', a.ledge);
    btn.innerHTML = `${shapeSvg(a.shape)}<b>${a.letter}</b>`;
    btn.setAttribute('aria-label', `Đáp án ${a.letter}${out ? ', đã bị Buddy loại' : ''}`);
    btn.addEventListener('click', () => lock(i));
    return btn;
  }));
}

function answerChip(i) {
  const a = ANSWERS[i];
  const chip = document.createElement('span');
  chip.className = 'answer-chip';
  chip.style.setProperty('--c', a.color);
  chip.style.setProperty('--ledge', a.ledge);
  chip.innerHTML = `${shapeSvg(a.shape)}Đáp án đúng: ${a.letter}`;
  return chip;
}

function bossLine() {
  const box = document.createElement('div');
  box.className = 'boss-mini';
  box.innerHTML = '<span>Quái Vật Dễ Sợ</span><b data-boss-text></b><div class="boss-mini-bar"><i data-boss-fill></i></div>';
  return box;
}

// One card for every non-interactive moment. Rebuilt only when what it says changes.
function renderWait(view) {
  const r = me.result;
  const turret = me.turret >= 0 ? `Ụ số ${me.turret + 1}` : null;
  let art = null, badge = null, title = '', text = '';
  const extra = [];
  switch (view) {
    case 'join':
    case 'connecting':
      art = 'turret';
      title = 'Đang kết nối…';
      break;
    case 'lobby':
      art = 'turret';
      title = turret ? `Bạn ở ${turret}!` : 'Bạn đã vào phòng!';
      text = turret
        ? 'Tên bạn đang hiện trên ụ súng ở màn hình lớn. Chờ MC bắt đầu nhé!'
        : 'Hết ụ súng rồi: bạn vẫn trả lời, có điểm và bắn từ lối đi giữa hội trường.';
      extra.push(Object.assign(document.createElement('span'), { className: 'stat-line', innerHTML: `<b>${quiz.players}</b> người đã vào phòng` }));
      break;
    case 'countdown':
      badge = { kind: 'count', content: '3' };
      title = 'Chuẩn bị!';
      text = 'Nhìn lên màn hình lớn, câu hỏi đầu tiên sắp hiện.';
      break;
    case 'reading':
      badge = { kind: 'count', content: String(quiz.read ?? 10) };
      title = 'Đọc câu hỏi nhé!';
      text = quiz.phase === 'finalreading'
        ? 'Câu đố vui cuối đang hiện trên màn hình lớn. Đáp án mở ngay sau đây.'
        : 'Câu hỏi đang hiện trên màn hình lớn. Đáp án sẽ mở khi hết giờ đọc.';
      break;
    case 'answered': {
      const a = ANSWERS[me.picked];
      badge = { kind: 'shape', content: shapeSvg(a.shape), color: a };
      title = me.submitting ? 'Đang gửi…' : me.error ? 'Chưa gửi được' : `Đã chọn ${a.letter}!`;
      text = me.error ? me.error.text : 'Chờ công bố đáp án trên màn hình lớn…';
      if (me.error?.retry && !me.submitting) {
        const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'pbtn retry-answer', textContent: 'Gửi lại đáp án' });
        btn.addEventListener('click', retryAnswer);
        extra.push(btn);
      }
      break;
    }
    case 'result':
      if (!r) {
        badge = { kind: 'info', content: '…' };
        title = 'Đáp án đã có!';
      } else if (r.correct) {
        badge = { kind: 'good', content: '✓' };
        title = 'Chính xác!';
        text = `+${r.points.toLocaleString('vi-VN')} điểm${r.double ? ' (×2)' : ''}${r.streak > 1 ? ` · Combo ×${r.streak}` : ''}`;
        extra.push(Object.assign(document.createElement('span'), { className: 'cheer', textContent: 'Sắp tới lượt bắn, chuẩn bị TAP TAP TAP!' }));
      } else if (r.blocked) {
        badge = { kind: 'info', content: '🛡' };
        title = r.timeout ? 'Hết giờ, khiên đã đỡ!' : 'Khiên đã đỡ!';
        text = 'Combo vẫn được giữ. Lượt này bạn chưa được bắn, câu sau cố lên!';
      } else {
        badge = { kind: 'bad', content: r.timeout ? '⏰' : '✕' };
        title = r.timeout ? 'Hết giờ!' : 'Chưa đúng!';
        text = 'Quái Vật sắp phản đòn vào ụ của bạn. Trả lời đúng câu sau để được bắn.';
      }
      if (quiz.answer !== null && !r?.correct) extra.push(answerChip(quiz.answer));
      break;
    case 'finalresult': {
      const a = quiz.answer !== null ? ANSWERS[quiz.answer] : null;
      const right = me.picked !== null && me.picked === quiz.answer;
      badge = { kind: right ? 'good' : 'info', content: right ? '✓' : '🎉' };
      title = right ? 'Bạn đoán đúng!' : 'Câu này chỉ để vui thôi!';
      text = 'Không tính điểm — nhưng sắp tới lượt cả hội trường hợp sức rồi.';
      if (a) extra.push(answerChip(quiz.answer));
      extra.push(Object.assign(document.createElement('span'), { className: 'cheer', textContent: 'Chuẩn bị TAP để tích nước!' }));
      break;
    }
    case 'unleash':
      art = 'boss';
      badge = null;
      title = 'Cùng ném bình nước!';
      text = 'Bình nước của cả hội trường đang bay về phía Quái Vật. Cùng xem đòn kết liễu trên màn hình lớn!';
      break;
    case 'victory':
      badge = { kind: 'good', content: '🦊' };
      title = 'Cả đội cùng chiến thắng!';
      text = 'Nhìn lên màn hình lớn để xem clip các chú cáo hợp sức chiến thắng. Top 5 sẽ được vinh danh sau clip!';
      break;
    case 'stunned':
      art = 'boss';
      title = r?.blocked ? 'Khiên đã đỡ đòn!' : r ? 'Ụ của bạn bị bắn trúng!' : 'Cả hội trường đang bắn!';
      text = 'Xem cả hội trường hạ boss trên màn hình lớn. Câu sau trả lời đúng để cùng bắn nhé!';
      extra.push(bossLine());
      break;
    case 'ceasefire':
      badge = { kind: 'info', content: '✋' };
      title = 'Ngưng bắn!';
      text = r?.correct ? '' : 'Chờ câu hỏi tiếp theo nhé.';
      if (r?.correct) extra.push(Object.assign(document.createElement('span'), { className: 'stat-line', innerHTML: `Bạn đã bắn <b>${shotCount().toLocaleString('vi-VN')}</b> phát` }));
      extra.push(bossLine());
      break;
    case 'end':
      badge = { kind: 'good', content: '🏆' };
      title = 'Kết thúc!';
      break;
  }
  const card = $('waitView');
  const sig = JSON.stringify([view, art, badge, title, text, extra.map(el => el.outerHTML)]);
  if (card.dataset.sig === sig) {
    renderBoss();
    return;
  }
  card.dataset.sig = sig;
  $('turretArt').hidden = art !== 'turret';
  $('bossArt').hidden = art !== 'boss';
  const el = $('waitBadge');
  el.hidden = !badge;
  if (badge) {
    el.className = `wait-badge ${badge.kind} pop`;
    el.innerHTML = badge.content;
    el.style.setProperty('--c', badge.color?.color ?? '');
    el.style.setProperty('--ledge', badge.color?.ledge ?? '');
    if (!badge.color) el.style.removeProperty('--c');
    if (!badge.color) el.style.removeProperty('--ledge');
  }
  $('waitTitle').textContent = title;
  $('waitText').textContent = text;
  $('waitExtra').replaceChildren(...extra);
  renderBoss();
}

const shotCount = () => taps.acked + taps.inflight + taps.pending;

function renderShots() {
  $('shotCount').textContent = shotCount().toLocaleString('vi-VN');
}

function renderFire() {
  $('fireBoost').hidden = !me.result?.double;
  renderShots();
  renderBoss();
}

function renderCharge() {
  const c = quiz.charge ?? { taps: 0, goal: 1, full: false };
  const p = Math.min(1, c.taps / Math.max(1, c.goal));
  $('chargePct').textContent = `${Math.round(p * 100)}%`;
  $('chargeBarFill').style.width = `${p * 100}%`;
  $('chargeBarFill').parentElement.setAttribute('aria-valuenow', Math.round(p * 100));
  $('chargeMine').textContent = shotCount().toLocaleString('vi-VN');
  $('chargeHint').textContent = c.full
    ? 'Bình đầy rồi — nhìn lên màn hình lớn!'
    : `Cả hội trường: ${c.taps.toLocaleString('vi-VN')}/${c.goal.toLocaleString('vi-VN')} lượt tap`;
  $('chargeView').dataset.full = String(!!c.full);
}

function renderBoss() {
  const percent = clamp(Math.round(quiz.boss), 0, 100);
  for (const el of document.querySelectorAll('#bossMiniText, [data-boss-text]')) el.textContent = `${percent}%`;
  for (const el of document.querySelectorAll('#bossMiniFill, [data-boss-fill]')) el.style.width = `${percent}%`;
}

function renderItems() {
  const tray = $('items');
  // Items do nothing in the finale — that question is not scored and the charge is not a round.
  const inFinale = ['finalreading', 'final', 'finalreveal', 'charge', 'unleash', 'victory'].includes(quiz.phase);
  tray.hidden = inFinale || !PLAY_VIEWS.includes(document.body.dataset.view);
  if (tray.hidden) return;
  for (const btn of tray.querySelectorAll('.item')) {
    const item = btn.dataset.item;
    const count = me.items[item] ?? 0;
    const armed = !!me.armed[item];
    btn.querySelector('.count').textContent = armed ? 'ON' : count;
    btn.classList.toggle('armed', armed);
    const usable = item === 'hint'
      ? quiz.phase === 'question' && me.picked === null && me.removedIndex !== quiz.index
      : !armed;
    btn.disabled = me.busy || count <= 0 || !usable;
    btn.title = `${ITEMS[item].name}: ${ITEMS[item].effect}${armed ? ' (đang bật)' : count <= 0 ? ' (đã dùng)' : ''}`;
    btn.setAttribute('aria-label', `${btn.title}. ${armed ? 'Đang bật' : `Còn ${count} lần`}`);
  }
}

function renderTop() {
  $('playerName').textContent = net.name || 'Buddy';
  $('seatLabel').textContent = !net.pid ? 'Đang vào phòng…' : me.turret >= 0 ? `Ụ số ${me.turret + 1}` : 'Bắn từ lối đi';
  const scoreEl = $('hudScore');
  if (scoreEl.dataset.value !== String(me.score)) {
    const increased = me.score > Number(scoreEl.dataset.value || 0);
    scoreEl.dataset.value = me.score;
    scoreEl.textContent = `${me.score.toLocaleString('vi-VN')} điểm`;
    if (increased && !REDUCED_MOTION.matches) {
      scoreEl.classList.remove('score-bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('score-bump');
    }
  }
  $('hudRank').hidden = !me.rank || quiz.phase === 'lobby';
  $('hudRank').textContent = me.rank ? `#${me.rank}` : '';
  $('hudRank').setAttribute('aria-label', `Hạng ${me.rank}`);
}

function renderEnd() {
  $('end').hidden = false;
  $('endTitle').textContent = me.rank && me.rank <= 5 ? '🏆 Bạn lọt TOP 5!' : 'Quái Vật Dễ Sợ đã gục ngã!';
  $('endRank').textContent = me.rank ? `#${me.rank} / ${me.players}` : '';
  $('endScore').textContent = `${me.score.toLocaleString('vi-VN')} điểm · đúng ${me.correct}/${quiz.total} câu · ${(me.totalShots ?? 0).toLocaleString('vi-VN')} lượt tap`;
}

function banner(text, tone = 'info') {
  const el = $('banner');
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

// Timers and the illustrated overlays animate every frame; everything else renders on messages.
function frame(t) {
  const view = document.body.dataset.view;
  const left = Math.max(0, quiz.endsAt - (Date.now() + net.offset)) / 1000;
  if (view === 'answer') {
    const seconds = Math.ceil(left);
    $('timerFill').style.width = `${clamp(left / quiz.time, 0, 1) * 100}%`;
    if ($('timerText').textContent !== String(seconds)) {
      $('timerText').textContent = seconds;
      $('timer').querySelector('[role="progressbar"]').setAttribute('aria-valuenow', seconds);
    }
    $('timer').classList.toggle('urgent', seconds <= 5);
  } else if (view === 'countdown' || view === 'reading') {
    const n = String(Math.max(1, Math.ceil(left)));
    if ($('waitBadge').textContent !== n) $('waitBadge').textContent = n;
  } else if (view === 'fire') {
    $('fireFill').style.width = `${clamp(left / quiz.fire, 0, 1) * 100}%`;
  }
  if (!$('join').hidden && hero) drawJoinDuel($('joinArt'), hero, bossSheet, t, { reducedMotion: REDUCED_MOTION.matches });
  if (!$('guide').hidden) renderGuide(t);
  if (cutscene.playing) {
    const art = { hero, turret: turretSheet, turretEmpty: turretEmptySheet ?? turretSheet };
    const seat = me.turret >= 0 ? `Ụ số ${me.turret + 1}` : '';
    if (!drawCutscene($('cutsceneClip'), art, t - cutscene.start, { seatLabel: seat, name: net.name })) endCutscene();
  }
}

// ---- Icon thả chơi lúc chờ ---------------------------------------------------------
// Phòng chờ là quãng im lặng dài nhất của buổi diễn. Ai thả icon thì cả hội trường thấy icon
// đó bay lên trên máy mình — đủ để người ta nghịch với nhau trong lúc đợi MC bấm bắt đầu.
// Máy yếu trong hội trường đông: thà cắt icon còn hơn rớt khung hình.
const REACT_MAX_FLOATS = 18;
const REACT_EVERY_MS = 400;
const reactions = { built: false, at: 0 };

function buildReactBar() {
  if (reactions.built) return;
  reactions.built = true;
  $('reactBar').replaceChildren(...REACTIONS.map(r => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'react-btn';
    btn.setAttribute('aria-label', `Thả icon ${r.label}`);
    const img = document.createElement('img');
    Object.assign(img, { src: r.icon, alt: '', width: 192, height: 192, decoding: 'async' });
    btn.append(img);
    btn.addEventListener('click', () => sendReaction(r.id));
    return btn;
  }));
}

function renderReactBar(view) {
  const open = !!quiz.react && view === 'lobby';
  if (open) buildReactBar();
  $('reactBar').hidden = !open;
  if (!open) $('reactSky').replaceChildren();
}

function sendReaction(id) {
  const now = performance.now();
  if (now - reactions.at < REACT_EVERY_MS) return;
  reactions.at = now;
  // Icon của mình bay lên ngay, không đợi server: chạm phải thấy phản hồi tức thì.
  floatReaction(id);
  post('/api/react', { pid: net.pid, icon: id }).catch(() => {});
}

function floatReaction(id, count = 1) {
  const art = REACTIONS.find(r => r.id === id);
  if (!art) return;
  const sky = $('reactSky');
  for (let i = 0; i < count; i++) {
    if (sky.childElementCount >= REACT_MAX_FLOATS) sky.firstElementChild?.remove();
    const img = document.createElement('img');
    Object.assign(img, { className: 'react-float', src: art.icon, alt: '', decoding: 'async' });
    img.style.setProperty('--x', `${6 + Math.random() * 86}%`);
    img.style.setProperty('--drift', `${Math.round((Math.random() * 2 - 1) * 46)}px`);
    img.style.setProperty('--spin', `${Math.round((Math.random() * 2 - 1) * 20)}deg`);
    img.style.setProperty('--delay', `${i * 90}ms`);
    img.addEventListener('animationend', () => img.remove());
    sky.append(img);
  }
}

// ---- Guide -------------------------------------------------------------------------

// Quét mã xong là hướng dẫn mở ngay, trước cả ô nhập tên: đọc xong mới gõ tên vào phòng. Nút
// trên màn nhập tên từ đó chỉ còn để xem lại.
const onboarding = { due: true };

function showGuide(open) {
  if (open) playGuideStep(0);
  $('guide').hidden = !open;
  $(open ? 'guideClose' : 'guideBtn').focus();
}

// Chỉ ở màn nhập tên. Máy nào vào lại giữa ván (mất mạng, lỡ tắt trình duyệt) thì thôi —
// người ta đang cần chọn đáp án, không cần xem lại hướng dẫn.
function openOnboarding() {
  if (!onboarding.due || currentView() !== 'join') return;
  onboarding.due = false;
  showGuide(true);
}

const guideSteps = document.querySelectorAll('.guide-step');
const guideView = { start: 0, step: 0, shown: -1 };
const GUIDE_CAPTIONS = [
  'Nhập đúng domain của bạn (ví dụ: khang.pham2) để nhận phần thưởng đã tích được trong 7 ngày vừa qua — Buddy thông thái, Súng giọt tự tin, và Khiên nếu bạn đã tạo bảng câu hỏi.',
  `Câu hỏi hiện trên màn hình lớn. ${TOUCH ? 'Chạm' : 'Bấm'} ô cùng màu, cùng hình trên điện thoại trước khi hết giờ.`,
  `Trả lời đúng là mở khoá nút BẮN. ${TOUCH ? 'Chạm' : 'Bấm'} càng nhiều, điểm càng cao và boss càng mất máu — cứ bấm hết sức tới khi hết giờ!`,
  'Mỗi vật phẩm dùng 1 lần: loại 2 đáp án sai, khiên đỡ 1 đòn của boss, hoặc ×2 điểm và ×2 đạn.',
];
const GUIDE_STARTS = GUIDE_CLIP_SECONDS.map((_, i) => GUIDE_CLIP_SECONDS.slice(0, i).reduce((a, b) => a + b, 0));
const GUIDE_TOTAL = GUIDE_CLIP_SECONDS.reduce((a, b) => a + b, 0);

function playGuideStep(step) {
  guideView.step = step;
  guideView.start = performance.now() / 1000 - GUIDE_STARTS[step];
}

// Clips auto-advance and loop; with reduced motion each step holds its key frame until tapped.
function renderGuide(t) {
  // Hướng dẫn mở ngay lúc quét mã nên gần như luôn tới trước sprite. Chữ đọc được ngay;
  // chỉ ô hình chờ, và đồng hồ chưa chạy để không ai lỡ mất bước nào trong lúc tải.
  const waiting = !spritesDone();
  $('guideLoading').hidden = !waiting;
  $('guideClip').style.visibility = waiting ? 'hidden' : '';
  if (waiting) guideView.start = t;
  const still = REDUCED_MOTION.matches || waiting;
  const elapsed = Math.max(0, t - guideView.start) % GUIDE_TOTAL;
  const step = still ? guideView.step : GUIDE_STARTS.findLastIndex(start => elapsed >= start);
  const duration = GUIDE_CLIP_SECONDS[step];
  const clipTime = still ? duration * 0.8 : elapsed - GUIDE_STARTS[step];
  if (!waiting) drawGuideClip($('guideClip'), { hero, boss: bossSheet, turret: turretSheet, turretEmpty: turretEmptySheet ?? turretSheet }, step, clipTime);
  guideSteps.forEach((btn, i) => {
    btn.style.setProperty('--p', i < step ? 1 : i > step ? 0 : still ? 1 : clipTime / duration);
    if (i === step) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
  if (guideView.shown !== step) {
    guideView.shown = step;
    $('guideCaption').textContent = GUIDE_CAPTIONS[step];
  }
}

// ---- Boot ------------------------------------------------------------------------------

function resize() {
  const viewport = window.visualViewport;
  // Don't mistake pinch zoom for the keyboard: zoom must remain available.
  const height = viewport && Math.abs(viewport.scale - 1) < 0.05 ? viewport.height : innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
  document.body.dataset.keyboard = String(document.activeElement === $('nameInput') && height < innerHeight - 100);
}

async function boot() {
  $('joinForm').style.setProperty('--galaxy', `url(${galaxyDataUrl(document)})`);
  resize();
  addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  $('nameInput').addEventListener('focus', resize);
  $('nameInput').addEventListener('blur', resize);

  const guide = $('guide');
  $('guideBtn').addEventListener('click', () => showGuide(true));
  $('guideClose').addEventListener('click', () => showGuide(false));
  guide.addEventListener('click', e => { if (e.target === guide) showGuide(false); });
  guide.addEventListener('keydown', e => { if (e.key === 'Escape') showGuide(false); });
  for (const btn of guideSteps) btn.addEventListener('click', () => playGuideStep(Number(btn.dataset.step)));
  for (const btn of $('items').querySelectorAll('.item')) btn.addEventListener('click', () => useItem(btn.dataset.item));

  // pointerdown, not click: every finger counts, and a tap registers before the finger lifts.
  for (const id of ['fireBtn', 'chargeBtn']) {
    const btn = $(id);
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      fire();
    });
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }
  addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select') || e.repeat) return;
    const view = document.body.dataset.view;
    if ((view === 'fire' || view === 'charge') && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      fire();
    } else if (view === 'answer') {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code.replace('Numpad', 'Digit'));
      if (i >= 0) lock(i);
    }
  });

  render();
  // Bốn tấm cùng khởi hành, nhưng chỉ Buddy chặn nút "Vào chơi": ba tấm còn lại chỉ cần có mặt
  // trước đoạn phim và bảng hướng dẫn, nên cứ để chúng về sau trong lúc người ta gõ tên.
  const heroLoad = trackLoad(loadSvgStrip(SPRITES.hero.url, SPRITES.hero).catch(err => { console.warn(err); return buildFoxSheet(); }));
  const bossLoad = trackLoad(loadGridSheet(SPRITES.boss.url, SPRITES.boss).catch(err => { console.warn(err); return null; }));
  const turretLoad = trackLoad(loadGridSheet(SPRITES.turret.url, SPRITES.turret).catch(err => { console.warn(err); return null; }));
  const emptyLoad = trackLoad(loadGridSheet(SPRITES.turret.emptyUrl, SPRITES.turret).catch(err => { console.warn(err); return null; }));
  paintLoading();
  spritesReady = Promise.all([bossLoad, turretLoad, emptyLoad]).then(([boss, turret, empty]) => {
    [bossSheet, turretSheet, turretEmptySheet] = [boss, turret, empty];
    loading.sprites = true;
    paintHudPortrait($('seatAvatar'), turretSheet, { kind: 'turret' });
    paintHudPortrait($('turretArt'), turretSheet, { kind: 'turret' });
    paintHudPortrait($('bossArt'), bossSheet, { kind: 'boss' });
  });

  $('joinForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('nameInput').value.trim();
    if (!name) {
      $('joinError').textContent = 'Nhập tên của bạn để vào phòng nhé.';
      $('nameInput').focus();
      return;
    }
    net.pid = session.get('foxquiz.pid');
    join(name, { cinematic: true });
  });
  $('cutsceneSkip').addEventListener('click', endCutscene);
  const savedName = local.get('foxquiz.name');
  const rejoining = !!(savedName && session.get('foxquiz.pid'));
  $('nameInput').value = savedName ?? '';
  if (!rejoining) openOnboarding();

  requestAnimationFrame(function loop(now) {
    // Schedule first so one bad frame can't freeze the pad mid-event.
    requestAnimationFrame(loop);
    frame(now / 1000);
  });

  hero = await heroLoad;
  $('joinBtn').disabled = false;
  $('joinBtn').textContent = 'Vào chơi';
  if (rejoining) {
    net.pid = session.get('foxquiz.pid');
    join(savedName);
  }

  // Debug helpers for DevTools.
  window.quiz = { state: quiz, me, taps, net, lock, fire, useItem, cutscene, playCutscene };
}

boot();

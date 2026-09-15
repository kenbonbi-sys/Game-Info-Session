// Projector game screen (1920×1080 stage): the shared arena with a turret per player, the
// Kahoot-style question board, the shooting rounds and the final Top 5. It has no controls: the MC
// drives the game from the dashboard at /host, which also embeds this page as a preview (?preview=1).
import { ANSWERS, ARENA, shapeSvg } from './config.js';
import { initArena, resizeArena, arenaFrame, setSeats, setArenaPhase, syncBoss, queueShots, bossAttack, armTurret, finisherVolley, bossHealth } from './arena-view.js';
import { paintHudPortrait } from './hud-art.js';
import { initGameAudio } from './audio.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// The dashboard's preview is silent, renders at a lower frame rate and doesn't count as a projector.
const PREVIEW = params.has('preview');
const PREVIEW_FRAME_MS = 50;
const PHASE_LABEL = { lobby: 'Phòng chờ', countdown: 'Chuẩn bị', question: 'Đang trả lời', reveal: 'Đáp án', fire: 'BẮN!', end: 'Kết thúc' };
const RING = 2 * Math.PI * 52;
// The finishing volley plays before the leaderboard covers the arena.
const FINALE_SECONDS = 3.4;

let key = params.get('key');
try {
  if (key) sessionStorage.setItem('foxquiz.hostKey', key);
  else key = sessionStorage.getItem('foxquiz.hostKey');
} catch { /* storage blocked */ }
key ??= prompt('Nhập host key (in trong terminal khi chạy server):') ?? '';

let state = null;
let offset = 0;
let seatsTaken = 0;
let builtIndex = -1;
let finaleAt = 0;
let lastCount = -1;
let roundShots = 0;
let bossSeen = null;   // last boss "dead" flag shown, null until the first frame after connecting
const announced = new Set();

function connect() {
  const es = new EventSource(`/api/host/events?key=${encodeURIComponent(key)}&view=${PREVIEW ? 'preview' : 'screen'}`);
  es.onopen = () => { $('conn').hidden = true; };
  es.onmessage = e => onMessage(JSON.parse(e.data));
  es.onerror = () => {
    $('conn').hidden = false;
    if (es.readyState === EventSource.CLOSED) $('conn').textContent = 'Sai host key hoặc server đã tắt. Mở lại màn chiếu từ bảng điều khiển.';
  };
}

function onMessage(msg) {
  switch (msg.type) {
    case 'state':
      onState(msg);
      return;
    case 'seats':
      onSeats(msg);
      return;
    case 'shots':
      for (const [turret, taps] of msg.s) {
        queueShots(turret, taps);
        roundShots += taps;
      }
      syncBoss(msg.dmg, msg.max);
      $('roundShots').textContent = roundShots.toLocaleString('vi-VN');
      bump($('roundShots'));
      return;
    case 'attack':
      bossAttack(msg);
      return;
    case 'item':
      armTurret(msg.t, msg.item);
      return;
  }
}

function onSeats(msg) {
  setSeats(msg.seats);
  seatsTaken = msg.seats.length;
  // Newest arrivals first; a reconnecting projector lists the latest few instead of everyone.
  const fresh = msg.seats.filter(([, n]) => !announced.has(n)).sort((a, b) => a[1] - b[1]).slice(-8);
  for (const [, n] of msg.seats) announced.add(n);
  const list = $('arrivals');
  for (const [, , name] of fresh) list.prepend(Object.assign(document.createElement('li'), { textContent: name }));
  while (list.children.length > 8) list.lastElementChild.remove();
  renderSeatCount();
}

function onState(s) {
  offset = s.now - Date.now();
  const prev = state;
  state = s;
  const changed = !prev || prev.phase !== s.phase || prev.index !== s.index;
  if (changed) enterPhase(s, !!prev);
  if (prev?.phase === 'fire' && s.phase === 'fire' && prev.firing && !s.firing) ceaseFire(s);
  // Follow the server's boss HP; a new game or a freshly opened page snaps instead of animating.
  syncBoss(s.bossDmg, s.bossMax, !prev || (changed && (s.phase === 'lobby' || s.phase === 'countdown')));
  render(s);
}

function enterPhase(s, live) {
  setArenaPhase(s.phase);
  switch (s.phase) {
    case 'lobby':
      finaleAt = 0;
      break;
    case 'countdown':
      lastCount = -1;
      break;
    case 'question':
      buildQuestion(s);
      break;
    case 'reveal':
      revealQuestion(s);
      break;
    case 'fire': {
      roundShots = s.roundShots;
      $('roundShots').textContent = roundShots.toLocaleString('vi-VN');
      const right = s.counts?.[s.answer] ?? 0;
      $('shooters').textContent = right ? `${right} người trả lời đúng đang bắn` : 'Chưa ai trả lời đúng lượt này';
      $('fireTitle').textContent = !s.firing ? 'Ngưng bắn!' : right ? 'TAP TAP TAP!' : 'Quái Vật phản đòn!';
      $('fireSub').textContent = right ? 'Ai trả lời đúng: chạm liên tục vào nút BẮN trên điện thoại' : 'Câu sau trả lời đúng để cả hội trường cùng bắn!';
      if (live && s.firing) banner(right ? 'TAP TAP TAP!' : 'Quái Vật phản đòn!', right ? 'warn' : 'bad');
      break;
    }
    case 'end':
      if (live && s.finisher) {
        finisherVolley();
        banner('Cả hội trường tung đòn kết liễu!', 'warn');
        finaleAt = performance.now() + FINALE_SECONDS * 1000;
      } else {
        finaleAt = performance.now() + (live ? 1800 : 0);
      }
      break;
  }
}

function ceaseFire(s) {
  $('fireTitle').textContent = 'Ngưng bắn!';
  $('fireSub').textContent = s.auto ? 'Câu tiếp theo sắp bắt đầu…' : 'Chuẩn bị câu tiếp theo nhé!';
  banner(`Ngưng bắn! ${roundShots.toLocaleString('vi-VN')} phát`, 'info');
}

function buildQuestion(s) {
  const q = s.question;
  if (!q) return;
  builtIndex = s.index;
  $('qMeta').textContent = `Câu ${s.index + 1}/${s.total}${q.group ? ` · ${q.group}` : ''}`;
  $('qText').textContent = q.text;
  $('options').replaceChildren(...q.options.map((text, i) => {
    const a = ANSWERS[i];
    const el = document.createElement('div');
    el.className = 'opt';
    el.style.setProperty('--c', a.color);
    el.style.setProperty('--ledge', a.ledge);
    el.setAttribute('aria-label', `${a.letter}: ${text}`);
    el.innerHTML = shapeSvg(a.shape);
    el.append(
      Object.assign(document.createElement('span'), { className: 'opt-text', textContent: text }),
      Object.assign(document.createElement('span'), { className: 'opt-count', textContent: '0' }),
      Object.assign(document.createElement('span'), { className: 'opt-check', textContent: '✓' }),
      Object.assign(document.createElement('i'), { className: 'opt-bar' }),
    );
    return el;
  }));
  $('qPrompt').hidden = false;
  $('top5').hidden = true;
}

function revealQuestion(s) {
  if (builtIndex !== s.index) buildQuestion(s);
  const total = Math.max(1, s.counts.reduce((a, b) => a + b, 0));
  [...$('options').children].forEach((el, i) => {
    el.classList.toggle('correct', i === s.answer);
    el.querySelector('.opt-count').textContent = s.counts[i] ?? 0;
    el.querySelector('.opt-bar').style.width = `${((s.counts[i] ?? 0) / total) * 100}%`;
  });
  $('qPrompt').hidden = true;
  $('top5').hidden = !s.top.length;
  $('top5').replaceChildren(Object.assign(document.createElement('h2'), { textContent: 'TOP 5 HIỆN TẠI' }), renderTop(s.top));
}

function renderTop(list) {
  const ol = document.createElement('ol');
  ol.append(...list.map((p, i) => {
    const li = document.createElement('li');
    li.append(
      Object.assign(document.createElement('b'), { textContent: `#${i + 1}` }),
      Object.assign(document.createElement('span'), { textContent: p.name }),
      Object.assign(document.createElement('em'), { textContent: p.score.toLocaleString('vi-VN') }),
    );
    return li;
  }));
  return ol;
}

function renderQr(url) {
  const box = $('qr');
  if (box.dataset.url === url) return;
  box.dataset.url = url;
  if (!window.qrcode) {
    box.textContent = 'Không tải được QR (thiếu internet), đọc link bên dưới';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

// The dashboard picks which join link the projector advertises.
function renderLobby(s) {
  const urls = s.joinUrls?.length ? s.joinUrls : [s.joinUrl];
  const url = urls.includes(s.joinUrl) ? s.joinUrl : urls[0];
  renderQr(url);
  $('joinUrl').textContent = url.replace(/^https?:\/\//, '');
  $('lobbyCount').textContent = s.players;
}

function renderSeatCount() {
  const free = ARENA.slots.length - seatsTaken;
  $('seatCount').textContent = free > 0 ? `${free}/${ARENA.slots.length} ụ súng còn trống` : 'Hết ụ, người vào sau bắn từ lối đi';
}

function render(s) {
  $('players').textContent = s.players;
  $('phaseLabel').textContent = s.phase === 'fire' && !s.firing ? 'Ngưng bắn' : s.phase === 'question' ? `Câu ${s.index + 1}/${s.total}` : PHASE_LABEL[s.phase] ?? s.phase;
  document.body.dataset.firing = String(!!s.firing);
  if (s.phase === 'lobby') renderLobby(s);
  if (s.phase === 'question') {
    $('answeredNum').textContent = s.answered;
    $('answeredOf').textContent = `/${Math.max(s.online, s.answered)} đã trả lời`;
  }
  if (s.phase === 'end') {
    $('endTitle').textContent = 'Quái Vật Dễ Sợ đã bị hạ gục!';
    $('podium').replaceChildren(...renderTop(s.top).children);
    $('endStats').textContent = `${s.players} người chơi · ${s.total} câu hỏi · ${s.totalShots.toLocaleString('vi-VN')} phát bắn`;
  }
}

function banner(text, tone = 'info') {
  const el = $('banner');
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function sceneFor(s) {
  if (s.phase === 'end') return performance.now() < finaleAt ? 'finale' : 'end';
  return s.phase;
}

function tickHud() {
  const s = state;
  const scene = sceneFor(s);
  if (document.body.dataset.scene !== scene) document.body.dataset.scene = scene;
  const left = Math.max(0, s.endsAt - (Date.now() + offset)) / 1000;
  if (s.phase === 'countdown') {
    const n = Math.max(1, Math.ceil(left));
    if (n !== lastCount) {
      lastCount = n;
      $('countNum').textContent = n;
      $('countNum').classList.remove('tick');
      void $('countNum').offsetWidth;
      $('countNum').classList.add('tick');
    }
  }
  if (s.phase === 'question') {
    const seconds = Math.ceil(left);
    $('timerRing').style.strokeDashoffset = String(RING * (1 - Math.min(1, left / s.time)));
    if ($('timerNum').textContent !== String(seconds)) $('timerNum').textContent = seconds;
    $('qTimer').classList.toggle('urgent', seconds <= 5);
  }
  $('fireFill').style.width = s.phase === 'fire' && s.firing ? `${Math.min(1, left / s.fire) * 100}%` : '0%';
}

function tickBoss() {
  const { hp, max, dead } = bossHealth();
  const percent = Math.round(Math.max(0, Math.min(1, hp / max)) * 100);
  if ($('bossHealth').getAttribute('aria-valuenow') !== String(percent)) {
    $('bossHealth').setAttribute('aria-valuenow', percent);
    $('bossHealthFill').style.width = `${percent}%`;
    $('bossHealthTrail').style.width = `${percent}%`;
    $('bossPercent').textContent = `${percent}%`;
  }
  if (bossSeen === null) {
    bossSeen = dead;
  } else if (dead !== bossSeen) {
    bossSeen = dead;
    if (dead && state?.phase !== 'end') banner('Quái Vật Dễ Sợ gục ngã!', 'warn');
  }
}

function fit() {
  const k = Math.min(innerWidth / ARENA.width, innerHeight / ARENA.height);
  document.documentElement.style.setProperty('--k', k);
  resizeArena(k * (window.devicePixelRatio || 1));
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// Cursor and the fullscreen tip hide after a moment without the mouse, so the audience sees only the game.
let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2000);
}

async function boot() {
  document.body.classList.toggle('preview', PREVIEW);
  // initArena takes the canvas synchronously, so the first fit can size it while sprites load.
  const loading = initArena($('arena'));
  fit();
  addEventListener('resize', fit);
  $('promptShapes').replaceChildren(...ANSWERS.map(a => {
    const i = document.createElement('i');
    i.style.setProperty('--c', a.color);
    i.style.setProperty('--ledge', a.ledge);
    i.innerHTML = shapeSvg(a.shape);
    return i;
  }));
  renderSeatCount();

  if (!PREVIEW) {
    // The first key press or click on the projector window also unlocks its sound.
    initGameAudio();
    addEventListener('keydown', e => {
      if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
    });
    addEventListener('dblclick', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => document.body.classList.toggle('fullscreen', !!document.fullscreenElement));
    for (const type of ['pointermove', 'pointerdown']) addEventListener(type, wake);
    wake();
  }

  const art = await loading;
  paintHudPortrait($('bossAvatar'), art.boss, { kind: 'boss' });
  connect();

  let last = performance.now();
  requestAnimationFrame(function frame(now) {
    // Schedule first so one bad frame can't freeze the projector mid-event.
    requestAnimationFrame(frame);
    if (PREVIEW && now - last < PREVIEW_FRAME_MS) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    arenaFrame(dt, now / 1000);
    tickBoss();
    if (state) tickHud();
  });
}

boot();

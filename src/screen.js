// Projector game screen (1920×1080 stage): the shared arena with a turret per player, the
// Kahoot-style question board, the shooting rounds and the final Top 5. It has no controls: the MC
// drives the game from the dashboard at /host, which also embeds this page as a preview (?preview=1).
import { ANSWERS, ARENA, shapeSvg } from './config.js';
import { initArena, resizeArena, arenaFrame, setSeats, setArenaPhase, syncBoss, queueShots, bossAttack, armTurret, reactAt, bossHealth } from './arena-view.js';
import { initFearCloud, resizeFearCloud, fearFrame, setFearWords, startStorm, startOutro, endStorm } from './fear-cloud.js';
import { paintHudPortrait } from './hud-art.js';
import { initGameAudio } from './audio.js';
import { mountBottle, setBottleFill } from './bottle.js';
import { FINALE } from './finale-config.js';
import { loadVictoryArt, drawVictoryFilm } from './victory-film.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// The dashboard's preview is silent, renders at a lower frame rate and doesn't count as a projector.
const PREVIEW = params.has('preview');
const PREVIEW_FRAME_MS = 50;
const RING = 2 * Math.PI * 52;

let key = params.get('key');
try {
  if (key) sessionStorage.setItem('foxquiz.hostKey', key);
  else key = sessionStorage.getItem('foxquiz.hostKey');
} catch { /* storage blocked */ }
key ??= prompt('Nhập host key (in trong terminal khi chạy server):') ?? '';

let state = null;
let offset = 0;
let fearQrUrl = '';
let builtIndex = -1;
let lastCount = -1;
let roundShots = 0;
let bossSeen = null;   // last boss "dead" flag shown, null until the first frame after connecting
const announced = new Set();
const victoryPlayback = { active: false, complete: false, fallback: false, started: 0, progress: 0, progressAt: 0 };
let victoryArt = null;
let podiumKey = '';

const phaseElapsed = s => Math.max(0, ((Date.now() + offset) - (s.phaseAt || s.now)) / 1000);
const finisherPlayback = { active: false, muted: false };

function stopVictory() {
  $('victoryVideo').pause();
  Object.assign(victoryPlayback, { active: false, complete: false, fallback: false });
  $('victoryFallback').hidden = true;
  $('victoryVideo').hidden = false;
  $('victoryPlay').hidden = true;
}

function fallbackVictory() {
  if (!victoryPlayback.active || victoryPlayback.complete || victoryPlayback.fallback) return;
  const video = $('victoryVideo');
  const elapsed = Math.min(FINALE.victorySeconds, video.currentTime || phaseElapsed(state));
  video.pause();
  victoryPlayback.fallback = true;
  victoryPlayback.started = performance.now() / 1000 - elapsed;
  video.hidden = true;
  $('victoryFallback').hidden = false;
}

function startVictory(s) {
  const video = $('victoryVideo');
  Object.assign(victoryPlayback, { active: true, complete: false, fallback: false, started: performance.now() / 1000 - phaseElapsed(s), progress: -1, progressAt: performance.now() });
  video.hidden = false;
  $('victoryFallback').hidden = true;
  const play = () => {
    if (!victoryPlayback.active || victoryPlayback.fallback) return;
    video.currentTime = Math.min(phaseElapsed(s), Math.max(0, (video.duration || FINALE.victorySeconds) - 0.05));
    video.play().catch(fallbackVictory);
  };
  if (video.readyState >= 1) play();
  else video.addEventListener('loadedmetadata', play, { once: true });
  if (video.error) fallbackVictory();
}

function tickVictory(now) {
  if (!victoryPlayback.active || victoryPlayback.complete) return;
  const video = $('victoryVideo');
  if (victoryPlayback.fallback) {
    const elapsed = now / 1000 - victoryPlayback.started;
    if (victoryArt) drawVictoryFilm($('victoryFallback'), victoryArt, Math.min(FINALE.victorySeconds - 0.001, elapsed));
    if (elapsed >= FINALE.victorySeconds) victoryPlayback.complete = true;
    return;
  }
  if (video.currentTime !== victoryPlayback.progress) {
    victoryPlayback.progress = video.currentTime;
    victoryPlayback.progressAt = now;
  } else if (now - victoryPlayback.progressAt > 2500 && !document.hidden) {
    fallbackVictory();
  }
}

// The finishing blow plays with sound. A projector has usually had its audio unlocked by the
// first key press (F for fullscreen); where the browser still refuses a sound-on autoplay we
// replay muted rather than stall — the hall would rather see the film silent than see nothing.
function stopFinisher() {
  $('finisherVideo').pause();
  finisherPlayback.active = false;
  $('finisher').hidden = false;
}

function startFinisher(s) {
  const video = $('finisherVideo');
  Object.assign(finisherPlayback, { active: true, muted: false });
  $('finisher').hidden = false;
  video.muted = false;
  const roll = () => {
    if (!finisherPlayback.active) return;
    // A projector opened late, or one that reconnects mid-blow, joins at the server's second
    // instead of replaying the throw the hall has already watched.
    video.currentTime = Math.min(phaseElapsed(s), Math.max(0, (video.duration || FINALE.finisherSeconds) - 0.05));
    video.play().catch(() => {
      if (finisherPlayback.muted) return failFinisher();
      finisherPlayback.muted = true;
      video.muted = true;
      video.play().catch(failFinisher);
    });
  };
  if (video.readyState >= 1) roll();
  else video.addEventListener('loadedmetadata', roll, { once: true });
  if (video.error) failFinisher();
}

// Nothing to play: drop the cover so the arena and the finishing-blow caption underneath carry
// the moment instead of five seconds of black. The server still fells the boss and moves on.
function failFinisher() {
  finisherPlayback.active = false;
  $('finisher').hidden = true;
}

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
    case 'react':
      for (const [turret, icon] of msg.seats ?? []) reactAt(turret, icon);
      return;
    case 'charge':
      renderCharge(msg);
      return;
    case 'fear':
      onFear(msg);
      return;
  }
}

// The bottle and its meter, driven by the hall's running tap total.
function renderCharge({ taps, goal, full }) {
  const p = Math.min(1, taps / Math.max(1, goal));
  $('chargeFill').style.width = `${p * 100}%`;
  $('chargeFill').parentElement.setAttribute('aria-valuenow', Math.round(p * 100));
  setBottleFill($('chargeBottle'), p);
  const bottle = document.querySelector('.bottle');
  bottle.dataset.wet = String(p > 0.01 && p < 0.995);
  bottle.dataset.near = String(p >= 0.9 && !full);
  bottle.dataset.full = String(!!full);
  if (full) $('chargeTitle').textContent = 'BÌNH ĐẦY RỒI!';
}

function onSeats(msg) {
  setSeats(msg.seats);
  // Newest arrivals first; a reconnecting projector lists the latest few instead of everyone.
  const fresh = msg.seats.filter(([, n]) => !announced.has(n)).sort((a, b) => a[1] - b[1]).slice(-8);
  for (const [, n] of msg.seats) announced.add(n);
  const list = $('arrivals');
  for (const [, , name] of fresh) list.prepend(Object.assign(document.createElement('li'), { textContent: name }));
  while (list.children.length > 8) list.lastElementChild.remove();
}

function onState(s) {
  offset = s.now - Date.now();
  const prev = state;
  state = s;
  const changed = !prev || prev.phase !== s.phase || prev.index !== s.index;
  if (changed) enterPhase(s, !!prev);
  if (prev?.phase === 'fire' && s.phase === 'fire' && prev.firing && !s.firing) ceaseFire();
  // Follow the server's boss HP; a new game or a freshly opened page snaps instead of animating.
  // The film covers the stage during the finale, so the arena no longer has to pace the last
  // sliver itself: the server drops the boss on the frame the fear goes out and this follows.
  syncBoss(s.bossDmg, s.bossMax, !prev || (changed && (s.phase === 'lobby' || s.phase === 'countdown')));
  render(s);
}

function enterPhase(s, live) {
  if (!['victory', 'end'].includes(s.phase)) stopVictory();
  if (s.phase !== 'unleash') stopFinisher();
  setArenaPhase(s.phase);
  switch (s.phase) {
    case 'lobby':
      podiumKey = '';
      break;
    case 'countdown':
      lastCount = -1;
      break;
    // Đề hiện một mình trước: cả hội trường đọc xong rồi đáp án và đồng hồ mới cùng bật lên.
    case 'reading':
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
      if (live && s.firing) banner(right ? 'TAP TAP TAP!' : 'Quái Vật phản đòn!', right ? 'warn' : 'bad');
      break;
    }
    case 'finalreading':
    case 'final':
      buildQuestion(s);
      if (live && s.phase === 'finalreading') banner('Câu cuối: đố vui!', 'info');
      break;
    case 'finalreveal':
      revealQuestion(s);
      $('top5').hidden = true;
      break;
    case 'charge':
      $('chargeTitle').textContent = 'CẢ HỘI TRƯỜNG TAP ĐI!';
      renderCharge(s.charge ?? { taps: 0, goal: 300, full: false });
      if (live) banner('TÍCH NƯỚC — TAP TAP TAP!', 'warn');
      break;
    case 'unleash':
      renderCharge({ ...(s.charge || {}), taps: s.charge?.goal || 300, goal: s.charge?.goal || 300, full: true });
      startFinisher(s);
      break;
    case 'victory':
      startVictory(s);
      break;
  }
}

function ceaseFire() {
  banner(`Ngưng bắn! ${roundShots.toLocaleString('vi-VN')} phát`, 'info');
}

function buildQuestion(s) {
  const q = s.question;
  if (!q) return;
  builtIndex = s.index;
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

function renderQrInto(box, url, cellSize = 8) {
  if (!box || box.dataset.url === url) return;
  box.dataset.url = url;
  if (!window.qrcode) {
    box.textContent = 'Không tải được QR (thiếu internet), đọc link bên dưới';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize, margin: 2, scalable: true });
}

// The dashboard picks which join link the projector advertises.
function renderLobby(s) {
  const urls = s.joinUrls?.length ? s.joinUrls : [s.joinUrl];
  const url = urls.includes(s.joinUrl) ? s.joinUrl : urls[0];
  renderQrInto($('qr'), url);
  $('joinUrl').textContent = url.replace(/^https?:\/\//, '');
  $('lobbyCount').textContent = s.players;
  // Đoạn mở màn có mã riêng: cùng máy chủ, khác đường — /fear là bàn phím, / là tay cầm.
  fearQrUrl = `${url.replace(/\/+$/, '')}/fear`;
  renderQrInto($('fearQr'), fearQrUrl, 8);
  renderQrInto($('fearMiniQr'), fearQrUrl, 3);
  $('fearUrl').textContent = fearQrUrl.replace(/^https?:\/\//, '');
}

function render(s) {
  $('players').textContent = s.players;
  document.body.dataset.firing = String(!!s.firing);
  if (s.phase === 'lobby') renderLobby(s);
  if (s.phase === 'end') {
    const nextKey = JSON.stringify(s.top);
    if (nextKey !== podiumKey) {
      podiumKey = nextKey;
      $('podium').replaceChildren(...renderPodium(s.top, s.total));
    }
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
  // Đoạn mở màn chiếm trọn màn chiếu cho tới khi Quái Vật bay đi; game phía sau vẫn ở phòng chờ.
  if (fear.phase === 'wait') return 'fearjoin';
  if (fear.phase === 'open') return 'fearcloud';
  if (fear.phase === 'storm') return 'fearstorm';
  // Câu hỏi đọng lại sau đoạn phim: giữ máy chiếu ở đây cho tới khi MC bấm, đừng để lộ đấu trường.
  if (fear.phase === 'outro') return 'fearoutro';
  if (s.phase === 'end' && victoryPlayback.active && !victoryPlayback.complete) return 'victory';
  // Hết lượt bắn mà còn đồng hồ nghỉ: máy chiếu đếm cùng điện thoại tới câu sau.
  if (s.phase === 'fire' && !s.firing && s.endsAt) return 'breather';
  return s.phase;
}

// ---- Nỗi sợ ------------------------------------------------------------------------

const fear = { phase: 'done', phaseAt: 0, people: 0, total: 0, kinds: 0, top: [] };

function onFear(msg) {
  const was = fear.phase;
  Object.assign(fear, { phase: msg.phase, phaseAt: msg.phaseAt, people: msg.people, total: msg.total, kinds: msg.kinds, top: msg.top ?? [] });
  setFearWords(msg.words);
  const since = Math.max(0, (Date.now() + offset - msg.phaseAt) / 1000);
  if (msg.phase === was) { /* chỉ là số đếm đổi: đoạn phim cứ chạy tiếp */ }
  else if (msg.phase === 'storm') startStorm(fear.top, since);
  else if (msg.phase === 'outro') startOutro(since);
  else endStorm();
  $('fearPeople').textContent = String(fear.people);
  if (state) render(state);
}

// Top 5 on the victory screen: the score that ranked them, plus how much of the hall's tapping
// was theirs — the number people actually want to hear read out.
function renderPodium(list, total) {
  return list.slice(0, 5).map((p, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--step-height', `${[340, 270, 225, 170, 130][i]}px`);
    li.style.setProperty('--podium-order', [3, 2, 4, 1, 5][i]);
    li.style.setProperty('--reveal-delay', `${(4 - i) * 350}ms`);
    li.setAttribute('aria-label', `Hạng ${i + 1}, ${p.name}, ${p.score} điểm, đúng ${p.correct ?? 0}/${total} câu`);
    const step = Object.assign(document.createElement('div'), { className: 'podium-step' });
    step.append(
      Object.assign(document.createElement('b'), { textContent: String(i + 1) }),
      Object.assign(document.createElement('em'), { textContent: p.score.toLocaleString('vi-VN') }),
      Object.assign(document.createElement('i'), { textContent: `${p.correct ?? 0}/${total} câu` }),
    );
    li.append(
      Object.assign(document.createElement('img'), { className: 'podium-fox', src: '/assets/design/icons/default-mascot.svg', alt: '', width: 120, height: 120 }),
      Object.assign(document.createElement('span'), { textContent: p.name }),
      step,
    );
    return li;
  });
}

function tickHud() {
  const s = state;
  const scene = sceneFor(s);
  if (document.body.dataset.scene !== scene) {
    document.body.dataset.scene = scene;
    if (scene === 'countdown' || scene === 'breather') {
      lastCount = -1;
      $('countLabel').textContent = scene === 'breather' ? 'Câu tiếp theo sắp hiện!' : 'Chuẩn bị!';
    }
  }
  const left = Math.max(0, s.endsAt - (Date.now() + offset)) / 1000;
  if (scene === 'countdown' || scene === 'breather') {
    const n = Math.max(1, Math.ceil(left));
    if (n !== lastCount) {
      lastCount = n;
      $('countNum').textContent = n;
      $('countNum').classList.remove('tick');
      void $('countNum').offsetWidth;
      $('countNum').classList.add('tick');
    }
  }
  if (['reading', 'question', 'finalreading'].includes(s.phase)) {
    const reading = s.phase !== 'question';
    const span = reading ? s.read || 1 : s.time;
    const seconds = Math.ceil(left);
    $('timerRing').style.strokeDashoffset = String(RING * (1 - Math.min(1, left / span)));
    if ($('timerNum').textContent !== String(seconds)) $('timerNum').textContent = seconds;
    $('qTimer').classList.toggle('urgent', !reading && seconds <= 5);
  }
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
    if (dead && !['unleash', 'victory', 'end'].includes(state?.phase)) banner('Quái Vật Dễ Sợ gục ngã!', 'warn');
  }
}

function fit() {
  const k = Math.min(innerWidth / ARENA.width, innerHeight / ARENA.height);
  document.documentElement.style.setProperty('--k', k);
  resizeArena(k * (window.devicePixelRatio || 1));
  resizeFearCloud(k * (window.devicePixelRatio || 1));
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
  mountBottle($('chargeBottle'));
  $('victoryVideo').src = FINALE.videoUrl;
  $('victoryVideo').addEventListener('ended', () => { if (victoryPlayback.active) victoryPlayback.complete = true; });
  $('victoryVideo').addEventListener('error', fallbackVictory);
  loadVictoryArt().then(art => { victoryArt = art; }).catch(err => console.warn('Victory fallback artwork:', err));
  // initArena takes the canvas synchronously, so the first fit can size it while sprites load.
  const loading = initArena($('arena'));
  initFearCloud($('fearCanvas'));
  fit();
  addEventListener('resize', fit);
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
    if (document.body.dataset.scene?.startsWith('fear')) {
      const film = fear.phase === 'storm' || fear.phase === 'outro';
      fearFrame(dt, film ? (Date.now() + offset - fear.phaseAt) / 1000 : null);
    } else {
      arenaFrame(dt, now / 1000);
    }
    tickVictory(now);
    tickBoss();
    if (state) tickHud();
  });
}

boot();

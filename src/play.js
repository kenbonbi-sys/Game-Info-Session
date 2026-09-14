// Player client (phone or laptop), set in a portrait space arena. In the lobby each player walks their
// fox onto one of the 30 neon rings and takes that water-cannon turret; seats lock when the game
// starts. Questions pop up as buttons: a correct answer swivels that player's barrel toward
// Quái Vật Dễ Sợ and fires, a wrong or missing answer gets the turret shot back. Each player also has
// three one-shot items. Every player sees every fox, turret, shot, hit and armed item.
import { loadSvgStrip, loadGridSheet, splitGridSheet, buildFoxSheet } from './sprites.js';
import { Input } from './world.js';
import { Player } from './entities.js';
import { SPRITES, ITEMS, ARENA } from './config.js';
import { createArenaBackdrop, drawArenaAmbience } from './arena-scene.js';
import { paintHudPortrait, drawJoinDuel } from './hud-art.js';
import { initGameAudio, playShotSfx } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const LETTERS = 'ABCD';
const BOSS_HP_PER_QUESTION = 700;
const MAX_OTHERS_DRAWN = 40;
const MOVE_SEND_INTERVAL = 0.2;
const MAX_BOLTS = 80;
const PLAY_PHASES = ['countdown', 'question', 'reveal'];
const MAX_AIM = (70 * Math.PI) / 180;   // how far a barrel may swivel from upright
const TURRET_BASE_FRAC = 0.735;         // platform width / frame width in the turret art
const TURRET_ANCHOR_Y = 0.8;            // frame y (fraction) that sits on the ring centre
const FOX_HEIGHT_ROW4 = 145;            // readable walking fox, scaled to the portrait sockets
const TOUCH = matchMedia('(pointer: coarse)').matches;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const COMPACT = matchMedia('(max-width: 899px), (pointer: coarse) and (max-height: 500px)');

// view: logical canvas size (device px / scale). arena: where the map is drawn (logical px) and
// its map→logical scale. cam: map px at the arena's top-left corner.
const view = { w: 0, h: 0, scale: 1, dpr: 1, left: 0 };
const arena = { x: 0, y: 0, w: 0, h: 0, s: 1 };
const cam = { x: 0, y: 0 };
const net = { pid: null, name: '', es: null, offset: 0, connected: false, no: null, lastMove: '', moveTimer: 0 };
const quiz = {
  phase: 'connecting', index: -1, total: 15, time: 15, endsAt: 0, players: 0, hall: 0,
  question: null, answer: null, picked: null, result: null, you: null, answered: new Set(), bossSynced: false,
};
const boss = { hp: 1, max: 1, anim: 'idle', animT: 0, flightT: 0, bubble: null, dead: false, deadT: 0 };
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, dragging: false };
// Where a tap sent the fox. turret >= 0 means "mount that turret once you arrive".
const walk = { x: 0, y: 0, turret: -1, active: false };
// Turret the player tapped, waiting on the join confirmation in the dock.
let pendingTurret = -1;
const others = new Map();  // player number → { n, name, wx, wy, v, x, y, moving, seated, t, showName }
const seats = { count: 0, byTurret: new Map(), byPlayer: new Map(), mine: -1, error: '', near: -1 };
// My items as last reported by the server; `removed` = options hidden by the hint for `removedIndex`.
const inv = { items: { hint: 0, shield: 0, boost: 0 }, armed: { shield: false, boost: false }, removed: null, removedIndex: -1, busy: false };
// Banner colours used across the game → CIO Academy toast tones.
const BANNER_TONES = { '#7dbcff': 'good', '#ff866b': 'bad', '#ffc1b3': 'bad', '#5aaaff': 'info', '#ff481f': 'warn' };
// Names follow the viewer's POV, including when a player is seated at a cannon.
const NAME_COLORS = { mine: '#72F58A', other: '#FFFFFF', free: '#B8DCFF' };
const INK = '#4F1E13';
const SHADOW = '#2A1A17';
let turretFx = [];         // per turret: { name: 'idle' | 'aim' | 'fire', t, hit, block, pending, shield, boost, angle, hold }

// turretParts: the turret sheet split into a static base and a barrel layer that swivels toward the boss.
let hero, bossSheet, turretSheet, turretParts, turretEmptySheet, turretEmptyParts, mapImage, player;
// Positions below are map px. shots: water blasts to the boss · bolts: boss attacks flying at turrets
let shots = [], bolts = [], particles = [], texts = [];
let redFlash = 0, lastCount = 0;
let answerRequest = null;

const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};
const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---- Arena geometry (map px) ---------------------------------------------------

const wu = () => 1 / arena.s;  // map px per logical px, to keep effects a constant size on screen
const toScreen = (x, y) => ({ x: arena.x + (x - cam.x) * arena.s, y: arena.y + (y - cam.y) * arena.s });

function ringWidthAt(y) {
  const r = ARENA.ringWidth;
  return clamp(r.w0 + (y - r.y0) * r.perPx, r.min, r.max);
}

const slotPos = i => ({ x: ARENA.slots[i][0], y: ARENA.slots[i][1] });
const turretFrame = () => (turretSheet ? turretSheet.frames[0] : { w: 92, h: 95 });

// Top-left of turret i's frame and its frame→map scale (bigger toward the front rows).
function turretBox(i) {
  const p = slotPos(i);
  const f = turretFrame();
  const k = ringWidthAt(p.y) / TURRET_BASE_FRAC / f.w;
  return { x: p.x - 0.5 * f.w * k, y: p.y - TURRET_ANCHOR_Y * f.h * k, w: f.w * k, h: f.h * k, k };
}

// The barrel's hinge (where the tube meets the water tank).
function barrelHinge(i) {
  const b = turretBox(i);
  const { barrel } = SPRITES.turret;
  return { x: b.x + barrel.hingeX * b.w, y: b.y + barrel.cutY * b.h };
}

// One pose keeps the sprite, shadow, speech and homing projectiles together as the boss flies.
function bossPose() {
  const B = ARENA.boss;
  const phase = boss.flightT * Math.PI * 2 / B.flight.period;
  return {
    ...B,
    x: B.x + Math.sin(phase) * B.flight.radiusX,
    feetY: B.feetY + Math.sin(phase * 2) * B.flight.radiusY,
  };
}

function bossTarget() {
  const B = bossPose();
  return { x: B.x, y: B.feetY - B.height * 0.55 };
}

// The hurt and attack rows play once, then fall back to idle. A repeat trigger lets the current
// pass finish rather than restarting it, so a burst of hits can't pin the boss on frame one.
function bossPlay(name) {
  if (boss.dead || boss.anim === name) return;
  Object.assign(boss, { anim: name, animT: 0 });
}

function bossFrame() {
  const a = bossSheet.anims[boss.anim] ?? bossSheet.anims.idle;
  const i = Math.floor(boss.animT * a.fps);
  return a.frames[a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1)];
}

// Angle from upright toward the boss (clockwise positive, like canvas rotate), clamped.
function aimAngle(i) {
  const hinge = barrelHinge(i);
  const target = bossTarget();
  return clamp(Math.atan2(target.x - hinge.x, hinge.y - target.y), -MAX_AIM, MAX_AIM);
}

// The muzzle follows the barrel's current swivel.
function muzzlePos(i) {
  const b = turretBox(i);
  const { muzzle, barrel } = SPRITES.turret;
  const hinge = barrelHinge(i);
  const dx = (muzzle.x - barrel.hingeX) * b.w;
  const dy = (muzzle.y - barrel.cutY) * b.h;
  const a = turretFx[i]?.angle ?? 0;
  return { x: hinge.x + dx * Math.cos(a) - dy * Math.sin(a), y: hinge.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

function turretCentre(i) {
  const b = turretBox(i);
  return { x: b.x + b.w / 2, y: b.y + b.h * 0.45 };
}

// Standing on (or right next to) a ring counts as being at that turret.
function nearestTurret() {
  let best = -1, bestD = 1;
  for (let i = 0; i < seats.count; i++) {
    const p = slotPos(i);
    const w = ringWidthAt(p.y);
    const d = Math.hypot((player.x - p.x) / (w * 0.85), (player.y - p.y) / (w * 0.5));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}


// ---- Tap to walk, tap a turret to join ----------------------------------------

const mapPoint = (clientX, clientY) => ({
  x: cam.x + (toLogical(clientX) - arena.x) / arena.s,
  y: cam.y + (toLogical(clientY) - arena.y) / arena.s,
});

// Turret under a map point: either its sprite or the neon ring painted on the floor.
function turretAt(mx, my) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < seats.count; i++) {
    const p = slotPos(i);
    const w = ringWidthAt(p.y);
    const b = turretBox(i);
    const onRing = Math.hypot((mx - p.x) / (w * 0.62), (my - p.y) / (w * 0.34)) <= 1;
    const onArt = mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
    if (!onRing && !onArt) continue;
    const d = Math.hypot(mx - p.x, my - p.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// The fox cannot stand on a platform, so it aims just in front of the ring.
const approachPoint = i => ({ x: slotPos(i).x, y: slotPos(i).y + ringWidthAt(slotPos(i).y) * 0.4 });

// Pull a tap inside the walkable trapezoid, or the fox shoves at a wall until it times out.
function clampToFloor(x, y) {
  const f = ARENA.floor;
  const ty = clamp(y, f.top, f.bottom);
  const k = (ty - f.top) / (f.bottom - f.top);
  return { x: clamp(x, lerp(f.topX[0], f.bottomX[0], k) + player.r, lerp(f.topX[1], f.bottomX[1], k) - player.r), y: ty };
}

function cancelWalk() {
  if (!walk.active && pendingTurret < 0) return;
  Object.assign(walk, { active: false, turret: -1 });
  pendingTurret = -1;
  $('seat').dataset.sig = '';
}

function tapArena(clientX, clientY) {
  if (quiz.phase !== 'lobby' || seats.mine >= 0 || !player || !$('join').hidden) return;
  const m = mapPoint(clientX, clientY);
  const i = turretAt(m.x, m.y);
  if (i >= 0) {
    // Tapping a ring only asks the question; the dock carries the answer.
    pendingTurret = i;
    Object.assign(walk, { active: false, turret: -1 });
  } else {
    pendingTurret = -1;
    Object.assign(walk, { ...clampToFloor(m.x, m.y), turret: -1, active: true, t: 0 });
  }
  seats.error = '';
  $('seat').dataset.sig = '';
}

// Steer toward the tap target, easing over the last stretch so the fox settles.
function walkAxis(dt) {
  walk.t += dt;
  const dx = walk.x - player.x;
  const dy = walk.y - player.y;
  const d = Math.hypot(dx, dy);
  // Give up if a platform blocks the way, rather than jittering against it forever.
  if (d < 7 || walk.t > 6) {
    const seat = d < 7 ? walk.turret : -1;
    Object.assign(walk, { active: false, turret: -1 });
    if (seat >= 0) joinTurret(seat);
    else $('seat').dataset.sig = '';
    return { x: 0, y: 0 };
  }
  const k = Math.min(1, d / 34) / d;
  return { x: dx * k, y: dy * k };
}

const floorBounds = {
  collide(ent) {
    const f = ARENA.floor;
    ent.y = clamp(ent.y, f.top, f.bottom);
    const t = (ent.y - f.top) / (f.bottom - f.top);
    ent.x = clamp(ent.x, lerp(f.topX[0], f.bottomX[0], t) + ent.r, lerp(f.topX[1], f.bottomX[1], t) - ent.r);
    // Walk around turret platforms (ellipses on the floor).
    for (let i = 0; i < seats.count; i++) {
      const p = slotPos(i);
      const w = ringWidthAt(p.y);
      const rx = w * 0.45 + ent.r * 0.5, ry = w * 0.22 + ent.r * 0.3;
      const nx = (ent.x - p.x) / rx, ny = (ent.y - p.y) / ry;
      const d = Math.hypot(nx, ny);
      if (d >= 1 || d < 0.001) continue;
      ent.x = p.x + (nx / d) * rx;
      ent.y = p.y + (ny / d) * ry;
    }
  },
};

const foxScaleAt = y => (FOX_HEIGHT_ROW4 * (ringWidthAt(y) / 150)) / hero.headroom;

// ---- Layout & input ------------------------------------------------------------

const toLogical = css => (css * view.dpr) / view.scale;

// The canvas renders at full device resolution; drawing code works in logical px via setTransform.
function resize() {
  const viewport = window.visualViewport;
  // Don't mistake pinch zoom for the keyboard: zoom must remain available.
  const height = viewport && Math.abs(viewport.scale - 1) < 0.05 ? viewport.height : innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
  document.body.dataset.keyboard = String(document.activeElement === $('nameInput') && height < innerHeight - 100);
  view.dpr = Math.min(window.devicePixelRatio || 1, 3);
  view.scale = Math.max(1, Math.round((Math.min(innerWidth, innerHeight) * view.dpr) / 320));
  canvas.width = Math.round(innerWidth * view.dpr);
  canvas.height = Math.round(height * view.dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${height}px`;
  canvas.style.top = `${viewport?.offsetTop ?? 0}px`;
  view.w = canvas.width / view.scale;
  view.h = canvas.height / view.scale;
  layout();
}

// CSS owns the responsive layout. Measure the scene's actual grid cell, including safe areas.
// The same contain scale is used before and after seating, so the world never jumps on join/leave.
function layout() {
  const rect = $('sceneStage').getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  Object.assign(arena, {
    x: toLogical(rect.left - canvasRect.left), y: toLogical(rect.top - canvasRect.top + 28),
    w: toLogical(Math.max(1, rect.width)), h: toLogical(Math.max(1, rect.height - 54)),
  });
  arena.s = Math.max(0.001, Math.min(arena.w / ARENA.width, arena.h / ARENA.height));
  document.documentElement.style.setProperty('--banner-x', `${rect.left + rect.width / 2}px`);
  document.documentElement.style.setProperty('--banner-y', `${rect.top + rect.height * .45}px`);
  if (player) updateCamera(1);
}

// Showing or hiding a bottom-docked panel changes the room left for the zoomed-out map.
function dock(el, hidden) {
  if (el.hidden === hidden) return;
  el.hidden = hidden;
  layout();
}

function updateCamera(dt) {
  const vw = arena.w / arena.s, vh = arena.h / arena.s;
  const tx = vw >= ARENA.width ? (ARENA.width - vw) / 2 : clamp(player.x - vw / 2, 0, ARENA.width - vw);
  const ty = vh >= ARENA.height ? (ARENA.height - vh) / 2 : clamp(player.y - vh / 2, 0, ARENA.height - vh);
  const k = dt >= 1 ? 1 : 1 - Math.exp(-dt * 8);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

function moveAxis() {
  const keys = Input.axis();
  if (keys.x || keys.y) return keys;
  if (stick.id === null || !stick.dragging) return { x: 0, y: 0 };
  const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
  const len = Math.hypot(dx, dy);
  if (len < 6) return { x: 0, y: 0 };
  const k = Math.min(1, len / 45) / len;
  return { x: dx * k, y: dy * k };
}

// A press that never travels far is a tap; anything further becomes the joystick.
const DRAG_SLOP = 12;

function initTouch() {
  canvas.addEventListener('pointerdown', e => {
    if (stick.id !== null || quiz.phase !== 'lobby' || seats.mine >= 0 || !$('join').hidden) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, dragging: false });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    stick.x = e.clientX;
    stick.y = e.clientY;
    if (!stick.dragging && Math.hypot(stick.x - stick.ox, stick.y - stick.oy) > DRAG_SLOP) {
      stick.dragging = true;
      cancelWalk();
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerId !== stick.id) return;
    if (!stick.dragging) tapArena(e.clientX, e.clientY);
    stick.id = null;
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, e => {
      if (e.pointerId === stick.id) stick.id = null;
    });
  }
  const release = () => { stick.id = null; };
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
}

// ---- Networking ----------------------------------------------------------------

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

async function join(name) {
  $('joinError').textContent = '';
  $('joinBtn').disabled = true;
  $('joinBtn').textContent = 'Đang vào phòng…';
  try {
    const r = await post('/api/join', { name, pid: net.pid });
    if (!r.ok) throw new Error(r.data.error || `Lỗi ${r.status}`);
    net.pid = r.data.pid;
    net.no = r.data.n;
    net.name = r.data.name;
    session.set('foxquiz.pid', net.pid);
    local.set('foxquiz.name', net.name);
    quiz.answered = new Set(r.data.answered);
    $('join').hidden = true;
    $('nameInput').blur();
    $('gameHud').hidden = false;
    document.body.dataset.phase = quiz.phase;
    $('card').hidden = false;
    connect();
    renderCard();
    Object.assign(player, { x: ARENA.spawn.x + rand(-20, 20), y: ARENA.spawn.y + rand(-10, 10) });
    floorBounds.collide(player);
    layout();
    net.lastMove = '';
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
  es.onopen = () => {
    $('conn').hidden = true;
    net.connected = true;
    net.lastMove = '';
  };
  es.onmessage = e => onMessage(JSON.parse(e.data));
  es.onerror = () => {
    $('conn').hidden = false;
    net.connected = false;
    if (es.readyState !== EventSource.CLOSED) return;
    // The server no longer knows this player (restarted) → join again under the same name.
    net.pid = null;
    setTimeout(() => join(net.name), 1500);
  };
}

// Sends our map position at most 5×/s, only when it changed.
function sendPosition(dt) {
  net.moveTimer -= dt;
  if (net.moveTimer > 0 || !net.connected) return;
  net.moveTimer = MOVE_SEND_INTERVAL;
  const x = Math.round(player.x), y = Math.round(player.y);
  const v = Math.max(0, hero.views ? hero.views.indexOf(player.anim.view) : 0);
  const key = `${x},${y},${v}`;
  if (key === net.lastMove) return;
  net.lastMove = key;
  fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: net.pid, x, y, v }),
    keepalive: true,
  }).catch(() => { net.lastMove = ''; });
}

function addOther(n, name) {
  if (n === net.no) return null;
  let o = others.get(n);
  if (!o) others.set(n, (o = { n, name, wx: -1, wy: -1, v: 0, x: null, y: null, moving: false, seated: false, t: Math.random() * 1000, showName: false }));
  o.name = name;
  return o;
}

const newTurretFx = () => ({ name: 'idle', t: 0, hit: 0, block: 0, pending: null, shield: false, boost: false, angle: 0, hold: 0 });

function onTurrets(msg) {
  const before = seats.mine;
  seats.count = Math.min(msg.count, ARENA.slots.length);
  seats.byTurret.clear();
  seats.byPlayer.clear();
  for (const [i, n, name] of msg.seats) {
    if (i >= seats.count) continue;
    seats.byTurret.set(i, { n, name });
    seats.byPlayer.set(n, i);
  }
  seats.mine = seats.byPlayer.get(net.no) ?? -1;
  while (turretFx.length < seats.count) turretFx.push(newTurretFx());
  // Just left a turret: step off the ring toward the front so the prompt shows that turret again.
  if (before >= 0 && seats.mine < 0 && player) {
    const p = slotPos(before);
    Object.assign(player, { x: p.x, y: p.y + ringWidthAt(p.y) * 0.4 });
    floorBounds.collide(player);
  }
  if ((before >= 0) !== (seats.mine >= 0)) layout();
  if (quiz.phase === 'lobby') renderCard();
  else renderScore();
}

function onFire(msg) {
  const fx = turretFx[msg.t];
  if (!fx) return;
  quiz.hall = Math.max(quiz.hall, msg.hall);
  if (!msg.ok) {
    spawnBolt(msg.t, msg.blocked);
    return;
  }
  if (msg.double) fx.boost = false;
  const pending = { dmg: msg.pts, hall: msg.hall, count: msg.double ? 2 : 1 };
  if (turretSheet) Object.assign(fx, { name: 'aim', t: 0, pending });
  else fireShot(msg.t, pending);
}

function onMiss(msg) {
  for (const t of msg.turrets) spawnBolt(t, false);
  for (const t of msg.blocked ?? []) spawnBolt(t, true);
  // The server sends 'miss' just before the reveal state, so remember it for revealQuestion().
  if (msg.blocked?.includes(seats.mine)) {
    quiz.shieldedIndex = quiz.index;
    if (quiz.result?.timeout) quiz.result.blocked = true;
  }
  if (msg.turrets.includes(seats.mine) && !boss.dead) boss.bubble = { text: 'Hết giờ rồi!', life: 2 };
  renderCard();
}

function onYou(msg) {
  quiz.you = msg;
  if (msg.items) Object.assign(inv, { items: msg.items, armed: msg.armed });
  if (msg.hint && quiz.phase === 'question') Object.assign(inv, { removed: msg.hint, removedIndex: quiz.index });
  applyHint();
  renderItems();
  renderScore();
  if (quiz.phase === 'end') renderEnd();
}

function onMessage(msg) {
  switch (msg.type) {
    case 'world':
      net.no = msg.you;
      others.clear();
      for (const [n, name, x, y, v] of msg.players) Object.assign(addOther(n, name) ?? {}, { wx: x, wy: y, v });
      return;
    case 'pos':
      for (const n of msg.left) others.delete(n);
      for (const [n, name] of msg.names) addOther(n, name);
      for (const [n, x, y, v] of msg.p) {
        const o = others.get(n);
        if (o) Object.assign(o, { wx: x, wy: y, v });
      }
      return;
    case 'turrets':
      onTurrets(msg);
      return;
    case 'fire':
      onFire(msg);
      return;
    case 'miss':
      onMiss(msg);
      return;
    case 'item':
      if (turretFx[msg.t] && msg.item in turretFx[msg.t]) turretFx[msg.t][msg.item] = true;
      return;
    case 'you':
      onYou(msg);
      return;
    case 'state':
      onState(msg);
      return;
  }
}

function onState(msg) {
  net.offset = msg.now - Date.now();
  const prev = { phase: quiz.phase, index: quiz.index };
  Object.assign(quiz, { phase: msg.phase, index: msg.index, total: msg.total, time: msg.time, endsAt: msg.endsAt, players: msg.players });
  document.body.dataset.phase = msg.phase;
  quiz.hall = Math.max(quiz.hall, msg.hall ?? 0);
  boss.max = Math.max(1, quiz.players) * quiz.total * BOSS_HP_PER_QUESTION;

  const changed = prev.phase !== msg.phase || prev.index !== msg.index;
  if (changed) { stick.id = null; cancelWalk(); }
  if (changed && (msg.phase === 'lobby' || msg.phase === 'countdown')) resetRound();
  if (!quiz.bossSynced) {
    // Joined mid-game: show the boss with the hall's damage so far.
    boss.hp = Math.max(0, boss.max - quiz.hall);
    Object.assign(boss, { dead: boss.hp === 0, deadT: boss.hp === 0 ? 9 : 0 });
    quiz.bossSynced = true;
  }
  if (changed && msg.phase === 'question') startQuestion(msg);
  if (changed && msg.phase === 'reveal') revealQuestion(msg);
  if (changed && msg.phase === 'end') {
    hideAnswers();
    renderEnd();
  }
  if (msg.phase !== 'end') $('end').hidden = true;
  renderCard();
  renderItems();
  layout();
}

// ---- Quiz flow -----------------------------------------------------------------

function resetRound() {
  answerRequest = null;
  quiz.submitting = false;
  Object.assign(boss, { hp: boss.max, dead: false, deadT: 0, bubble: null, anim: 'idle', animT: 0, flightT: 0 });
  shots = [];
  bolts = [];
  turretFx = turretFx.map(newTurretFx);
  hideAnswers();
  $('answers').dataset.question = '';
  Object.assign(inv, { removed: null, removedIndex: -1 });
  Object.assign(quiz, { hall: 0, question: null, answer: null, picked: null, result: null, answered: new Set(), bossSynced: true });
}

function startQuestion(msg) {
  answerRequest = null;
  quiz.submitting = false;
  Object.assign(quiz, { question: msg.question, answer: null, result: null, picked: quiz.answered.has(msg.index) ? -1 : null });
  if (quiz.picked === null) showAnswers(msg.question);
  else hideAnswers();
  renderCard();
  layout();
  $('questionScroll').scrollTop = 0;
  if (!boss.dead) boss.bubble = { text: 'Trả lời đi nào!', life: 1.6 };
}

function revealQuestion(msg) {
  hideAnswers();
  quiz.question = msg.question;
  quiz.answer = msg.answer;
  if (quiz.picked === null) {
    const blocked = quiz.shieldedIndex === msg.index;
    quiz.result = { timeout: true, blocked };
    banner(blocked ? 'Hết giờ, khiên đã đỡ!' : 'Hết giờ!', blocked ? '#5aaaff' : '#ff866b');
  }
}

async function lock(i, retry = false) {
  if (quiz.phase !== 'question' || (quiz.picked !== null && !retry) || quiz.submitting || !quiz.question || i < 0 || i >= quiz.question.options.length) return;
  if (retry && (quiz.picked !== i || !quiz.result?.retryable)) return;
  if (inv.removedIndex === quiz.index && inv.removed?.includes(i)) return;
  const index = quiz.index;
  const request = { index };
  answerRequest = request;
  quiz.picked = i;
  quiz.result = null;
  quiz.submitting = true;
  quiz.answered.add(index);
  hideAnswers();
  renderCard();
  renderItems();
  try {
    const r = await post('/api/answer', { pid: net.pid, index, choice: i });
    if (answerRequest !== request || index !== quiz.index || quiz.phase !== 'question') return;
    if (!r.ok) {
      // A lost response may still have been accepted. The server never scores twice.
      quiz.result = r.status === 409 && r.data.error === 'Bạn đã trả lời câu này rồi'
        ? { recorded: true }
        : { error: r.data.error || 'Không gửi được đáp án', retryable: r.status >= 500 };
    } else {
      quiz.result = r.data;
      quiz.answer = r.data.answer;
      quiz.you = { ...(quiz.you ?? {}), score: r.data.score };
      Object.assign(inv, { items: r.data.items, armed: r.data.armed });
      renderScore();
      renderItems();
      // The shot / hit itself arrives for everyone as a 'fire' event from the server.
      if (r.data.correct) {
        const extra = [r.data.double && 'x2', r.data.streak > 1 && `Combo x${r.data.streak}`].filter(Boolean).join(' · ');
        banner(`+${r.data.points}${extra ? ` · ${extra}` : ''}`, '#7dbcff');
      } else if (r.data.blocked) {
        banner('Khiên đã đỡ!', '#5aaaff');
      } else {
        banner('Sai rồi!', '#ff866b');
        if (!boss.dead) boss.bubble = { text: 'Sai rồi! Sợ chưa?', life: 2.2 };
      }
    }
  } catch {
    if (answerRequest === request && index === quiz.index && quiz.phase === 'question') quiz.result = { error: 'Chưa nhận được xác nhận. Gửi lại lựa chọn của bạn.', retryable: true };
  } finally {
    if (answerRequest === request) {
      answerRequest = null;
      quiz.submitting = false;
    }
  }
  renderCard();
}

async function useItem(item) {
  if (inv.busy || !PLAY_PHASES.includes(quiz.phase)) return;
  inv.busy = true;
  renderItems();
  try {
    const r = await post('/api/item', { pid: net.pid, item });
    if (!r.ok) {
      banner(r.data.error || 'Không dùng được vật phẩm', '#ffc1b3');
      return;
    }
    Object.assign(inv, { items: r.data.items, armed: r.data.armed });
    if (item === 'hint') {
      Object.assign(inv, { removed: r.data.removed, removedIndex: quiz.index });
      applyHint();
      banner('Buddy loại 2 đáp án sai!', '#ff481f');
    } else {
      banner(item === 'shield' ? 'Khiên đã bật!' : 'Súng giọt tự tin: câu đúng tới x2!', item === 'shield' ? '#5aaaff' : '#ff481f');
    }
  } catch {
    banner('Mất kết nối, thử lại nhé', '#ffc1b3');
  } finally {
    inv.busy = false;
    renderItems();
  }
}

async function postSeat(action, turret) {
  $('seatBtn').disabled = true;
  try {
    const r = await post('/api/turret', { pid: net.pid, action, turret });
    seats.error = r.ok ? '' : r.data.error || 'Không vào được ụ';
  } catch {
    seats.error = 'Mất kết nối, thử lại nhé';
  }
  $('seatBtn').disabled = false;
  $('seat').dataset.sig = '';
}

function joinTurret(i) {
  pendingTurret = -1;
  if (quiz.phase !== 'lobby' || !net.pid || seats.byTurret.has(i)) return;
  postSeat('join', i);
}

// Dock button: leave, sit down where you stand, or set off toward the tapped ring.
function seatAction() {
  if (quiz.phase !== 'lobby' || !net.pid || !player) return;
  if (seats.mine >= 0) {
    cancelWalk();
    postSeat('leave', -1);
    return;
  }
  if (walk.active && walk.turret >= 0) return cancelWalk();
  const target = pendingTurret >= 0 ? pendingTurret : nearestTurret();
  if (target < 0 || seats.byTurret.has(target)) return;
  if (nearestTurret() === target) return joinTurret(target);
  Object.assign(walk, { ...approachPoint(target), turret: target, active: true, t: 0 });
  pendingTurret = target;
  $('seat').dataset.sig = '';
}

// ---- Simulation ----------------------------------------------------------------

function burst(x, y, n, color, speed = 40) {
  const u = wu();
  for (let i = 0; i < n && particles.length < 700; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed) * u;
    const life = rand(0.25, 0.55);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Math.random() < 0.3 ? 2 : 1 });
  }
}

function trail(x, y, colors) {
  if (particles.length >= 700) return;
  const u = wu();
  particles.push({ x, y, vx: rand(-12, 12) * u, vy: rand(-12, 12) * u, life: 0.35, max: 0.35, color: colors[Math.random() < 0.5 ? 0 : 1], size: 2 });
}

function fireShot(i, pending) {
  if (!pending) return;
  playShotSfx({ own: i === seats.mine });
  const m = muzzlePos(i);
  for (let k = 0; k < pending.count; k++) {
    shots.push({ x: m.x, y: m.y, dmg: Math.round(pending.dmg / pending.count), hall: pending.hall, life: 5, delay: k * 0.2, own: i === seats.mine, soundPending: k > 0 });
  }
  burst(m.x, m.y, 14 * pending.count, '#8fc5ff', 70);
}

function spawnBolt(i, blocked) {
  if (bolts.length >= MAX_BOLTS || !turretFx[i]) return;
  playShotSfx({ kind: 'boss' });
  bossPlay('attack');
  const from = bossTarget();
  bolts.push({ x: from.x + rand(-20, 20), y: from.y, turret: i, blocked, life: 5 });
}

function updateTurrets(dt) {
  const ease = 1 - Math.exp(-dt * 12);
  turretFx.forEach((fx, i) => {
    fx.t += dt;
    fx.hit = Math.max(0, fx.hit - dt);
    fx.block = Math.max(0, fx.block - dt);
    fx.hold = Math.max(0, fx.hold - dt);
    if (!turretSheet) return;
    // Swing the barrel toward the boss while charging and firing, hold a moment, then stand upright.
    const target = fx.name !== 'idle' || fx.hold > 0 ? aimAngle(i) : 0;
    fx.angle += (target - fx.angle) * ease;
    if (fx.name === 'idle') return;
    const anim = turretSheet.anims[fx.name];
    if (fx.t < anim.frames.length / anim.fps) return;
    if (fx.name === 'aim') {
      Object.assign(fx, { name: 'fire', t: 0 });
      fireShot(i, fx.pending);
      fx.pending = null;
    } else {
      Object.assign(fx, { name: 'idle', t: 0, hold: 0.9 });
    }
  });
}

// Retarget every frame: the figure-eight flight never changes a correct answer into a miss.
function updateShots(dt) {
  const target = bossTarget();
  const speed = 340 * wu();
  for (const s of shots) {
    if (s.delay > 0) {
      s.delay -= dt;
      if (s.delay > 0) continue;
    }
    if (s.soundPending) { playShotSfx({ own: s.own }); s.soundPending = false; }
    const dx = target.x - s.x, dy = target.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, speed * dt);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    s.life -= dt;
    trail(s.x, s.y, ['#8fc5ff', '#ffffff']);
    if (d > step + 6 * wu() && s.life > 0) continue;
    // Resolve at the current boss position, including the lifetime fallback on oversized views.
    s.x = target.x;
    s.y = target.y;
    s.life = 0;
    burst(s.x, s.y, 20, '#8fc5ff', 90);
    texts.push({ x: s.x + rand(-30, 30), y: s.y - 40, text: `-${s.dmg}`, life: 0.9, color: '#ff7e61' });
    if (boss.dead) continue;
    boss.hp = Math.min(boss.hp, Math.max(0, boss.max - s.hall));
    bossPlay('hurt');
    if (boss.hp === 0) {
      Object.assign(boss, { dead: true, deadT: 0, bubble: { text: 'Không thểeee…', life: 1.4 } });
      banner('Quái Vật Dễ Sợ gục ngã!', '#ff481f');
      burst(s.x, s.y, 60, '#ff481f', 120);
    } else if (!boss.bubble) {
      boss.bubble = { text: 'Áaa!', life: 0.7 };
    }
  }
  shots = shots.filter(s => s.life > 0);
}

// Boss bolts home in on their turret: a wrong answer always lands, unless a shield blocks it.
function updateBolts(dt) {
  const speed = 300 * wu();
  for (const b of bolts) {
    const c = turretCentre(b.turret);
    const dx = c.x - b.x, dy = c.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const stopAt = b.blocked ? turretBox(b.turret).w * 0.5 : 6 * wu();
    const step = Math.min(Math.max(0, d - stopAt + 1), speed * dt);
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
    b.life -= dt;
    trail(b.x, b.y, ['#ff481f', '#ff9f8a']);
    if (d > stopAt) continue;
    b.life = 0;
    const fx = turretFx[b.turret];
    const mine = b.turret === seats.mine;
    if (b.blocked) {
      Object.assign(fx, { shield: false, block: 0.6 });
      burst(b.x, b.y, 26, '#5aaaff', 100);
      texts.push({ x: c.x, y: c.y - turretBox(b.turret).h * 0.5, text: 'Chặn!', life: 0.9, color: '#8fc5ff' });
      if (mine) banner('Khiên Research Lab đã đỡ!', '#5aaaff');
      continue;
    }
    fx.hit = 0.5;
    burst(b.x, b.y, 24, '#ff481f', 90);
    if (!mine) continue;
    player.hurtTimer = 0.45;
    redFlash = 0.35;
    banner('Ụ của bạn bị bắn!', '#ff866b');
  }
  bolts = bolts.filter(b => b.life > 0);
}

// Other foxes glide to their latest position; seated ones are shown by their turret instead.
function updateOthers(dt) {
  const k = 1 - Math.exp(-dt * 10);
  for (const o of others.values()) {
    const seat = seats.byPlayer.get(o.n);
    o.seated = seat !== undefined;
    let target = null;
    if (o.seated) target = slotPos(seat);
    else if (o.wx >= 0) target = { x: o.wx, y: o.wy };
    if (!target) continue;
    if (o.x === null || o.seated) Object.assign(o, target);
    const dx = target.x - o.x, dy = target.y - o.y;
    o.x += dx * k;
    o.y += dy * k;
    o.moving = Math.hypot(dx, dy) > 3;
    o.t += dt * 1000;
  }
}

function updatePlayer(dt) {
  if (seats.mine < 0) {
    let axis = moveAxis();
    if (axis.x || axis.y) cancelWalk();
    else if (walk.active) axis = walkAxis(dt);
    player.update(dt, axis, false, floorBounds);
    return;
  }
  Object.assign(player, slotPos(seats.mine), { vx: 0, vy: 0 });
  player.hurtTimer = Math.max(0, player.hurtTimer - dt);
}

// Keyboard shortcuts: 1–4 answer, E joins/leaves the nearby turret.
function handleKeys() {
  if (quiz.phase === 'question') {
    for (let i = 0; i < 4; i++) if (Input.hit(`Digit${i + 1}`) || Input.hit(`Numpad${i + 1}`)) lock(i);
  }
  if (quiz.phase === 'lobby' && Input.hit('KeyE')) seatAction();
}

function update(dt) {
  if (!player) return;
  if (!boss.dead && quiz.phase !== 'end' && !REDUCED_MOTION.matches) {
    boss.flightT = (boss.flightT + dt) % ARENA.boss.flight.period;
  }
  updatePlayer(dt);
  handleKeys();
  updateCamera(dt);
  updateTurrets(dt);
  updateShots(dt);
  updateBolts(dt);
  updateOthers(dt);
  sendPosition(dt);
  updateSeatPrompt();

  const damp = Math.exp(-dt * 4);
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp; p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  const rise = 16 * wu();
  for (const t of texts) { t.y -= rise * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);

  boss.animT += dt;
  if (bossSheet && boss.anim !== 'idle') {
    const a = bossSheet.anims[boss.anim];
    if (boss.animT >= a.frames.length / a.fps) bossPlay('idle');
  }
  if (boss.dead) boss.deadT += dt;
  if (boss.bubble && (boss.bubble.life -= dt) <= 0) boss.bubble = null;
  redFlash = Math.max(0, redFlash - dt);

  const left = Math.max(0, quiz.endsAt - (Date.now() + net.offset)) / 1000;
  $('timerFill').style.width = quiz.phase === 'question' ? `${clamp(left / quiz.time, 0, 1) * 100}%` : '0%';
  const seconds = Math.ceil(left);
  if ($('timerText').dataset.seconds !== String(seconds)) {
    $('timerText').dataset.seconds = String(seconds);
    $('timerText').textContent = `${seconds}s`;
    $('timer').querySelector('[role="progressbar"]').setAttribute('aria-valuenow', seconds);
  }
  $('timer').classList.toggle('urgent', quiz.phase === 'question' && seconds <= 5);
  if (quiz.phase === 'countdown') {
    const n = Math.ceil(left);
    if (n !== lastCount && n > 0) banner(String(n), '#ff7e61');
    lastCount = n;
  }
}

// ---- Rendering: world pass (map px, inside the arena transform) ----------------

function ellipse(x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoss(t) {
  if (!bossSheet) return;
  const B = bossPose();
  const { frames, pivot, headroom } = bossSheet;
  const k = B.height / headroom;
  if (!(boss.dead && boss.deadT > 1.4)) {
    const f = frames[bossFrame()];
    if (boss.dead) ctx.globalAlpha = Math.max(0, 1 - boss.deadT / 1.4) * (Math.floor(t * 20) % 2 ? 1 : 0.4);
    ellipse(B.x, B.feetY + 9, B.height * 0.31, B.height * 0.065, 'rgba(7, 13, 26, 0.32)');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bossSheet.image, f.x, f.y, f.w, f.h,
      B.x - pivot.x * k, B.feetY - pivot.y * k, f.w * k, f.h * k);
    ctx.globalAlpha = 1;
  }
  if (boss.dead) {
    // Leave dark smoke at the final flight position after the boss falls.
    const grow = Math.min(1, boss.deadT / 1.2);
    const cy = B.feetY - B.height * 0.5;
    const puffs = [[0, 0, 0.42], [-0.32, 0.12, 0.3], [0.32, 0.1, 0.3], [-0.18, -0.3, 0.28], [0.2, -0.32, 0.28], [0, 0.35, 0.3]];
    for (const [ox, oy, r] of puffs) {
      const wobble = Math.sin(t * 2 + ox * 9) * 0.03;
      ellipse(B.x + ox * B.height, cy + oy * B.height, (r + wobble) * B.height * grow, (r + wobble) * B.height * grow, 'rgba(22, 16, 30, 0.94)');
    }
  }
}

// Cache the soft lighting once. Its footprint extends beyond the opaque cannon base.
const turretAuras = new Map();
function auraTexture(mine) {
  const key = mine ? '255, 93, 56' : '28, 102, 187';
  if (turretAuras.has(key)) return turretAuras.get(key);
  const light = document.createElement('canvas');
  light.width = 160;
  light.height = 192;
  const g = light.getContext('2d');
  g.save();
  g.translate(80, 144);
  g.scale(1, 0.43);
  const floor = g.createRadialGradient(0, 0, 18, 0, 0, 79);
  floor.addColorStop(0, `rgba(${key}, 0.9)`);
  floor.addColorStop(0.48, `rgba(${key}, 1)`);
  floor.addColorStop(1, `rgba(${key}, 0)`);
  g.fillStyle = floor;
  g.fillRect(-80, -80, 160, 160);
  g.restore();
  const rise = g.createLinearGradient(0, 20, 0, 152);
  rise.addColorStop(0, `rgba(${key}, 0)`);
  rise.addColorStop(0.35, `rgba(${key}, 0.35)`);
  rise.addColorStop(0.7, `rgba(${key}, 0.85)`);
  rise.addColorStop(1, `rgba(${key}, 0.9)`);
  g.fillStyle = rise;
  g.beginPath();
  g.moveTo(20, 20);
  g.lineTo(140, 20);
  g.lineTo(149, 144);
  g.quadraticCurveTo(80, 180, 11, 144);
  g.closePath();
  g.fill();
  turretAuras.set(key, light);
  return light;
}

function turretAura(i, t) {
  if (quiz.phase !== 'lobby') return null;
  const mine = i === seats.mine;
  if (seats.byTurret.has(i) && !mine) return null;
  const selected = !mine && seats.mine < 0 && i === (pendingTurret >= 0 ? pendingTurret : walk.turret >= 0 ? walk.turret : seats.near);
  const pulse = REDUCED_MOTION.matches ? 0.5 : 0.5 + Math.sin(t * 2.2 + i * 2.399963) * 0.5;
  return { mine, selected, pulse, alpha: mine ? 0.55 + pulse * 0.12 : selected ? 0.5 + pulse * 0.15 : 0.2 + pulse * 0.2 };
}

function drawTurretAura(i, t, light, foreground = false) {
  if (!light) return;
  const p = slotPos(i), w = ringWidthAt(p.y);
  const { mine, selected, pulse, alpha } = light;
  const rgb = mine ? '255, 93, 56' : '28, 102, 187';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  if (!foreground) {
    const spread = 1.04 + pulse * 0.035 + (selected ? 0.05 : 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(auraTexture(mine), p.x - w * 0.86 * spread, p.y - w * 1.7, w * 1.72 * spread, w * 2.27);
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.lineWidth = w * 0.12;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + w * 0.04, w * 0.62, w * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = mine ? '#FFC29A' : '#87CDFF';
    ctx.lineWidth = w * 0.035;
    ctx.stroke();
  } else {
    // The front rim and a few rising motes remain visible over the sprite.
    ctx.strokeStyle = mine ? '#FFC29A' : '#87CDFF';
    ctx.lineWidth = w * (selected ? 0.045 : 0.032);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + w * 0.04, w * 0.62, w * 0.3, 0, 0.08, Math.PI - 0.08);
    ctx.stroke();
    for (let j = 0; j < 4; j++) {
      const rise = REDUCED_MOTION.matches ? (j + 0.5) / 4 : (t * 0.32 + i * 0.618 + j * 0.25) % 1;
      const side = j % 2 ? 1 : -1;
      const x = p.x + side * w * (0.53 + Math.sin(i + j * 2.4 + rise * 3) * 0.08);
      const y = p.y - rise * w * 0.95;
      const size = w * 0.045;
      ctx.globalAlpha = alpha * Math.sin(rise * Math.PI);
      ctx.fillStyle = mine ? '#FFD7B0' : '#B7E6FF';
      ctx.fillRect(x - size / 2, y, size, size * 1.6);
    }
  }
  ctx.restore();
}

function drawTurret(i, t, labels) {
  const p = slotPos(i);
  const box = turretBox(i);
  const ringW = ringWidthAt(p.y);
  const fx = turretFx[i] ?? newTurretFx();
  const owner = seats.byTurret.get(i);
  const mine = i === seats.mine;
  const aura = turretAura(i, t);
  drawTurretAura(i, t, aura);
  if (fx.boost) {
    // Armed boost: golden glow and orbiting sparks.
    ellipse(p.x, p.y, ringW * (0.66 + Math.sin(t * 6) * 0.03), ringW * 0.32, 'rgba(255, 138, 31, 0.35)');
    ctx.fillStyle = '#ff481f';
    const s = 3 * wu();
    for (let k = 0; k < 4; k++) {
      const a = t * 3 + (k * Math.PI) / 2;
      ctx.fillRect(p.x + Math.cos(a) * box.w * 0.45 - s / 2, box.y + box.h * 0.45 + Math.sin(a) * box.h * 0.3 - s / 2, s, s);
    }
  }
  // Nobody seated: the empty-chair art. Seated: the fox at the controls.
  const sheet = owner ? turretSheet : turretEmptySheet ?? turretSheet;
  const parts = owner ? turretParts : turretEmptyParts ?? turretParts;
  if (sheet) {
    const { anims, frames } = sheet;
    const anim = anims[fx.name];
    const k = fx.name === 'idle'
      ? Math.floor(t * anim.fps + i * 0.7) % anim.frames.length
      : Math.min(anim.frames.length - 1, Math.floor(fx.t * anim.fps));
    const f = frames[anim.frames[k]];
    const hurt = fx.hit > 0;
    const x0 = box.x + (hurt ? rand(-2, 2) * wu() : 0);
    ctx.imageSmoothingEnabled = true;
    if (parts) {
      const { base, part } = parts;
      ctx.drawImage(hurt ? base.hurtImage : base.image, f.x, f.y, f.w, f.h, x0, box.y, box.w, box.h);
      // Barrel (and its water spray) rotates around the hinge on top of the tank.
      const hx = SPRITES.turret.barrel.hingeX * box.w;
      const hy = SPRITES.turret.barrel.cutY * box.h;
      ctx.save();
      ctx.translate(x0 + hx, box.y + hy);
      ctx.rotate(fx.angle);
      ctx.drawImage(hurt ? part.hurtImage : part.image, f.x, f.y, f.w, f.h, -hx, -hy, box.w, box.h);
      ctx.restore();
    } else {
      ctx.drawImage(hurt ? sheet.hurtImage : sheet.image, f.x, f.y, f.w, f.h, x0, box.y, box.w, box.h);
    }
  } else {
    ellipse(p.x, p.y - ringW * 0.15, ringW * 0.45, ringW * 0.25, fx.hit > 0 ? '#ff6745' : '#e85b3b');
  }
  drawTurretAura(i, t, aura, true);
  if (fx.shield || fx.block > 0) {
    // Armed shield: pulsing blue dome; flashes brighter when it absorbs a bolt.
    ctx.strokeStyle = fx.block > 0 ? `rgba(200, 245, 255, ${0.5 + fx.block})` : `rgba(90, 209, 255, ${0.55 + Math.sin(t * 5) * 0.2})`;
    ctx.lineWidth = (fx.block > 0 ? 3 : 2) * wu();
    ctx.beginPath();
    ctx.ellipse(p.x, box.y + box.h * 0.5, box.w * (0.55 + fx.block * 0.1), box.h * (0.55 + fx.block * 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const nameY = box.y + box.h * 0.17 - 3 * wu();
  if (owner) {
    labels.push({ x: p.x, y: nameY, text: owner.name, tone: mine ? 'mine' : 'other', maxWidth: 78 * arena.s - toLogical(4) });
  } else if (aura?.selected) {
    labels.push({ x: p.x, y: nameY, text: `Ụ ${i + 1} · Trống`, tone: 'free' });
  }
}

function drawFox(frameIndex, image, x, y, bob, alpha) {
  const f = hero.frames[frameIndex];
  const k = foxScaleAt(y);
  ellipse(x, y, 12 * k, 3.5 * k, 'rgba(0, 0, 0, 0.35)');
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, f.x, f.y, f.w, f.h, x - hero.pivot.x * k, y - (hero.pivot.y - bob) * k, f.w * k, f.h * k);
  ctx.globalAlpha = 1;
  return y - hero.headroom * k;   // top of the head, for the name tag
}

function drawOther(o, labels) {
  const views = hero.views;
  const frameIndex = views ? hero.anims[views[o.v] ?? views[0]].frames[0] : hero.anims.idle.frames[0];
  const bob = o.moving ? [0, -1, -2, -1][Math.floor(o.t / 80) % 4] : 0;
  const top = drawFox(frameIndex, hero.image, o.x, o.y, bob, 0.92);
  labels.push({ x: o.x, y: top - 3 * wu(), text: o.name, tone: 'other' });
}

function drawPlayer(labels) {
  const hurt = player.anim.name === 'hurt' && hero.hurtImage;
  const top = drawFox(player.anim.frameIndex, hurt ? hero.hurtImage : hero.image, player.x, player.y, player.anim.bob ?? 0, 1);
  labels.push({ x: player.x, y: top - 3 * wu(), text: net.name || 'Buddy', tone: 'mine' });
}

// ---- Rendering: screen pass (logical px) ---------------------------------------

function pixelDot(x, y, r, color) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
  ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
}

// Pixel-system shapes on canvas: stepped corners (s px) instead of rounded ones.
function stepRect(x, y, w, h, s) {
  ctx.fillRect(x + s, y, w - 2 * s, h);
  ctx.fillRect(x, y + s, w, h - 2 * s);
}

// Floating text with a narrow dark outline stays legible without a nameplate.
function drawName(lines, x, y, tone, size) {
  ctx.save();
  ctx.font = `800 ${size}px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = toLogical(2.5);
  ctx.strokeStyle = '#07131F';
  ctx.fillStyle = NAME_COLORS[tone] ?? NAME_COLORS.other;
  for (let i = 0; i < lines.length; i++) {
    const lineY = y - (lines.length - 1 - i) * size * 1.12;
    ctx.strokeText(lines[i], x, lineY);
    ctx.fillText(lines[i], x, lineY);
  }
  ctx.restore();
}

function nameLines(text, maxWidth, wrap) {
  const lines = [''];
  for (const word of text.split(/\s+/)) {
    const i = lines.length - 1;
    const next = lines[i] ? `${lines[i]} ${word}` : word;
    if (wrap && i === 0 && lines[i] && ctx.measureText(next).width > maxWidth) lines.push(word);
    else lines[i] = next;
  }
  return lines.map(line => {
    if (ctx.measureText(line).width <= maxWidth) return line;
    const chars = Array.from(line);
    while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
    return `${chars.join('')}…`;
  });
}

// Numbers (damage, score) in the pixel face; it has no Vietnamese glyphs, so words use drawText.
function drawPixelText(text, x, y, color, size = 8) {
  ctx.font = `${size}px "Press Start 2P", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawText(text, x, y, color, size = 8) {
  ctx.font = `800 ${size}px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Speech bubble as a pixel card: ink border, stepped corners, hard shadow and a stepped tail.
function drawBubble(text, x, y) {
  ctx.font = '800 9px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 14;
  const h = 17;
  const bx = clamp(Math.round(x), 4, view.w - w - 6);
  const by = Math.round(y - h);
  ctx.fillStyle = SHADOW;
  stepRect(bx + 3, by + 3, w, h, 4);
  ctx.fillStyle = INK;
  stepRect(bx, by, w, h, 4);
  ctx.fillRect(bx + 6, by + h, 6, 2);
  ctx.fillRect(bx + 6, by + h + 2, 4, 2);
  ctx.fillStyle = '#FFFFFF';
  stepRect(bx + 2, by + 2, w - 4, h - 4, 2);
  ctx.fillRect(bx + 8, by + h - 2, 2, 2);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 7, by + h / 2 + 0.5);
}

function drawBossUi() {
  const percent = Math.round(clamp(boss.hp / boss.max, 0, 1) * 100);
  if ($('bossHealth').getAttribute('aria-valuenow') !== String(percent)) {
    $('bossHealth').setAttribute('aria-valuenow', percent);
    $('bossHealthFill').style.width = `${percent}%`;
    $('bossHealthTrail').style.width = `${percent}%`;
    $('bossPercent').textContent = `${percent}%`;
  }
  if (boss.bubble) {
    const B = bossPose();
    const at = toScreen(B.x + B.height * .35, B.feetY - B.height * .7);
    drawBubble(boss.bubble.text, at.x, at.y);
  }
}

function render(t) {
  if (!player) return;
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // The stage is continuous; the outer page and HUD never become part of the map.
  ctx.clearRect(0, 0, view.w, view.h);

  // World pass: map, boss, turrets and foxes in map px.
  const labels = [];
  const vw = arena.w / arena.s, vh = arena.h / arena.s;
  const visible = (x, y, m) => x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m;
  ctx.save();
  ctx.beginPath();
  ctx.rect(arena.x, arena.y, arena.w, arena.h);
  ctx.clip();
  ctx.translate(arena.x - cam.x * arena.s, arena.y - cam.y * arena.s);
  ctx.scale(arena.s, arena.s);
  if (mapImage) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mapImage, 0, 0, ARENA.width, ARENA.height);
  }
  drawArenaAmbience(ctx, t, { reducedMotion: REDUCED_MOTION.matches });
  drawBoss(t);

  const items = [];
  for (let i = 0; i < seats.count; i++) {
    const p = slotPos(i);
    if (visible(p.x, p.y, 200)) items.push({ y: p.y, draw: () => drawTurret(i, t, labels) });
  }
  // With a full room, draw the nearest walking foxes with overhead names.
  const nearby = [...others.values()]
    .filter(o => !o.seated && o.x !== null && visible(o.x, o.y, 120))
    .map(o => ({ o, d: Math.hypot(o.x - player.x, o.y - player.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_OTHERS_DRAWN);
  for (const { o } of nearby) items.push({ y: o.y, draw: () => drawOther(o, labels) });
  if (seats.mine < 0 && $('join').hidden) items.push({ y: player.y, draw: () => drawPlayer(labels) });
  items.sort((a, b) => a.y - b.y).forEach(item => item.draw());
  ctx.restore();

  // Screen pass: UI text, projectiles and particles at a constant on-screen size.
  ctx.imageSmoothingEnabled = false;
  drawBossUi();
  const occupiedLabels = [];
  // Names keep a readable screen size; crowded walking names yield to our own.
  labels.sort((a, b) => Number(b.tone === 'mine') - Number(a.tone === 'mine'));
  for (const l of labels) {
    const s = toScreen(l.x, l.y);
    const size = toLogical(12);
    ctx.font = `800 ${size}px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif`;
    const maxWidth = Math.max(size, l.maxWidth ?? toLogical(145));
    const lines = nameLines(l.text, maxWidth, l.maxWidth !== undefined);
    const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + toLogical(4);
    const height = size * 1.12 * lines.length + toLogical(3);
    s.x = clamp(s.x, arena.x + width / 2, arena.x + arena.w - width / 2);
    s.y = clamp(s.y, arena.y + height, arena.y + arena.h);
    const rect = { x: s.x - width / 2, y: s.y - height, w: width, h: height };
    if (occupiedLabels.some(r => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y)) continue;
    occupiedLabels.push(rect);
    drawName(lines, s.x, s.y, l.tone, size);
  }
  const orbs = [
    ...shots.filter(s => !(s.delay > 0)).map(s => [s, '#2f94ff', '#8fc5ff', '#ffffff']),
    ...bolts.map(b => [b, '#c22d0c', '#ff481f', '#ffbeb0']),
  ];
  for (const [o, glow, body, core] of orbs) {
    const s = toScreen(o.x, o.y);
    ctx.globalAlpha = 0.4;
    pixelDot(s.x, s.y, 6, glow);
    ctx.globalAlpha = 1;
    pixelDot(s.x, s.y, 3, body);
    pixelDot(s.x, s.y, 1, core);
  }
  for (const p of particles) {
    const s = toScreen(p.x, p.y);
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const tx of texts) {
    const s = toScreen(tx.x, tx.y);
    if (/^[-+\d\s]+$/.test(tx.text)) drawPixelText(tx.text, s.x, s.y, tx.color, 9);
    else drawText(tx.text, s.x, s.y, tx.color, 11);
  }

  if (stick.id !== null && seats.mine < 0) {
    const sx = toLogical(stick.ox), sy = toLogical(stick.oy);
    const r = toLogical(45);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    const a = moveAxis();
    pixelDot(sx + a.x * r, sy + a.y * r, 5, 'rgba(255,255,255,0.6)');
  }
  if (redFlash > 0) {
    ctx.fillStyle = `rgba(255, 96, 32, ${redFlash})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  if (!$('join').hidden) drawJoinDuel($('joinArt'), hero, bossSheet, t, { reducedMotion: REDUCED_MOTION.matches });
}

// ---- DOM -----------------------------------------------------------------------

function banner(text, color) {
  const el = $('banner');
  el.textContent = text;
  el.dataset.tone = BANNER_TONES[color] ?? 'info';
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function showAnswers(q) {
  const box = $('answers');
  if (box.dataset.question === String(quiz.index)) {
    dock(box, false);
    return;
  }
  box.dataset.question = quiz.index;
  box.replaceChildren(...q.options.map((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ans ans-${i}`;
    btn.append(
      Object.assign(document.createElement('b'), { textContent: LETTERS[i] }),
      Object.assign(document.createElement('span'), { textContent: text }),
      Object.assign(document.createElement('i'), { className: 'answer-mark', ariaHidden: 'true' }),
    );
    btn.addEventListener('click', () => lock(i));
    return btn;
  }));
  dock(box, false);
  applyHint();
}

function hideAnswers() {
  dock($('answers'), true);
}

// Grey out the two wrong options Buddy removed for the current question.
function applyHint() {
  const active = inv.removedIndex === quiz.index && quiz.phase === 'question';
  $('answers').querySelectorAll('.ans').forEach((btn, i) => {
    const out = active && inv.removed?.includes(i);
    btn.classList.toggle('ans-out', !!out);
    btn.disabled = !!out || quiz.picked !== null || quiz.phase !== 'question';
  });
}

function renderAnswerState() {
  const known = quiz.answer !== null && quiz.answer !== undefined;
  $('answers').querySelectorAll('.ans').forEach((btn, i) => {
    const picked = quiz.picked === i;
    const correct = known && quiz.answer === i;
    const wrong = known && picked && !correct;
    btn.classList.toggle('picked', picked);
    btn.classList.toggle('correct', correct);
    btn.classList.toggle('wrong', wrong);
    btn.classList.toggle('dim', known && !picked && !correct);
    btn.setAttribute('aria-pressed', String(picked));
    btn.setAttribute('aria-label', `${LETTERS[i]}. ${quiz.question.options[i]}${picked ? '. Bạn đã chọn' : ''}${correct ? '. Đáp án đúng' : wrong ? '. Chưa đúng' : ''}`);
    btn.querySelector('.answer-mark').textContent = correct ? '✓' : wrong ? '×' : picked ? '●' : '';
  });
  applyHint();
}

function renderItems() {
  const tray = $('items');
  dock(tray, !net.pid || !PLAY_PHASES.includes(quiz.phase));
  if (tray.hidden) return;
  for (const btn of tray.querySelectorAll('.item')) {
    const item = btn.dataset.item;
    const count = inv.items[item] ?? 0;
    const armed = !!inv.armed[item];
    btn.querySelector('.count').textContent = armed ? 'ON' : count;
    btn.classList.toggle('armed', armed);
    const usable = item === 'hint'
      ? quiz.phase === 'question' && quiz.picked === null && inv.removedIndex !== quiz.index
      : !armed;
    btn.disabled = inv.busy || count <= 0 || !usable;
    btn.title = `${ITEMS[item].name}: ${ITEMS[item].effect}${armed ? ' (đang bật)' : count <= 0 ? ' (đã dùng)' : ''}`;
    btn.setAttribute('aria-label', `${btn.title}. ${armed ? 'Đang bật' : `Còn ${count} lần`}`);
  }
}

// Lobby-only prompt: join the turret you are standing next to, or leave yours.
function updateSeatPrompt() {
  const box = $('seat');
  if (quiz.phase !== 'lobby' || !net.pid || !$('join').hidden) {
    dock(box, true);
    box.dataset.sig = '';
    return;
  }
  const standing = nearestTurret();
  const walking = walk.active && walk.turret >= 0;
  // A tapped ring outranks the one underfoot: that is the one being asked about.
  const near = seats.mine >= 0 ? seats.mine : walking ? walk.turret : pendingTurret >= 0 ? pendingTurret : standing;
  if (near !== seats.near) seats.error = '';
  seats.near = near;
  const occupant = near >= 0 ? seats.byTurret.get(near) : undefined;
  const free = seats.count - seats.byTurret.size;
  const sig = [seats.mine, near, standing, walking, occupant?.n, free, seats.count, seats.error].join('|');
  if (sig === box.dataset.sig) return;
  box.dataset.sig = sig;
  dock(box, false);
  const btn = $('seatBtn');
  const cancel = $('seatCancel');
  $('seatFree').textContent = `${free}/${seats.count} ụ còn trống`;
  cancel.hidden = true;
  if (seats.mine >= 0) {
    $('seatTitle').textContent = `Bạn đang ở Ụ ${seats.mine + 1}`;
    $('seatInfo').textContent = seats.error || 'Đã sẵn sàng. Chờ MC bắt đầu!';
    Object.assign(btn, { hidden: false, disabled: false, textContent: 'Rời ụ' });
    btn.classList.add('leave');
  } else if (walking) {
    $('seatTitle').textContent = `Đang tới Ụ ${near + 1}`;
    $('seatInfo').textContent = 'Buddy đang chạy tới ụ súng…';
    Object.assign(btn, { hidden: false, disabled: false, textContent: 'Huỷ' });
    btn.classList.add('leave');
  } else if (near >= 0) {
    const here = standing === near;
    $('seatTitle').textContent = `Ụ ${near + 1}`;
    $('seatInfo').textContent = seats.error
      || (occupant ? `${occupant.name} đã chọn ụ này`
        : here ? 'Ụ đang trống, sẵn sàng chiến đấu' : 'Vào ụ này? Buddy sẽ chạy tới.');
    Object.assign(btn, { hidden: false, disabled: !!occupant, textContent: here ? 'Tham gia' : 'Vào ụ này' });
    btn.classList.remove('leave');
    cancel.hidden = here && !occupant;
  } else {
    $('seatTitle').textContent = free > 0 ? 'Chọn vị trí của bạn' : 'Đã hết ụ súng';
    $('seatInfo').textContent = seats.error
      || (free > 0 ? (TOUCH ? 'Chạm vào một ụ đang sáng để vào.' : 'Bấm vào một ụ đang sáng để vào.')
        : 'Bạn vẫn trả lời và có điểm bình thường.');
    btn.hidden = true;
  }
}

function renderScore() {
  const you = quiz.you;
  const seat = seats.mine >= 0 ? ` · Ụ ${seats.mine + 1}` : '';
  $('score').textContent = `${you?.score ?? 0} điểm${you?.rank ? ` · #${you.rank}` : ''}${seat}`;
  const score = you?.score ?? 0;
  const scoreEl = $('hudScore');
  if (scoreEl.dataset.value !== String(score)) {
    const increased = score > Number(scoreEl.dataset.value || 0);
    scoreEl.dataset.value = score;
    scoreEl.textContent = `${score.toLocaleString('vi-VN')} điểm`;
    if (increased && !REDUCED_MOTION.matches) {
      scoreEl.classList.remove('score-bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('score-bump');
    }
  }
  $('hudRank').hidden = !you?.rank;
  $('hudRank').textContent = you?.rank ? `#${you.rank}` : '';
  $('hudRank').setAttribute('aria-label', `Hạng ${you?.rank ?? 0}`);
  $('playerName').textContent = `${net.name || 'BUDDY · INFO SESSION'}${seat}`;
  $('phaseBadge').textContent = { lobby: 'Phòng chờ', countdown: 'Chuẩn bị xuất phát', question: 'Cùng nhau hạ boss', reveal: 'Kết quả lượt đấu', end: 'Hoàn thành', connecting: 'Đang kết nối' }[quiz.phase] ?? 'Đấu trường Buddy';
  $('roomCount').textContent = quiz.players ? `${quiz.players} người · ${seats.byTurret.size}/${seats.count} ụ` : '30 ụ súng';
  $('moveGuide').hidden = quiz.phase !== 'lobby' || seats.mine >= 0 || !net.pid;
  $('moveGuideText').textContent = TOUCH ? 'Chạm để đi · chạm ụ súng để vào' : 'WASD / mũi tên di chuyển · E chọn ụ';
}

function statusText() {
  const r = quiz.result;
  if (r?.recorded) return 'Đáp án đã được ghi nhận. Chờ công bố kết quả nhé.';
  if (r?.error) return `⚠ ${r.error}`;
  if (r?.timeout) return r.blocked ? '⏰ Hết giờ, nhưng khiên đã đỡ và giữ combo' : '⏰ Hết giờ! Ụ của bạn bị bắn';
  if (r?.blocked) return '🛡 Chưa đúng, nhưng khiên đã đỡ và giữ combo';
  if (r) return r.correct ? `✔ Chính xác! +${r.points} điểm${r.double ? ' (x2)' : ''}, ụ của bạn đã bắn` : '✘ Chưa đúng, đáp án đúng tô xanh';
  if (quiz.phase === 'reveal') return 'Đáp án đúng tô xanh';
  if (quiz.picked === -1) return 'Bạn đã trả lời câu này';
  if (quiz.picked !== null) return `Đã chọn ${LETTERS[quiz.picked]}, đang gửi…`;
  return TOUCH ? 'Chạm vào một đáp án bên dưới' : 'Bấm vào một đáp án (hoặc phím 1–4)';
}

function renderCard() {
  const q = quiz.question;
  const options = $('qOptions');
  $('timer').hidden = quiz.phase !== 'question' && quiz.phase !== 'countdown';
  $('timer').querySelector('[role="progressbar"]').setAttribute('aria-valuemax', quiz.time);
  $('retryAnswer').hidden = !(quiz.phase === 'question' && quiz.result?.retryable && !quiz.submitting);
  if (q && (quiz.phase === 'question' || quiz.phase === 'reveal')) {
    $('qNumber').textContent = String(quiz.index + 1).padStart(2, '0');
    $('qMeta').textContent = `Câu ${quiz.index + 1}/${quiz.total}${q.group ? ` · ${q.group}` : ''}`;
    $('qText').textContent = q.text;
    // One stable set of answer buttons in every phase and at every screen size.
    options.replaceChildren();
    $('qStatus').textContent = statusText();
    $('qStatus').dataset.tone = quiz.result?.error ? 'error' : quiz.result?.correct ? 'correct' : quiz.result && !quiz.result.recorded ? 'wrong' : '';
    showAnswers(q);
    renderAnswerState();
  } else {
    $('qNumber').textContent = quiz.phase === 'countdown' ? 'GO' : '?';
    options.replaceChildren();
    const lines = {
      connecting: ['Đang kết nối…', ''],
      lobby: [`${quiz.players} người đã vào phòng`, seats.mine >= 0 ? 'Đã sẵn sàng. Chờ MC bắt đầu nhé!' : `${TOUCH ? 'Kéo trên đấu trường' : 'Dùng WASD'} để đến vòng neon, rồi bấm Tham gia.`],
      countdown: ['Chuẩn bị…', 'Ụ súng đã khoá. 3 vật phẩm bên dưới, mỗi món dùng 1 lần.'],
      end: ['Kết thúc!', 'Xem bảng xếp hạng trên màn hình lớn.'],
    }[quiz.phase] ?? ['', ''];
    $('qMeta').textContent = lines[0];
    $('qText').textContent = lines[1];
    $('qStatus').textContent = '';
    hideAnswers();
  }
  renderScore();
}

function renderEnd() {
  const you = quiz.you;
  $('end').hidden = false;
  $('endTitle').textContent = you?.rank && you.rank <= 5 ? '🏆 Bạn lọt TOP 5!' : boss.dead ? 'Quái Vật Dễ Sợ đã gục ngã!' : 'Kết thúc!';
  $('endRank').textContent = you?.rank ? `#${you.rank} / ${you.players}` : '';
  $('endScore').textContent = you ? `${you.score} điểm · đúng ${you.correct}/${quiz.total} câu` : '';
}

// ---- Boot ----------------------------------------------------------------------

async function boot() {
  initGameAudio();
  Input.init();
  initTouch();
  $('hint').hidden = TOUCH;
  $('seatBtn').addEventListener('click', seatAction);
  $('seatCancel').addEventListener('click', cancelWalk);
  $('retryAnswer').addEventListener('click', () => lock(quiz.picked, true));
  for (const btn of $('items').querySelectorAll('.item')) btn.addEventListener('click', () => useItem(btn.dataset.item));
  resize();
  addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  $('nameInput').addEventListener('focus', resize);
  $('nameInput').addEventListener('blur', resize);
  COMPACT.addEventListener('change', () => { renderCard(); layout(); });
  const observer = new ResizeObserver(layout);
  for (const id of ['sceneStage', 'gameShell', 'card', 'gameHud', 'answers', 'items', 'seat', 'joinForm']) observer.observe($(id));

  [hero, bossSheet, turretSheet, turretEmptySheet, mapImage] = await Promise.all([
    loadSvgStrip(SPRITES.hero.url, SPRITES.hero).catch(err => { console.warn(err); return buildFoxSheet(); }),
    loadGridSheet(SPRITES.boss.url, SPRITES.boss).catch(err => { console.warn(err); return null; }),
    loadGridSheet(SPRITES.turret.url, SPRITES.turret).catch(err => { console.warn(err); return null; }),
    loadGridSheet(SPRITES.turret.emptyUrl, SPRITES.turret).catch(err => { console.warn(err); return null; }),
    Promise.resolve(createArenaBackdrop()),
  ]);
  const { barrel } = SPRITES.turret;
  const splitBarrel = sheet => (sheet && barrel
    ? splitGridSheet(sheet, [
      { x0: barrel.spray[0], x1: barrel.spray[1], y0: 0, y1: barrel.tipY },
      { x0: barrel.tube[0], x1: barrel.tube[1], y0: barrel.tipY, y1: barrel.cutY },
    ])
    : null);
  turretParts = splitBarrel(turretSheet);
  turretEmptyParts = splitBarrel(turretEmptySheet);
  paintHudPortrait($('bossAvatar'), bossSheet, { kind: 'boss' });
  paintHudPortrait($('seatAvatar'), turretEmptySheet ?? turretSheet, { kind: 'turret' });
  player = new Player(hero, ARENA.spawn.x, ARENA.spawn.y);
  Object.assign(player, { speed: 240, r: 12 });
  boss.max = boss.hp = quiz.total * BOSS_HP_PER_QUESTION;
  layout();

  $('joinForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('nameInput').value.trim();
    if (!name) {
      $('joinError').textContent = 'Nhập tên của bạn để vào phòng nhé.';
      $('nameInput').focus();
      return;
    }
    net.pid = session.get('foxquiz.pid');
    join(name);
  });
  const savedName = local.get('foxquiz.name');
  $('joinBtn').disabled = false;
  $('joinBtn').textContent = 'Vào chơi';
  $('nameInput').value = savedName ?? '';
  if (savedName && session.get('foxquiz.pid')) {
    net.pid = session.get('foxquiz.pid');
    join(savedName);
  }

  let last = performance.now();
  requestAnimationFrame(function frame(now) {
    // Schedule first so one bad frame can't freeze the game mid-event.
    requestAnimationFrame(frame);
    // rAF timestamps can be slightly older than `last`; a negative dt breaks frame indices.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    update(dt);
    render(now / 1000);
    Input.endFrame();
  });

  // Debug helpers for DevTools, e.g. quiz.step(1) simulates one second without rendering.
  window.quiz = {
    state: quiz, boss, net, lock, others, seats, cam, arena, inv, seatAction, useItem, slotPos,
    get player() { return player; },
    get turretFx() { return turretFx; },
    get shots() { return shots; },
    get bolts() { return bolts; },
    step(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds; t += dt) update(dt);
    },
  };
}

boot();

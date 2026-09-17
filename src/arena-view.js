// The projector's arena: the map, the flying boss, one turret per seated player, and the shots and
// counter-attacks the server reports. Everything is in map px (the 1920×1080 stage); the canvas
// backing store follows the stage's on-screen size so the art stays crisp on any projector.
import { loadGridSheet, splitGridSheet } from './sprites.js';
import { SPRITES, ARENA, REACTIONS } from './config.js';
import { createArenaBackdrop, drawArenaAmbience } from './arena-scene.js';
import { playShotSfx } from './audio.js';
import { drawBottle } from './bottle.js';
import { FINALE } from './finale-config.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX_AIM = (70 * Math.PI) / 180;   // how far a barrel may swivel from upright
const TURRET_BASE_FRAC = 0.735;         // platform width / frame width in the turret art
const TURRET_ANCHOR_Y = 0.8;            // frame y (fraction) that sits on the ring centre
const EMIT_INTERVAL = 0.12;             // a busy turret streams at most ~8 blasts a second
const SHOT_SPEED = 1100;
const BOLT_SPEED = 900;
const MAX_SHOTS = 320;
const MAX_BOLTS = 120;
const MAX_PARTICLES = 900;
const HP_DELAY = 0.45;                  // the health bar drops as blasts land, not when taps arrive
const SEAT_POP = 0.55;
const FRESH_SEAT = 2.5;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const INK = '#4F1E13';
const SHADOW = '#2A1A17';

let canvas, ctx;
let scale = 1;
let time = 0;
let phase = 'lobby';
let bossSheet, turretSheet, turretParts, turretEmptySheet, turretEmptyParts, mapImage;
const seats = new Map();   // turret → { n, name, since }
const newFx = () => ({ name: 'idle', t: 0, hit: 0, block: 0, hold: 0, angle: 0, shield: false, boost: false, ready: false, double: false, stunned: false, queue: 0, emitT: 0 });
const fx = ARENA.slots.map(newFx);
const boss = { hp: 1, max: 1, pending: [], anim: 'idle', animT: 0, flightT: 0, bubble: null, dead: false, deadT: 0, suffer: null };
// All positions in map px. shots: water blasts homing on the boss · bolts: boss attacks on turrets
let shots = [], bolts = [], particles = [], texts = [];
let hallQueue = 0, hallT = 0, hallSide = 0;
let finale = null;
// Icon phòng chờ, nhảy lên ngay trên ụ của người thả: { turret, icon, life, max, drift }
let stickers = [];
const reactArt = [];
const REACT_LIFE = 1.9;
const REACT_MAX_ON_STAGE = 28;
const REACT_SIZE = 62;

// ---- Geometry ------------------------------------------------------------------

const slotPos = i => ({ x: ARENA.slots[i][0], y: ARENA.slots[i][1] });
const turretFrame = () => (turretSheet ? turretSheet.frames[0] : { w: 92, h: 95 });

// Top-left of turret i's frame and its frame→map scale.
function turretBox(i) {
  const p = slotPos(i);
  const f = turretFrame();
  const k = ARENA.ringWidth / TURRET_BASE_FRAC / f.w;
  return { x: p.x - 0.5 * f.w * k, y: p.y - TURRET_ANCHOR_Y * f.h * k, w: f.w * k, h: f.h * k };
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
  const a = boss.flightT * Math.PI * 2 / B.flight.period;
  return { ...B, x: B.x + Math.sin(a) * B.flight.radiusX, feetY: B.feetY + Math.sin(a * 2) * B.flight.radiusY };
}

function bossTarget() {
  const B = bossPose();
  return { x: B.x, y: B.feetY - B.height * 0.55 };
}

// Hurt and attack rows play once, then fall back to idle. A repeat trigger lets the current pass
// finish rather than restarting it, so a stream of hits can't pin the boss on frame one.
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
  const a = fx[i].angle;
  return { x: hinge.x + dx * Math.cos(a) - dy * Math.sin(a), y: hinge.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

function turretCentre(i) {
  const b = turretBox(i);
  return { x: b.x + b.w / 2, y: b.y + b.h * 0.45 };
}

// ---- Public API ----------------------------------------------------------------

export async function initArena(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  [bossSheet, turretSheet, turretEmptySheet] = await Promise.all([
    loadGridSheet(SPRITES.boss.url, SPRITES.boss).catch(err => { console.warn(err); return null; }),
    loadGridSheet(SPRITES.turret.url, SPRITES.turret).catch(err => { console.warn(err); return null; }),
    loadGridSheet(SPRITES.turret.emptyUrl, SPRITES.turret).catch(err => { console.warn(err); return null; }),
  ]);
  mapImage = createArenaBackdrop();
  const { barrel } = SPRITES.turret;
  const splitBarrel = sheet => (sheet && barrel
    ? splitGridSheet(sheet, [
      { x0: barrel.spray[0], x1: barrel.spray[1], y0: 0, y1: barrel.tipY },
      { x0: barrel.tube[0], x1: barrel.tube[1], y0: barrel.tipY, y1: barrel.cutY },
    ])
    : null);
  turretParts = splitBarrel(turretSheet);
  turretEmptyParts = splitBarrel(turretEmptySheet);
  document.fonts?.ready.then(() => plates.clear());
  return { boss: bossSheet, turret: turretSheet, turretEmpty: turretEmptySheet };
}

// renderScale = device px per stage px.
export function resizeArena(renderScale) {
  const s = clamp(renderScale, 0.5, 2);
  if (!canvas || (canvas.width === Math.round(ARENA.width * s) && Math.abs(s - scale) < 0.01)) return;
  scale = s;
  canvas.width = Math.round(ARENA.width * s);
  canvas.height = Math.round(ARENA.height * s);
  plates.clear();
}

export function setSeats(list) {
  const next = new Map();
  for (const [i, n, name] of list) {
    if (i >= fx.length) continue;
    const old = seats.get(i);
    const same = old?.n === n;
    next.set(i, { n, name, since: same ? old.since : time });
    if (!same) burst(slotPos(i).x, slotPos(i).y - 30, 22, '#FFB38F', 110);
  }
  seats.clear();
  for (const [i, seat] of next) seats.set(i, seat);
}

export function setArenaPhase(next) {
  if (next === phase) return;
  phase = next;
  if (next !== 'unleash') { finale = null; boss.suffer = null; }
  if (next === 'lobby' || next === 'countdown' || next === 'question') {
    for (const f of fx) Object.assign(f, { ready: false, double: false, stunned: false, queue: 0 });
    hallQueue = 0;
  }
  if (next === 'lobby' || next === 'countdown') {
    shots = [];
    bolts = [];
    for (const f of fx) Object.assign(f, { shield: false, boost: false });
  }
  if (next === 'question') say('Trả lời đi nào!', 1.8);
}

// dmg/max from the server. Instant for a new game or a reconnect; otherwise the bar follows the blasts.
export function syncBoss(dmg, max, instant = false) {
  const hp = Math.max(0, max - dmg);
  if (instant || max !== boss.max) {
    Object.assign(boss, { max, hp, pending: [], dead: hp <= 0, deadT: hp <= 0 ? 9 : 0, anim: 'idle', animT: 0, suffer: null });
    if (!boss.dead) boss.bubble = null;
    return;
  }
  const last = boss.pending.at(-1)?.hp ?? boss.hp;
  if (hp < last) boss.pending.push({ at: time + HP_DELAY, hp });
}

export function queueShots(turret, taps) {
  if (fx[turret]) fx[turret].queue += taps;
  else hallQueue += taps;
}

// Start of the shooting window: light up this round's shooters and strike back at everyone who missed.
export function bossAttack({ ready = [], double = [], hit = [], blocked = [], replay = false }) {
  for (const f of fx) Object.assign(f, { ready: false, double: false, stunned: false, queue: 0 });
  for (const t of ready) if (fx[t]) fx[t].ready = true;
  for (const t of double) if (fx[t]) Object.assign(fx[t], { double: true, boost: false });
  const targets = [...hit.map(t => [t, false]), ...blocked.map(t => [t, true])].filter(([t]) => fx[t]);
  if (replay) {
    for (const [t, isBlocked] of targets) Object.assign(fx[t], isBlocked ? { shield: false } : { stunned: true });
    return;
  }
  if (!targets.length) return;
  bossPlay('attack');
  say(hit.length ? 'Sai là ăn đòn nhé!' : 'Hừm… khiên à?', 1.8);
  const from = bossTarget();
  // Shuffled and staggered, so a big miss rains down across the hall instead of row by row.
  targets.sort(() => Math.random() - 0.5).slice(0, MAX_BOLTS).forEach(([t, isBlocked], k, list) => {
    bolts.push({ x: from.x + rand(-30, 30), y: from.y, turret: t, blocked: isBlocked, delay: (k / list.length) * 1.1, life: 4 });
  });
}

export function armTurret(t, item) {
  if (fx[t] && (item === 'shield' || item === 'boost')) fx[t][item] = true;
}

// Ai thả icon thì icon đó nhảy lên ngay trên ụ mang tên người ta — MC nhìn khung xem trước là
// biết góc nào của hội trường đang nghịch. Ảnh chỉ tải lần đầu có người thả.
export function reactAt(turret, icon) {
  if (!(turret >= 0 && turret < fx.length) || !REACTIONS[icon]) return;
  if (!reactArt.length) {
    for (const r of REACTIONS) {
      const img = new Image();
      img.decoding = 'async';
      img.src = r.icon;
      reactArt.push(img);
    }
  }
  if (stickers.length >= REACT_MAX_ON_STAGE) stickers.shift();
  stickers.push({ turret, icon, life: REACT_LIFE, max: REACT_LIFE, drift: rand(-18, 18) });
}

// The whole hall fires together at the end; the boss falls as the volley lands.
export function finisherVolley() {
  for (const i of seats.keys()) fx[i].queue += 3;
  if (!seats.size) hallQueue += 24;
  boss.pending = [{ at: time + 1.3, hp: 0 }];
  say('Khoan đã…!', 1.2);
}

// The entire bottle flies on an arc. Absolute elapsed time keeps the hit and defeat
// aligned with the server even after a background tab or a projector reconnect.
export function bossUnleash({ elapsed = 0, from = { x: 500, y: 560, width: 260, height: 390 } } = {}) {
  shots = []; bolts = []; hallQueue = 0;
  for (const f of fx) f.queue = 0;
  boss.pending = [];
  boss.suffer = null;
  finale = { start: performance.now() / 1000 - elapsed, elapsed, from, target: bossTarget(), hp: Math.max(boss.hp, boss.max * 0.15), hit: elapsed >= FINALE.impactAt, defeated: elapsed >= FINALE.defeatAt, nextSplash: elapsed };
  if (elapsed >= FINALE.defeatAt) Object.assign(boss, { hp: 0, dead: true, deadT: elapsed - FINALE.defeatAt, bubble: null });
  else Object.assign(boss, { dead: false, deadT: 0, hp: finale.hp });
  if (elapsed < FINALE.impactAt) say('Khoan… cái bình đó?!', FINALE.impactAt - elapsed);
}

export function bossHealth() {
  const pending = boss.pending.at(-1)?.hp;
  return { hp: boss.hp, max: boss.max, dead: boss.dead, incoming: pending ?? boss.hp };
}

export function arenaFrame(dt, t) {
  if (!ctx) return;
  update(dt);
  updateFinale(t);
  render(t);
}

function updateFinale(t) {
  if (!finale) return;
  const f = finale;
  const elapsed = f.elapsed = Math.max(0, t - f.start);
  if (elapsed >= FINALE.impactAt && !f.hit) {
    f.hit = true;
    burst(f.target.x, f.target.y, 120, '#a2eaff', 410);
    burst(f.target.x, f.target.y, 65, '#edfaff', 260);
    playShotSfx({ own: true });
    say('Á! Ướt hết rồi!', 1.6);
  }
  if (elapsed >= FINALE.impactAt && elapsed < FINALE.defeatAt) {
    const hurt = (elapsed - FINALE.impactAt) / (FINALE.defeatAt - FINALE.impactAt);
    boss.hp = Math.max(1, f.hp * (1 - hurt));
    if (elapsed >= f.nextSplash) {
      f.nextSplash = elapsed + 0.36;
      Object.assign(boss, { anim: 'hurt', animT: 0 });
      burst(f.target.x + rand(-70, 70), f.target.y + rand(-55, 65), 20, '#72cefa', 130);
      if (hurt > 0.55) say('Tớ… chịu thua rồi!', 0.8);
    }
  }
  if (elapsed >= FINALE.defeatAt) {
    boss.hp = 0;
    if (!f.defeated) { f.defeated = true; killBoss(); }
    boss.deadT = elapsed - FINALE.defeatAt;
  }
}

function say(text, life) {
  if (!boss.dead) boss.bubble = { text, life };
}

// ---- Simulation ----------------------------------------------------------------

function burst(x, y, n, color, speed = 60) {
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed);
    const life = rand(0.25, 0.6);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Math.random() < 0.3 ? 4 : 2 });
  }
}

function trail(x, y, colors) {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push({ x, y, vx: rand(-18, 18), vy: rand(-18, 18), life: 0.3, max: 0.3, color: colors[Math.random() < 0.5 ? 0 : 1], size: 3 });
}

function emitShot(from, taps, double) {
  if (shots.length < MAX_SHOTS) shots.push({ x: from.x, y: from.y, dmg: taps * (double ? 2 : 1), size: Math.min(3, taps), double, life: 3 });
  burst(from.x, from.y, 5, double ? '#FFC37A' : '#8fc5ff', 110);
  playShotSfx({ own: false });
}

function updateTurrets(dt) {
  const ease = 1 - Math.exp(-dt * 12);
  fx.forEach((f, i) => {
    f.t += dt;
    f.hit = Math.max(0, f.hit - dt);
    f.block = Math.max(0, f.block - dt);
    f.hold = Math.max(0, f.hold - dt);
    f.emitT -= dt;
    if (f.queue > 0 && f.emitT <= 0) {
      // Merge whatever piled up, so the stream keeps pace with the fastest tappers.
      const taps = Math.min(f.queue, Math.ceil(f.queue / 4));
      f.queue -= taps;
      f.emitT = EMIT_INTERVAL;
      f.hold = 0.9;
      if (f.name !== 'fire') Object.assign(f, { name: 'fire', t: 0 });
      emitShot(muzzlePos(i), taps, f.double);
    }
    // Swing toward the boss while shooting, hold a moment, then stand upright again.
    const target = f.hold > 0 ? aimAngle(i) : 0;
    f.angle += (target - f.angle) * ease;
    if (f.name === 'fire' && turretSheet) {
      const anim = turretSheet.anims.fire;
      if (f.t >= anim.frames.length / anim.fps) Object.assign(f, { name: f.queue > 0 ? 'fire' : 'idle', t: 0 });
    }
  });
  hallT -= dt;
  if (hallQueue > 0 && hallT <= 0) {
    const taps = Math.min(hallQueue, Math.ceil(hallQueue / 6));
    hallQueue -= taps;
    hallT = 0.08;
    const [x, y] = ARENA.hallLaunchers[hallSide++ % ARENA.hallLaunchers.length];
    emitShot({ x: x + rand(-18, 18), y }, taps, false);
  }
}

// Shots re-aim every frame at the flying boss, so every accepted tap lands.
function updateShots(dt) {
  const target = bossTarget();
  let hits = 0;
  for (const s of shots) {
    const dx = target.x - s.x, dy = target.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, SHOT_SPEED * dt);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    s.life -= dt;
    trail(s.x, s.y, s.double ? ['#FFC37A', '#ffffff'] : ['#8fc5ff', '#ffffff']);
    if (d > step + 8 && s.life > 0) continue;
    s.life = 0;
    hits++;
    burst(target.x + rand(-40, 40), target.y + rand(-40, 40), 8, '#8fc5ff', 150);
    if (texts.length < 20) texts.push({ x: target.x + rand(-90, 90), y: target.y - rand(40, 90), text: `-${s.dmg}`, life: 0.8, color: s.double ? '#FFC37A' : '#ff7e61' });
  }
  if (hits && !boss.dead) {
    bossPlay('hurt');
    if (!boss.bubble && Math.random() < 0.02) say(['Áaa!', 'Đau quá!', 'Ối!'][Math.floor(Math.random() * 3)], 0.8);
  }
  shots = shots.filter(s => s.life > 0);
}

// Boss bolts home in on their turret: a miss always lands, unless a shield blocks it.
function updateBolts(dt) {
  for (const b of bolts) {
    if (b.delay > 0) {
      b.delay -= dt;
      if (b.delay <= 0) playShotSfx({ kind: 'boss' });
      continue;
    }
    const c = turretCentre(b.turret);
    const dx = c.x - b.x, dy = c.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const stopAt = b.blocked ? turretBox(b.turret).w * 0.55 : 8;
    const step = Math.min(Math.max(0, d - stopAt + 1), BOLT_SPEED * dt);
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
    b.life -= dt;
    trail(b.x, b.y, ['#ff481f', '#ff9f8a']);
    if (d > stopAt && b.life > 0) continue;
    b.life = 0;
    const f = fx[b.turret];
    if (b.blocked) {
      Object.assign(f, { shield: false, block: 0.7 });
      burst(b.x, b.y, 26, '#5aaaff', 160);
      texts.push({ x: c.x, y: c.y - 56, text: 'Chặn!', life: 1, color: '#8fc5ff' });
      continue;
    }
    Object.assign(f, { hit: 0.5, stunned: true });
    burst(b.x, b.y, 24, '#ff481f', 150);
  }
  bolts = bolts.filter(b => b.life > 0);
}

function killBoss() {
  const target = bossTarget();
  Object.assign(boss, { dead: true, deadT: 0, anim: 'hurt', animT: 0, bubble: { text: 'Không thểeee…', life: 1.6 } });
  burst(target.x, target.y, 90, '#ff481f', 260);
  burst(target.x, target.y, 60, '#8fc5ff', 200);
}

function update(dt) {
  time += dt;
  if (stickers.length) {
    for (const s of stickers) s.life -= dt;
    stickers = stickers.filter(s => s.life > 0);
  }
  if (!boss.dead && !finale && !REDUCED_MOTION.matches) boss.flightT = (boss.flightT + dt) % ARENA.boss.flight.period;
  updateTurrets(dt);
  updateShots(dt);
  updateBolts(dt);
  // Water keeps landing on the boss for the length of the finale, one splash after another.
  if (boss.suffer) {
    if (time >= boss.suffer.until) boss.suffer = null;
    else if (time >= boss.suffer.next) {
      boss.suffer.next = time + 0.42;
      const target = bossTarget();
      Object.assign(boss, { anim: 'hurt', animT: 0 });
      burst(target.x + (Math.random() - 0.5) * 120, target.y + (Math.random() - 0.5) * 90, 34, '#8fc5ff', 150);
      if (Math.random() < 0.4) say(['Nóng quá!', 'Thôi… thôi!', 'Sao nhiều nước thế!'][Math.floor(Math.random() * 3)], 1.1);
    }
  }
  while (boss.pending.length && boss.pending[0].at <= time) {
    boss.hp = Math.min(boss.hp, boss.pending.shift().hp);
    if (boss.hp <= 0 && !boss.dead) killBoss();
  }
  const damp = Math.exp(-dt * 4);
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp; p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  for (const tx of texts) { tx.y -= 30 * dt; tx.life -= dt; }
  texts = texts.filter(tx => tx.life > 0);
  boss.animT += dt;
  if (bossSheet && boss.anim !== 'idle' && !boss.dead) {
    const a = bossSheet.anims[boss.anim];
    if (boss.animT >= a.frames.length / a.fps) Object.assign(boss, { anim: 'idle', animT: 0 });
  }
  if (boss.dead) boss.deadT += dt;
  if (boss.bubble && (boss.bubble.life -= dt) <= 0) boss.bubble = null;
}

// ---- Rendering -----------------------------------------------------------------

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
  ctx.save();
  const sinceHit = finale ? finale.elapsed - FINALE.impactAt : -1;
  const suffering = sinceHit >= 0 && !boss.dead;
  if (suffering) {
    const motion = REDUCED_MOTION.matches ? 0.15 : 1;
    ctx.translate(B.x, B.feetY - B.height * 0.5);
    ctx.rotate(Math.sin(sinceHit * 19) * 0.085 * motion);
    ctx.translate(-B.x + Math.sin(sinceHit * 65) * 7 * motion, -(B.feetY - B.height * 0.5) - Math.sin(Math.min(1, sinceHit / 0.6) * Math.PI) * 30);
  }
  if (!(boss.dead && boss.deadT > 1.6)) {
    const f = frames[bossFrame()];
    if (boss.dead) ctx.globalAlpha = Math.max(0, 1 - boss.deadT / 1.6) * (Math.floor(t * 20) % 2 ? 1 : 0.4);
    ellipse(B.x, B.feetY + 12, B.height * 0.31, B.height * 0.065, 'rgba(7, 13, 26, 0.32)');
    ctx.imageSmoothingEnabled = false;
    const hitImage = suffering && Math.floor(sinceHit * 7) % 2 === 0 ? bossSheet.hurtImage : bossSheet.image;
    const fall = boss.dead ? Math.min(1, boss.deadT / 1.6) : 0;
    ctx.drawImage(hitImage || bossSheet.image, f.x, f.y, f.w, f.h, B.x - pivot.x * k, B.feetY - pivot.y * k + fall * 90, f.w * k, f.h * k * (1 - fall * 0.3));
    ctx.globalAlpha = 1;
  }
  if (boss.dead) {
    // Dark smoke where the boss fell.
    const grow = Math.min(1, boss.deadT / 1.2);
    const cy = B.feetY - B.height * 0.5;
    const puffs = [[0, 0, 0.42], [-0.32, 0.12, 0.3], [0.32, 0.1, 0.3], [-0.18, -0.3, 0.28], [0.2, -0.32, 0.28], [0, 0.35, 0.3]];
    for (const [ox, oy, r] of puffs) {
      const wobble = Math.sin(t * 2 + ox * 9) * 0.03;
      ellipse(B.x + ox * B.height, cy + oy * B.height, (r + wobble) * B.height * grow, (r + wobble) * B.height * grow, 'rgba(22, 16, 30, 0.9)');
    }
  }
  ctx.restore();
}

function drawFinale() {
  if (!finale) return;
  const { elapsed: t, from, target } = finale;
  if (t < FINALE.impactAt) {
    const p = clamp((t - FINALE.throwAt) / (FINALE.impactAt - FINALE.throwAt), 0, 1);
    const size = 1 - p * 0.48;
    const x = from.x + (target.x - from.x) * p;
    const y = from.y + (target.y - from.y) * p - Math.sin(p * Math.PI) * 215;
    if (p > 0) {
      // Discrete droplets describe the trajectory without turning it into a beam.
      for (let i = 1; i <= 8; i++) {
        const q = Math.max(0, p - i * 0.023);
        ctx.globalAlpha = (1 - i / 9) * 0.55;
        ellipse(from.x + (target.x - from.x) * q, from.y + (target.y - from.y) * q - Math.sin(q * Math.PI) * 215, 5 + (8 - i), 3 + (8 - i) * 0.5, '#9beaff');
      }
      ctx.globalAlpha = 1;
    }
    const windup = t < FINALE.throwAt ? -Math.sin(t / FINALE.throwAt * Math.PI) * 0.15 : 0;
    const spin = REDUCED_MOTION.matches ? p * -0.3 : p * Math.PI * 2;
    drawBottle(ctx, x - from.width * size / 2, y - from.height * size / 2, from.width * size, from.height * size, 1, spin + windup);
  }
  const since = t - FINALE.impactAt;
  if (since >= 0 && since < 1.2) {
    const u = since / 1.2;
    ctx.save();
    ctx.globalAlpha = (1 - u) * 0.85;
    ctx.strokeStyle = '#bcf3ff';
    ctx.lineWidth = 14 * (1 - u) + 1;
    ctx.beginPath();
    ctx.ellipse(target.x, target.y, 50 + u * 310, 35 + u * 180, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // The now-empty bottle tumbles out of the splash and off the stage.
  if (since >= 0 && since < 1.3) {
    const p = since / 1.3;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    drawBottle(ctx, target.x - 60 + p * 200, target.y - 100 + p * p * 380, 115, 175, 0, 1.5 + p * 4);
    ctx.restore();
  }
}

// Soft floor lighting, cached per colour. Its footprint extends beyond the opaque cannon base.
const auraTextures = new Map();
function auraTexture(rgb) {
  if (auraTextures.has(rgb)) return auraTextures.get(rgb);
  const light = document.createElement('canvas');
  light.width = 160;
  light.height = 192;
  const g = light.getContext('2d');
  g.save();
  g.translate(80, 144);
  g.scale(1, 0.43);
  const floor = g.createRadialGradient(0, 0, 18, 0, 0, 79);
  floor.addColorStop(0, `rgba(${rgb}, 0.9)`);
  floor.addColorStop(0.48, `rgba(${rgb}, 1)`);
  floor.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = floor;
  g.fillRect(-80, -80, 160, 160);
  g.restore();
  const rise = g.createLinearGradient(0, 20, 0, 152);
  rise.addColorStop(0, `rgba(${rgb}, 0)`);
  rise.addColorStop(0.35, `rgba(${rgb}, 0.35)`);
  rise.addColorStop(0.7, `rgba(${rgb}, 0.85)`);
  rise.addColorStop(1, `rgba(${rgb}, 0.9)`);
  g.fillStyle = rise;
  g.beginPath();
  g.moveTo(20, 20);
  g.lineTo(140, 20);
  g.lineTo(149, 144);
  g.quadraticCurveTo(80, 180, 11, 144);
  g.closePath();
  g.fill();
  auraTextures.set(rgb, light);
  return light;
}

const AURA = { free: ['28, 102, 187', '#87CDFF'], fresh: ['255, 93, 56', '#FFC29A'], ready: ['47, 148, 255', '#B7E6FF'], double: ['255, 138, 31', '#FFD7B0'] };

// Lobby: free seats breathe blue, a fresh arrival glows orange. Shooting: this round's shooters glow.
function auraFor(i, t, seat) {
  const pulse = REDUCED_MOTION.matches ? 0.5 : 0.5 + Math.sin(t * 2.2 + i * 2.399963) * 0.5;
  const f = fx[i];
  if (phase === 'lobby') {
    if (!seat) return { tone: 'free', alpha: 0.12 + pulse * 0.14 };
    return time - seat.since < FRESH_SEAT ? { tone: 'fresh', alpha: 0.6 * (1 - (time - seat.since) / FRESH_SEAT) + 0.1 } : null;
  }
  if (phase === 'fire' && f.ready) {
    const busy = f.hold > 0 ? 0.2 : 0;
    return { tone: f.double ? 'double' : 'ready', alpha: 0.38 + pulse * 0.16 + busy };
  }
  return null;
}

function drawAura(i, t, { tone, alpha }) {
  const p = slotPos(i), w = ARENA.ringWidth;
  const [rgb, rim] = AURA[tone];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(auraTexture(rgb), p.x - w * 0.9, p.y - w * 1.7, w * 1.8, w * 2.27);
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = w * 0.12;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + w * 0.04, w * 0.62, w * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = w * 0.035;
  ctx.stroke();
  ctx.restore();
}

function drawTurret(i, t) {
  const p = slotPos(i);
  const box = turretBox(i);
  const f = fx[i];
  const seat = seats.get(i);
  const light = auraFor(i, t, seat);
  if (light) drawAura(i, t, light);
  if (f.boost) {
    // Armed boost: golden glow and orbiting sparks.
    ellipse(p.x, p.y, ARENA.ringWidth * (0.66 + Math.sin(t * 6) * 0.03), ARENA.ringWidth * 0.32, 'rgba(255, 138, 31, 0.35)');
    ctx.fillStyle = '#ff481f';
    for (let k = 0; k < 4; k++) {
      const a = t * 3 + (k * Math.PI) / 2;
      ctx.fillRect(p.x + Math.cos(a) * box.w * 0.45 - 2, box.y + box.h * 0.45 + Math.sin(a) * box.h * 0.3 - 2, 4, 4);
    }
  }
  // Nobody seated: the empty-chair art. Seated: the fox at the controls.
  const sheet = seat ? turretSheet : turretEmptySheet ?? turretSheet;
  const parts = seat ? turretParts : turretEmptyParts ?? turretParts;
  if (!sheet) {
    ellipse(p.x, p.y - 10, 28, 16, f.hit > 0 ? '#ff6745' : '#e85b3b');
    return;
  }
  const anim = sheet.anims[f.name];
  const k = f.name === 'idle'
    ? Math.floor(t * anim.fps + i * 0.7) % anim.frames.length
    : Math.min(anim.frames.length - 1, Math.floor(f.t * anim.fps));
  const fr = sheet.frames[anim.frames[k]];
  const hurt = f.hit > 0 || (f.stunned && phase === 'fire' && Math.floor(t * 3 + i) % 3 === 0);
  const x0 = box.x + (f.hit > 0 ? rand(-3, 3) : 0);
  ctx.save();
  // A new arrival pops into their seat.
  const age = seat ? time - seat.since : 1;
  if (age < SEAT_POP) {
    const u = age / SEAT_POP;
    const s = 0.4 + 0.6 * (1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2);
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.translate(-p.x, -p.y);
  }
  if (f.stunned && phase === 'fire') ctx.globalAlpha = 0.7;
  ctx.imageSmoothingEnabled = true;
  if (parts) {
    const { base, part } = parts;
    ctx.drawImage(hurt ? base.hurtImage : base.image, fr.x, fr.y, fr.w, fr.h, x0, box.y, box.w, box.h);
    // Barrel (and its water spray) rotates around the hinge on top of the tank.
    const hx = SPRITES.turret.barrel.hingeX * box.w;
    const hy = SPRITES.turret.barrel.cutY * box.h;
    ctx.translate(x0 + hx, box.y + hy);
    ctx.rotate(f.angle);
    ctx.drawImage(hurt ? part.hurtImage : part.image, fr.x, fr.y, fr.w, fr.h, -hx, -hy, box.w, box.h);
  } else {
    ctx.drawImage(hurt ? sheet.hurtImage : sheet.image, fr.x, fr.y, fr.w, fr.h, x0, box.y, box.w, box.h);
  }
  ctx.restore();
  if (f.stunned && phase === 'fire' && !REDUCED_MOTION.matches) {
    // A knocked-out turret smokes until the next question.
    for (let j = 0; j < 3; j++) {
      const rise = (t * 0.6 + i * 0.37 + j / 3) % 1;
      ctx.globalAlpha = 0.45 * Math.sin(rise * Math.PI);
      ellipse(p.x + Math.sin(i + j * 2 + rise * 4) * 10, box.y + box.h * 0.35 - rise * 40, 8 + rise * 10, 7 + rise * 9, '#1b1f2a');
    }
    ctx.globalAlpha = 1;
  }
  if (f.shield || f.block > 0) {
    // Armed shield: pulsing blue dome; flashes brighter when it absorbs a bolt.
    ctx.strokeStyle = f.block > 0 ? `rgba(200, 245, 255, ${0.5 + f.block * 0.7})` : `rgba(90, 209, 255, ${0.55 + Math.sin(t * 5) * 0.2})`;
    ctx.lineWidth = f.block > 0 ? 4 : 3;
    ctx.beginPath();
    ctx.ellipse(p.x, box.y + box.h * 0.5, box.w * (0.55 + f.block * 0.1), box.h * (0.55 + f.block * 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (f.double && phase === 'fire') drawPixelText('x2', p.x + box.w * 0.42, box.y + box.h * 0.3, '#FFC37A', 14);
}

// Name plates are cached as small bitmaps: a hundred text draws per frame is wasted work.
const plates = new Map();
function plateImage(name, fresh) {
  const key = `${fresh ? 1 : 0}|${name}`;
  let plate = plates.get(key);
  if (plate) return plate;
  const font = '700 15px "MoMo Trusts Display", "MoMo Trusts Sans", system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const maxText = ARENA.pitch - 16;
  let text = name;
  if (measure.measureText(text).width > maxText) {
    const chars = Array.from(name);
    while (chars.length > 1 && measure.measureText(`${chars.join('')}…`).width > maxText) chars.pop();
    text = `${chars.join('').trimEnd()}…`;
  }
  const w = Math.ceil(measure.measureText(text).width) + 12;
  const h = 22;
  const image = document.createElement('canvas');
  image.width = Math.ceil(w * scale);
  image.height = Math.ceil(h * scale);
  const g = image.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = fresh ? '#FF5D38' : '#3d546d';
  g.fillRect(2, 0, w - 4, h);
  g.fillRect(0, 2, w, h - 4);
  g.fillStyle = fresh ? '#3a1a12' : '#0a1826';
  g.fillRect(2, 1, w - 4, h - 2);
  g.fillRect(1, 2, w - 2, h - 4);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fresh ? '#FFD5C8' : '#EEF3F8';
  g.fillText(text, w / 2, h / 2 + 1);
  plate = { image, w, h };
  if (plates.size > 600) plates.clear();
  plates.set(key, plate);
  return plate;
}

function drawPlate(i) {
  const seat = seats.get(i);
  if (!seat) return;
  const p = slotPos(i);
  const plate = plateImage(seat.name, phase === 'lobby' && time - seat.since < FRESH_SEAT);
  const age = time - seat.since;
  ctx.globalAlpha = clamp(age / 0.3, 0, 1) * (fx[i].stunned && phase === 'fire' ? 0.6 : 1);
  ctx.drawImage(plate.image, Math.round(p.x - plate.w / 2), p.y + 20, plate.w, plate.h);
  ctx.globalAlpha = 1;
}

function pixelDot(x, y, r, color) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r + 2, r * 2, r * 2 - 4);
  ctx.fillRect(x - r + 2, y - r, r * 2 - 4, r * 2);
}

// Numbers in the pixel face; it has no Vietnamese glyphs, so words use drawWord.
function drawPixelText(text, x, y, color, size = 16) {
  ctx.font = `${size}px "Press Start 2P", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawWord(text, x, y, color, size = 20) {
  ctx.font = `800 ${size}px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Speech bubble as a pixel card: ink border, stepped corners, hard shadow and a stepped tail.
function drawBubble(text, x, y) {
  const step = (bx, by, w, h, s) => {
    ctx.fillRect(bx + s, by, w - 2 * s, h);
    ctx.fillRect(bx, by + s, w, h - 2 * s);
  };
  ctx.font = '800 22px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 30;
  const h = 40;
  const bx = clamp(Math.round(x), 8, ARENA.width - w - 12);
  const by = Math.round(y - h);
  ctx.fillStyle = SHADOW;
  step(bx + 5, by + 5, w, h, 8);
  ctx.fillStyle = INK;
  step(bx, by, w, h, 8);
  ctx.fillRect(bx + 14, by + h, 12, 4);
  ctx.fillRect(bx + 14, by + h + 4, 8, 4);
  ctx.fillStyle = '#FFFFFF';
  step(bx + 4, by + 4, w - 8, h - 8, 4);
  ctx.fillRect(bx + 18, by + h - 4, 4, 4);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 15, by + h / 2 + 1);
}

function render(t) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (mapImage) ctx.drawImage(mapImage, 0, 0, ARENA.width, ARENA.height);
  drawArenaAmbience(ctx, t, { reducedMotion: REDUCED_MOTION.matches });
  drawBoss(t);
  // Slots run row by row from the boss outward, which is already back-to-front.
  for (let i = 0; i < fx.length; i++) drawTurret(i, t);
  for (let i = 0; i < fx.length; i++) drawPlate(i);
  for (const s of stickers) {
    const img = reactArt[s.icon];
    if (!img?.complete || !img.naturalWidth) continue;
    const p = slotPos(s.turret);
    const k = 1 - s.life / s.max;                       // 0 lúc vừa thả → 1 lúc tan
    const rise = 26 + k * 78;
    const pop = k < 0.12 ? 0.55 + (k / 0.12) * 0.55 : 1 - k * 0.16;
    const size = REACT_SIZE * pop;
    ctx.globalAlpha = Math.min(1, k / 0.1) * Math.min(1, (1 - k) / 0.28);
    ctx.drawImage(img, Math.round(p.x - size / 2 + s.drift * k), Math.round(p.y - rise - size), size, size);
  }
  ctx.globalAlpha = 1;
  const orbs = [
    ...shots.map(s => [s, s.double ? '#ff8a1f' : '#2f94ff', s.double ? '#FFC37A' : '#8fc5ff', '#ffffff', 5 + s.size * 2]),
    ...bolts.filter(b => !(b.delay > 0)).map(b => [b, '#c22d0c', '#ff481f', '#ffbeb0', 7]),
  ];
  for (const [o, glow, body, core, r] of orbs) {
    ctx.globalAlpha = 0.4;
    pixelDot(o.x, o.y, r * 2, glow);
    ctx.globalAlpha = 1;
    pixelDot(o.x, o.y, r, body);
    pixelDot(o.x, o.y, Math.max(2, r / 2), core);
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
  drawFinale();
  for (const tx of texts) {
    ctx.globalAlpha = Math.min(1, tx.life / 0.3);
    if (/^[-+\d\s]+$/.test(tx.text)) drawPixelText(tx.text, tx.x, tx.y, tx.color, 18);
    else drawWord(tx.text, tx.x, tx.y, tx.color, 24);
  }
  ctx.globalAlpha = 1;
  if (boss.bubble) {
    const B = bossPose();
    drawBubble(boss.bubble.text, B.x + B.height * 0.35, B.feetY - B.height * 0.72);
  }
}

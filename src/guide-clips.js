// Looping how-to clips for the guide popup, drawn with the game's own sprites. Each clip is a pure
// function of its local time, so the popup can jump between steps and loop without clip state.
import { SPRITES, ITEMS, ANSWERS, SHAPE_PATHS } from './config.js';

// Seconds per clip. The item clip demos all three items; shield and boost need room for the boss
// to strike back and for the double shot.
const ITEM_PHASES = [1.6, 2.2, 2.2];
export const GUIDE_CLIP_SECONDS = [3.2, 3.4, 3.4, ITEM_PHASES.reduce((a, b) => a + b, 0)];

const W = 320;
const H = 200;
const FONT = '"MoMo Trusts Display", "MoMo Trusts Sans", system-ui, sans-serif';
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t, a, b) => ease((t - a) / (b - a));
const SHAPES = Object.fromEntries(Object.entries(SHAPE_PATHS).map(([name, d]) => [name, new Path2D(d)]));

function frameOf(sheet, name, time) {
  const anim = sheet.anims[name] ?? Object.values(sheet.anims)[0];
  const n = anim.frames.length;
  const k = Math.floor(time * (anim.fps ?? 8));
  return anim.frames[anim.loop === false ? Math.min(n - 1, Math.max(0, k)) : ((k % n) + n) % n];
}

// As in the arena: the platform spans 73.5% of the frame and frame y 0.8 sits on the ring centre.
function drawTurret(ctx, sheet, frameIndex, x, ringY, ringW) {
  if (!sheet) return null;
  const f = sheet.frames[frameIndex];
  const k = ringW / 0.735 / f.w;
  const box = { x: x - (f.w * k) / 2, y: ringY - 0.8 * f.h * k, w: f.w * k, h: f.h * k };
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, box.x, box.y, box.w, box.h);
  const { muzzle } = SPRITES.turret;
  return { ...box, tipX: box.x + muzzle.x * box.w, tipY: box.y + muzzle.y * box.h };
}

function drawRing(ctx, x, y, w, mine, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.62, w * 0.3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = mine ? '#FF5D38' : '#1C66BB';
  ctx.lineWidth = w * 0.12;
  ctx.stroke();
  ctx.strokeStyle = mine ? '#FFC29A' : '#87CDFF';
  ctx.lineWidth = w * 0.035;
  ctx.stroke();
  ctx.restore();
}

function backdrop(ctx) {
  ctx.fillStyle = '#0b1a2b';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(160, 70, 10, 160, 70, 190);
  glow.addColorStop(0, '#1b3b5e');
  glow.addColorStop(1, '#0b1a2b00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function text(ctx, str, x, y, { size = 10, color = '#ffffff', weight = 800, align = 'center', shadow = true } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (shadow) {
    ctx.fillStyle = '#05101ccc';
    ctx.fillText(str, x, y + 1.5);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function pill(ctx, str, x, y, scale, fill) {
  if (scale <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `800 10px ${FONT}`;
  const w = ctx.measureText(str).width + 16;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -9, w, 18, 9);
  ctx.fill();
  text(ctx, str, 0, 0);
  ctx.restore();
}

// A fingertip that eases to the target, presses at `at`, then drifts away with a ripple.
function finger(ctx, t, from, to, at) {
  const arrive = seg(t, at - 0.45, at);
  const leave = seg(t, at + 0.2, at + 0.6);
  if (arrive <= 0 || leave >= 1) return;
  const x = lerp(lerp(from[0], to[0], arrive), from[0], leave * 0.5);
  const y = lerp(lerp(from[1], to[1], arrive), from[1], leave * 0.5);
  const since = t - at;
  if (since >= 0 && since < 0.45) ripple(ctx, to[0], to[1], since / 0.45);
  fingertip(ctx, x, y, since >= 0 && since < 0.14, 1 - leave);
}

function ripple(ctx, x, y, p) {
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6 + p * 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function fingertip(ctx, x, y, pressed, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffffe6';
  ctx.strokeStyle = '#0b1a2b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, pressed ? 5.5 : 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// A Kahoot-style answer tile: colour, a ledge and the white shape.
function tile(ctx, i, x, y, w, h, { alpha = 1, outline = false, crossed = 0 } = {}) {
  const a = ANSWERS[i];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = a.ledge;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h - 4, 6);
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 7);
    ctx.stroke();
  }
  const s = Math.min(w, h) * 0.46;
  ctx.translate(x + w / 2 - s / 2, y + (h - 4) / 2 - s / 2);
  ctx.scale(s / 24, s / 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill(SHAPES[a.shape]);
  ctx.restore();
  if (crossed > 0) {
    ctx.fillStyle = '#E5303F';
    ctx.fillRect(x + 6, y + h / 2 - 1, (w - 12) * crossed, 2);
  }
}

function namePlate(ctx, str, x, y, fresh, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 8px ${FONT}`;
  const w = ctx.measureText(str).width + 10;
  ctx.fillStyle = fresh ? '#FF5D38' : '#3d546d';
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, 14, 3);
  ctx.fill();
  ctx.fillStyle = fresh ? '#3a1a12' : '#0a1826';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, 12, 2);
  ctx.fill();
  text(ctx, str, x, y + 6.5, { size: 8, weight: 700, color: fresh ? '#FFD5C8' : '#EEF3F8', shadow: false });
  ctx.restore();
}

// Ease-out-back from 40% size, for a turret someone just sat down in.
function popScale(since, duration = 0.45) {
  if (since <= 0) return 0.4;
  const u = Math.min(1, since / duration) - 1;
  return 0.4 + 0.6 * (1 + 2.2 * u ** 3 + 1.2 * u ** 2);
}

// Join: tap "Vào chơi" and a turret on the big screen takes your name.
function clipJoin(ctx, art, t) {
  const slots = [80, 160, 240];
  const ringY = 112, ringW = 46, mineAt = 1;
  const tapAt = 0.75, seatAt = 1.2;
  const seated = t >= seatAt;
  slots.forEach((x, i) => {
    const mine = i === mineAt && seated;
    drawRing(ctx, x, ringY, ringW, mine, mine ? 0.85 + Math.sin(t * 10) * 0.15 : i === 2 ? 0.25 : 0.5);
  });
  slots.forEach((x, i) => {
    const mine = i === mineAt && seated;
    const sheet = mine || i === 2 ? art.turret : art.turretEmpty;
    if (!sheet) return;
    const s = mine ? popScale(t - seatAt) : 1;
    ctx.save();
    ctx.translate(x, ringY);
    ctx.scale(s, s);
    ctx.translate(-x, -ringY);
    drawTurret(ctx, sheet, frameOf(sheet, 'idle', t + i * 0.3), x, ringY, ringW);
    ctx.restore();
  });
  namePlate(ctx, 'Lan Chi', slots[2], ringY + 16, false);
  if (seated) namePlate(ctx, 'Tên bạn', slots[mineAt], ringY + 16, true, seg(t, seatAt + 0.1, seatAt + 0.3));
  pill(ctx, 'Ụ súng mang tên bạn!', 160, 30, seg(t, seatAt + 0.25, seatAt + 0.5), '#E5303F');

  const leave = seg(t, seatAt + 0.1, seatAt + 0.5);
  if (leave < 1) {
    const pressed = t >= tapAt && t < tapAt + 0.14;
    ctx.save();
    ctx.globalAlpha = 1 - leave;
    ctx.fillStyle = '#6B0009';
    ctx.beginPath();
    ctx.roundRect(110, 168, 100, 24, 5);
    ctx.fill();
    const grad = ctx.createLinearGradient(0, 166, 0, 188);
    grad.addColorStop(0, '#FF7034');
    grad.addColorStop(1, '#AC000E');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(110, pressed ? 169 : 166, 100, 21, 5);
    ctx.fill();
    text(ctx, 'VÀO CHƠI', 160, pressed ? 180 : 177, { size: 9 });
    ctx.restore();
  }
  finger(ctx, t, [300, 196], [160, 178], tapAt);
}

// Answer: the question is on the big screen; the phone shows four matching tiles.
function clipQuiz(ctx, t) {
  const tapAt = 1.15, revealAt = 2.1, correct = 1;
  ctx.fillStyle = '#F4F8FC';
  ctx.beginPath();
  ctx.roundRect(40, 10, 240, 34, 6);
  ctx.fill();
  text(ctx, 'CÂU HỎI TRÊN MÀN HÌNH LỚN', 160, 21, { size: 7, color: '#45607c', shadow: false });
  ctx.fillStyle = '#9fb1c4';
  ctx.fillRect(84, 30, 152, 4);
  ctx.fillRect(112, 37, 96, 3);

  const run = Math.min(t, revealAt) / revealAt;
  ctx.fillStyle = '#2f445a';
  ctx.fillRect(50, 52, 220, 4);
  ctx.fillStyle = '#1C66BB';
  ctx.fillRect(50, 52, 220 * (1 - run * 0.45), 4);

  const boxes = [[50, 64], [164, 64], [50, 124], [164, 124]];
  boxes.forEach(([x, y], i) => {
    const picked = t >= tapAt;
    const revealed = t >= revealAt;
    const alpha = revealed ? (i === correct ? 1 : 0.3) : picked && i !== correct ? 0.45 : 1;
    const press = picked && i === correct && t < tapAt + 0.12 ? 3 : 0;
    tile(ctx, i, x, y + press, 106, 52 - press, { alpha, outline: picked && i === correct });
  });
  if (t >= tapAt && t < revealAt) pill(ctx, 'Đã chọn!', 217, 60, seg(t, tapAt, tapAt + 0.2), '#1C66BB');
  if (t >= revealAt) pill(ctx, 'Chính xác!', 217, lerp(84, 60, seg(t, revealAt, revealAt + 0.35)), seg(t, revealAt, revealAt + 0.25), '#1f8a4c');
  finger(ctx, t, [300, 196], [217, 92], tapAt);
}

function hpBar(ctx, x, y, w, hp) {
  ctx.fillStyle = '#05101c';
  ctx.fillRect(x - 1, y - 1, w + 2, 10);
  ctx.fillStyle = '#2f445a';
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = '#f06f52';
  ctx.fillRect(x, y, w * Math.max(0, hp), 8);
  ctx.fillStyle = '#ffb1a0';
  ctx.fillRect(x, y, w * Math.max(0, hp), 1);
}

// anim is [name, seconds into it]; hurt swaps in the red-tinted sheet with a small shake.
function drawBoss(ctx, boss, x, feetY, height, [anim, time], hurt) {
  if (!boss) return;
  const f = boss.frames[frameOf(boss, anim, time)];
  const k = height / boss.headroom;
  const shake = hurt ? Math.sin(time * 90) * 2 : 0;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(hurt ? boss.hurtImage : boss.image, f.x, f.y, f.w, f.h,
    x + shake - boss.pivot.x * k, feetY - boss.pivot.y * k, f.w * k, f.h * k);
}

function projectile(ctx, x0, y0, x1, y1, p, [glow, core]) {
  if (p < 0 || p > 1) return;
  const back = Math.max(0, p - 0.25);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lerp(x0, x1, back), lerp(y0, y1, back));
  ctx.lineTo(lerp(x0, x1, p), lerp(y0, y1, p));
  ctx.strokeStyle = glow;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = core;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function burst(ctx, x, y, since, color, seed = 0) {
  if (since < 0 || since >= 0.3) return;
  ctx.save();
  ctx.globalAlpha = 1 - since / 0.3;
  ctx.fillStyle = color;
  for (let d = 0; d < 6; d++) {
    const a = (d / 6) * Math.PI * 2 + seed;
    ctx.fillRect(x + Math.cos(a) * since * 60 - 1.5, y + Math.sin(a) * since * 60 - 1.5, 3, 3);
  }
  ctx.restore();
}

function popText(ctx, str, x, y, since) {
  if (since < 0 || since >= 0.55) return;
  ctx.globalAlpha = 1 - seg(since, 0.3, 0.55);
  text(ctx, str, x, y - since * 24, { size: 11, color: '#FF7034' });
  ctx.globalAlpha = 1;
}

const WATER = ['#5fc4ffaa', '#e8f8ff'];
const FIRE = ['#ff5a1eaa', '#ffe08a'];
const TRAVEL = 0.28;
// Tap times for the shooting clip: slow at first, then mashing.
const TAPS = [0.55, 0.85, 1.1, 1.3, 1.48, 1.64, 1.8, 1.95, 2.1, 2.25, 2.4, 2.55];

// Shoot: after a right answer, every tap on BẮN fires the turrets at the boss.
function clipFire(ctx, art, t) {
  const slots = [48, 122, 196];
  const ringY = 176, ringW = 38;
  const button = { x: 272, y: 140, r: 30 };
  const volley = TAPS.map((at, k) => ({ i: k % 3, at: at + 0.04 }));
  const hits = volley.map(v => v.at + TRAVEL);
  const lastHit = hits.filter(h => h <= t).at(-1);
  const hurt = lastHit !== undefined && t - lastHit < 0.2;

  hpBar(ctx, 58, 12, 128, 1 - hits.reduce((sum, h) => sum + 0.06 * seg(t, h, h + 0.1), 0));
  drawBoss(ctx, art.boss, 122, 100, 76, hurt ? ['hurt', t - lastHit] : ['idle', t], hurt);

  const tips = slots.map((x, i) => {
    drawRing(ctx, x, ringY, ringW, false, 0.65);
    if (!art.turret) return { tipX: x, tipY: ringY - 30 };
    const fired = volley.filter(v => v.i === i && t >= v.at && t < v.at + 0.34).at(-1);
    const frame = fired ? frameOf(art.turret, 'fire', t - fired.at) : frameOf(art.turret, 'idle', t + i * 0.4);
    return drawTurret(ctx, art.turret, frame, x, ringY, ringW);
  });
  for (const [k, v] of volley.entries()) {
    const tx = 122 + ((k % 5) - 2) * 7, ty = 62;
    projectile(ctx, tips[v.i].tipX, tips[v.i].tipY, tx, ty, (t - v.at) / TRAVEL, WATER);
    burst(ctx, tx, ty, t - v.at - TRAVEL, '#b7e6ff', k);
  }

  // The phone's fire button, mashed by one fingertip.
  const lastTap = TAPS.filter(at => at <= t).at(-1);
  const since = lastTap === undefined ? 1 : t - lastTap;
  const squeeze = since < 0.09 ? 0.9 : 1;
  ctx.save();
  ctx.translate(button.x, button.y);
  ctx.scale(squeeze, squeeze);
  ctx.fillStyle = '#ff5d3833';
  ctx.beginPath();
  ctx.arc(0, 0, button.r + 6, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createRadialGradient(0, -10, 4, 0, 0, button.r);
  grad.addColorStop(0, '#FF8A4E');
  grad.addColorStop(0.6, '#E5303F');
  grad.addColorStop(1, '#AC000E');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, button.r, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, 'BẮN!', 0, 0, { size: 13 });
  ctx.restore();
  if (lastTap !== undefined && since < 0.35) ripple(ctx, button.x, button.y, since / 0.35);
  if (t >= TAPS[0] - 0.4 && t < TAPS.at(-1) + 0.5) {
    fingertip(ctx, button.x + 12, button.y + 12 + (since < 0.09 ? 0 : 5), since < 0.09, 1 - seg(t, TAPS.at(-1) + 0.2, TAPS.at(-1) + 0.5));
  }
  pill(ctx, 'TAP TAP TAP!', button.x - 4, 90, seg(t, TAPS[2], TAPS[2] + 0.2), '#E5303F');
  for (const at of hits.filter((_, k) => k % 3 === 2)) popText(ctx, 'Trúng!', 170, 44, t - at);
}

const ITEM_KEYS = ['hint', 'shield', 'boost'];
const ITEM_STARTS = ITEM_PHASES.map((_, i) => ITEM_PHASES.slice(0, i).reduce((a, b) => a + b, 0));
const itemIcons = Object.fromEntries(ITEM_KEYS.map(key => {
  const img = new Image();
  img.src = ITEMS[key].icon;
  return [key, img];
}));
const TAP = 0.45;
const EFFECT = 0.6;
const DUEL = { turretX: 92, ringY: 116, ringW: 44, bossX: 236, bossFeet: 110, bossH: 70, hitX: 232, hitY: 76 };

function itemTile(ctx, i, state) {
  const x = 14 + i * 100, y = 136, w = 92, h = 54;
  ctx.save();
  ctx.globalAlpha = state === 'used' ? 0.5 : 1;
  ctx.fillStyle = state === 'armed' ? '#3a2a26' : '#19314a';
  ctx.strokeStyle = state === 'armed' ? '#FF7034' : '#3c546e';
  ctx.lineWidth = state === 'armed' ? 2 : 1;
  if (state === 'armed') {
    ctx.shadowColor = '#FF7034';
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w, h, 6);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  const icon = itemIcons[ITEM_KEYS[i]];
  if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, x + w / 2 - 12, y + 6, 24, 24);
  text(ctx, ITEMS[ITEM_KEYS[i]].name, x + w / 2, y + 42, { size: 7.5, weight: 700, color: '#e4ebf3' });
  ctx.fillStyle = '#3f2823';
  ctx.fillRect(x + w - 17, y + 5, 12, 11);
  text(ctx, state === 'ready' ? '1' : '0', x + w - 11, y + 10.5, { size: 7.5, color: '#f8b3a4' });
  ctx.restore();
}

function duelTurret(ctx, art, frame) {
  const { turretX, ringY, ringW } = DUEL;
  const box = art.turret && drawTurret(ctx, art.turret, frame, turretX, ringY, ringW);
  return box || { x: turretX - 30, y: ringY - 48, w: 60, h: 60, tipX: turretX, tipY: ringY - 34 };
}

// Shield: the boss breathes fire at the turret, the dome flashes and absorbs it, then is spent.
function duelShield(ctx, art, lt, t) {
  const launch = 1.15, impact = 1.45;
  hpBar(ctx, DUEL.bossX - 30, 22, 60, 0.85);
  drawBoss(ctx, art.boss, DUEL.bossX, DUEL.bossFeet, DUEL.bossH, lt >= 1 && lt < 1.6 ? ['attack', lt - 1] : ['idle', t], false);
  drawRing(ctx, DUEL.turretX, DUEL.ringY, DUEL.ringW, true, 0.7);
  const box = duelTurret(ctx, art, art.turret ? frameOf(art.turret, 'idle', t) : 0);

  const cx = DUEL.turretX, cy = box.y + box.h * 0.5, rx = box.w * 0.55, ry = box.h * 0.55;
  const up = seg(lt, EFFECT, EFFECT + 0.2) * (1 - seg(lt, impact + 0.3, impact + 0.6));
  const flash = lt >= impact ? 1 - seg(lt, impact, impact + 0.3) : 0;
  if (up > 0) {
    ctx.strokeStyle = flash > 0 ? `rgba(200, 245, 255, ${0.5 + flash * 0.5})` : `rgba(90, 209, 255, ${(0.6 + Math.sin(t * 5) * 0.2) * up})`;
    ctx.lineWidth = flash > 0 ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (up + flash * 0.1), ry * (up + flash * 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const ox = DUEL.bossX - 14, oy = 80;
  const a = Math.atan2((oy - cy) / ry, (ox - cx) / rx);
  const ex = cx + rx * Math.cos(a), ey = cy + ry * Math.sin(a);
  projectile(ctx, ox, oy, ex, ey, (lt - launch) / (impact - launch), FIRE);
  burst(ctx, ex, ey, lt - impact, '#ffd27a');
  return { used: lt >= impact, label: lt >= impact ? 'Khiên đã đỡ đòn!' : 'Đỡ 1 lần sai' };
}

// Boost: the armed turret glows gold and fires twice.
function duelBoost(ctx, art, lt, t) {
  const shots = [1, 1.3], travel = 0.25;
  const hits = shots.map(s => s + travel);
  const lastHit = hits.filter(h => h <= lt).at(-1);
  const hurt = lastHit !== undefined && lt - lastHit < 0.22;
  hpBar(ctx, DUEL.bossX - 30, 22, 60, 0.85 - hits.reduce((sum, h) => sum + 0.15 * seg(lt, h, h + 0.12), 0));
  drawBoss(ctx, art.boss, DUEL.bossX, DUEL.bossFeet, DUEL.bossH, hurt ? ['hurt', lt - lastHit] : ['idle', t], hurt);

  const armed = lt >= EFFECT && lt < hits[1] + 0.25;
  if (armed) {
    ctx.fillStyle = '#ff8a1f59';
    ctx.beginPath();
    ctx.ellipse(DUEL.turretX, DUEL.ringY, DUEL.ringW * (0.66 + Math.sin(t * 6) * 0.03), DUEL.ringW * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawRing(ctx, DUEL.turretX, DUEL.ringY, DUEL.ringW, true, 0.7);
  const fired = shots.filter(s => lt >= s && lt < s + 0.3).at(-1);
  const frame = !art.turret ? 0 : fired !== undefined ? frameOf(art.turret, 'fire', lt - fired) : frameOf(art.turret, 'idle', t);
  const box = duelTurret(ctx, art, frame);
  if (armed) {
    ctx.fillStyle = '#ff481f';
    for (let k = 0; k < 4; k++) {
      const a = t * 3 + (k * Math.PI) / 2;
      ctx.fillRect(DUEL.turretX + Math.cos(a) * box.w * 0.45 - 2, box.y + box.h * 0.45 + Math.sin(a) * box.h * 0.3 - 2, 4, 4);
    }
  }
  shots.forEach((s, i) => {
    projectile(ctx, box.tipX, box.tipY, DUEL.hitX, DUEL.hitY, (lt - s) / travel, WATER);
    burst(ctx, DUEL.hitX, DUEL.hitY, lt - s - travel, '#b7e6ff', i);
  });
  popText(ctx, 'Trúng!', 206, 46, lt - hits[0]);
  popText(ctx, 'Trúng ×2!', 270, 46, lt - hits[1]);
  return { used: lt >= hits[1] + 0.25, label: 'Đúng: ×2 điểm, ×2 đạn' };
}

function clipItems(ctx, art, t) {
  const phase = ITEM_STARTS.findLastIndex(start => t >= start);
  const lt = t - ITEM_STARTS[phase];
  let used = lt >= 1.2;
  let label = 'Loại 2 đáp án sai';

  if (phase === 0) {
    const gone = seg(lt, EFFECT, EFFECT + 0.3);
    [[50, 38], [164, 38], [50, 84], [164, 84]].forEach(([x, y], i) => {
      const wrong = i === 0 || i === 3;
      tile(ctx, i, x, y, 106, 40, { alpha: wrong ? 1 - gone * 0.7 : 1, crossed: wrong ? gone : 0 });
    });
  } else {
    ({ used, label } = (phase === 1 ? duelShield : duelBoost)(ctx, art, lt, t));
  }

  if (lt >= EFFECT) pill(ctx, label, phase ? 110 : 160, phase ? 14 : 20, seg(lt, EFFECT, EFFECT + 0.2), '#E5303F');
  for (let i = 0; i < 3; i++) {
    const state = i < phase ? 'used' : i > phase || lt < TAP ? 'ready' : used ? 'used' : 'armed';
    itemTile(ctx, i, state);
  }
  finger(ctx, lt, [300, 200], [60 + phase * 100, 158], TAP);
}

/** step: 0 join, 1 answer, 2 tap to shoot, 3 use items. t: seconds into that clip. */
export function drawGuideClip(canvas, art, step, t) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  backdrop(ctx);
  if (step === 0) clipJoin(ctx, art, t);
  else if (step === 1) clipQuiz(ctx, t);
  else if (step === 2) clipFire(ctx, art, t);
  else clipItems(ctx, art, t);
  ctx.restore();
}

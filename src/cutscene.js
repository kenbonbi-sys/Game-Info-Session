// The one-off scene played right after joining: Buddy runs in, leaps into the turret that now
// carries the player's name, and says what it came to do. Pure function of time like the guide
// clips, so the frame loop can drive it and a skip just stops calling in.

const W = 320;
const H = 200;
const FONT = '"MoMo Trusts Display", "MoMo Trusts Sans", system-ui, sans-serif';
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t, a, b) => ease((t - a) / (b - a));

// Beats: run in, leap, land, then a line each. The scene ends a beat after the last line.
const RUN_END = 0.95;
const LAND = 1.55;
const LINES = [
  { at: LAND + 0.25, until: LAND + 2.3 },
  { at: LAND + 2.4, until: LAND + 4.5 },
];
export const CUTSCENE_SECONDS = LINES.at(-1).until + 0.4;

const GROUND = 170;
const TURRET = { x: 214, ringY: 152, ringW: 62 };
const START_X = -34;
const JUMP_X = 128;

function frameOfView(sheet, view) {
  return sheet?.anims?.[view]?.frames?.[0] ?? 0;
}

function backdrop(ctx, t) {
  ctx.fillStyle = '#0b1a2b';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(TURRET.x, TURRET.ringY - 30, 8, TURRET.x, TURRET.ringY - 30, 200);
  glow.addColorStop(0, '#1d4471');
  glow.addColorStop(1, '#0b1a2b00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Speed lines behind the run, so the entrance reads as a charge and not a stroll.
  if (t < RUN_END + 0.3) {
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - seg(t, RUN_END, RUN_END + 0.3));
    ctx.strokeStyle = '#7fb4e8';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = 96 + i * 16;
      const x = ((t * 420 + i * 70) % (W + 120)) - 120;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 26 - i * 4, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function floor(ctx) {
  ctx.fillStyle = '#0f2136';
  ctx.fillRect(0, GROUND + 2, W, H - GROUND - 2);
  ctx.fillStyle = '#25405c';
  ctx.fillRect(0, GROUND + 2, W, 2);
}

function ring(ctx, x, y, w, live, pulse) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = live ? 0.85 + pulse * 0.15 : 0.4;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.62, w * 0.3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = live ? '#FF5D38' : '#1C66BB';
  ctx.lineWidth = w * 0.12;
  ctx.stroke();
  ctx.strokeStyle = live ? '#FFC29A' : '#87CDFF';
  ctx.lineWidth = w * 0.035;
  ctx.stroke();
  ctx.restore();
}

function drawTurret(ctx, sheet, x, ringY, ringW, scale = 1) {
  if (!sheet) return;
  const f = sheet.frames[0];
  const k = (ringW / 0.735 / f.w) * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h,
    x - (f.w * k) / 2, ringY - 0.8 * f.h * k, f.w * k, f.h * k);
}

function drawHero(ctx, sheet, view, x, feetY, height, squash = 1) {
  if (!sheet) return;
  const f = sheet.frames[frameOfView(sheet, view)] ?? sheet.frames[0];
  const k = height / (sheet.headroom || f.h);
  const w = f.w * k;
  const h = f.h * k * squash;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h,
    x - (sheet.pivot?.x ?? f.w / 2) * k, feetY - (sheet.pivot?.y ?? f.h) * k * squash, w, h);
}

function dust(ctx, x, y, since) {
  if (since < 0 || since >= 0.45) return;
  const p = since / 0.45;
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.fillStyle = '#9dc3e8';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = p * 42;
    ctx.fillRect(x + Math.cos(a) * r - 2, y + Math.sin(a) * r * 0.35 - 2, 4, 3);
  }
  ctx.restore();
}

// A speech bubble that pops in, holds, and pops out; the tail points down at the turret.
function bubble(ctx, str, t, { at, until }, tailX) {
  const inP = seg(t, at, at + 0.22);
  const outP = seg(t, until - 0.2, until);
  const scale = inP * (1 - outP);
  if (scale <= 0.01) return;

  ctx.save();
  ctx.font = `800 12px ${FONT}`;
  const words = str.split(' ');
  const lines = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && ctx.measureText(`${last} ${word}`).width <= 214) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 26;
  const h = lines.length * 16 + 18;
  const cx = Math.min(Math.max(tailX, w / 2 + 8), W - w / 2 - 8);
  const cy = 46 + h / 2 - lines.length * 4;

  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = '#F4F8FC';
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 9);
  ctx.moveTo(tailX - 9, cy + h / 2 - 2);
  ctx.lineTo(tailX + 1, cy + h / 2 + 14);
  ctx.lineTo(tailX + 9, cy + h / 2 - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b1a2b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, cx, cy - h / 2 + 16 + i * 16));
  ctx.restore();
}

function namePlate(ctx, str, x, y, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 9px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(str).width + 14;
  ctx.fillStyle = '#FF5D38';
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#3a1a12';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, 14, 3);
  ctx.fill();
  ctx.fillStyle = '#FFD5C8';
  ctx.fillText(str, x, y + 7.5);
  ctx.restore();
}

/** Lines Buddy says once it is in the seat. Kept here so the copy sits with the scene. */
export function cutsceneLines(seatLabel) {
  return [
    seatLabel ? `${seatLabel} là của tôi!` : 'Tôi vào trận rồi!',
    'Trả lời đúng rồi TAP hết sức — mình hạ Dễ Sợ cùng nhau!',
  ];
}

/**
 * Draw the join cutscene. `art` is { hero, turret, turretEmpty }, `t` seconds into the scene.
 * Returns true while the scene still has something to show.
 */
export function drawCutscene(canvas, art, t, { seatLabel = '', name = '' } = {}) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return false;
  ctx.save();
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  backdrop(ctx, t);
  floor(ctx);

  const landed = t >= LAND;
  const pulse = Math.abs(Math.sin(t * 5));
  ring(ctx, TURRET.x, TURRET.ringY, TURRET.ringW, landed, pulse);

  if (landed) {
    // Ease-out-back so the turret snaps into place the moment Buddy drops in.
    const u = Math.min(1, (t - LAND) / 0.4) - 1;
    const pop = 0.55 + 0.45 * (1 + 2.4 * u ** 3 + 1.4 * u ** 2);
    drawTurret(ctx, art.turret, TURRET.x, TURRET.ringY, TURRET.ringW, pop);
    dust(ctx, TURRET.x, TURRET.ringY + 4, t - LAND);
    namePlate(ctx, name || 'Bạn', TURRET.x, TURRET.ringY + 20, seg(t, LAND + 0.15, LAND + 0.4));
  } else {
    drawTurret(ctx, art.turretEmpty ?? art.turret, TURRET.x, TURRET.ringY, TURRET.ringW);
    if (t <= RUN_END) {
      // Running: a two-frame bob is all the directional sheet needs to read as a sprint.
      const p = ease(t / RUN_END);
      const x = lerp(START_X, JUMP_X, p);
      const bob = Math.abs(Math.sin(t * 16)) * 5;
      drawHero(ctx, art.hero, 'right', x, GROUND - bob, 58);
    } else {
      // Leap: a parabola from the run-out to the ring, facing up-right on the way.
      const p = (t - RUN_END) / (LAND - RUN_END);
      const x = lerp(JUMP_X, TURRET.x, p);
      const y = lerp(GROUND, TURRET.ringY - 2, p) - Math.sin(p * Math.PI) * 62;
      drawHero(ctx, art.hero, p < 0.55 ? 'up-right' : 'down-right', x, y, 58, 1 + Math.sin(p * Math.PI) * 0.06);
    }
  }

  const line = LINES.findIndex(l => t >= l.at && t < l.until);
  if (line >= 0) bubble(ctx, cutsceneLines(seatLabel)[line], t, LINES[line], TURRET.x - 4);

  ctx.restore();
  return t < CUTSCENE_SECONDS;
}

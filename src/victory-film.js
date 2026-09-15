// The 10-second victory film is rendered from this same deterministic scene. Keeping the
// source renderer lets the projector show every beat even if its video decoder is unavailable.
import { SPRITES } from './config.js';
import { loadSvgStrip } from './sprites.js';
import { createArenaBackdrop } from './arena-scene.js';

export const VICTORY_FILM_SECONDS = 10;
export const VICTORY_FILM_WIDTH = 1280;
export const VICTORY_FILM_HEIGHT = 720;
const W = VICTORY_FILM_WIDTH, H = VICTORY_FILM_HEIGHT;
const FONT = '"Victory Display", "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif';
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const u = clamp(n); return u * u * (3 - 2 * u); };
const seg = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;
const colors = ['#ffe3a0', '#ff9570', '#8cedee', '#f9f3d1'];
const rand = i => { const n = Math.sin(i * 127.1 + 19.73) * 43758.5453; return n - Math.floor(n); };

let artPromise;
export function loadVictoryFilmArt() {
  if (!artPromise) artPromise = (async () => {
    const font = new FontFace('Victory Display', 'url(/assets/fonts/MoMoTrustDisplay.otf)');
    const [, hero] = await Promise.all([
      font.load().then(f => document.fonts.add(f)),
      loadSvgStrip(new URL('../assets/source/hero-360.svg', import.meta.url).href, { views: SPRITES.hero.views }),
    ]);
    return { hero, backdrop: createArenaBackdrop() };
  })();
  return artPromise;
}

export const loadVictoryArt = loadVictoryFilmArt;

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

function star(ctx, x, y, r, color, turn = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(turn);
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 4;
    const size = i % 2 ? r * .25 : r;
    if (i) ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    else ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function type(ctx, words, y, size, color, alpha = 1, tracking = 0) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${tracking}px`;
  ctx.shadowColor = '#071421'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 4;
  ctx.fillStyle = color; ctx.fillText(words, W / 2, y); ctx.restore();
}

function backdrop(ctx, art, t) {
  ctx.fillStyle = '#071523'; ctx.fillRect(0, 0, W, H);
  if (art?.backdrop) {
    ctx.save(); ctx.globalAlpha = .53;
    const scale = lerp(1, 1.08, seg(t, 0, 8));
    ctx.translate(640, 360); ctx.scale(scale, scale);
    ctx.drawImage(art.backdrop, -640, -360, W, H); ctx.restore();
  }
  const bottom = ctx.createLinearGradient(0, 190, 0, H);
  bottom.addColorStop(0, '#08142035'); bottom.addColorStop(.5, '#111d2ed5'); bottom.addColorStop(1, '#07111dee');
  ctx.fillStyle = bottom; ctx.fillRect(0, 0, W, H);
  const victory = seg(t, 2.8, 5.6);
  const glow = ctx.createRadialGradient(640, 345, 0, 640, 345, 650);
  glow.addColorStop(0, `rgba(255,188,94,${.1 + victory * .23})`);
  glow.addColorStop(.5, `rgba(255,146,80,${victory * .06})`); glow.addColorStop(1, '#07152300');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // Light rays stay behind the foxes and titles, illuminating the whole team's arrival.
  ctx.save(); ctx.translate(640, 395); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + t * .025;
    ctx.fillStyle = `rgba(255,205,113,${victory * .022})`;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - .045) * 1050, Math.sin(a - .045) * 1050);
    ctx.lineTo(Math.cos(a + .045) * 1050, Math.sin(a + .045) * 1050);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Floating motes replace the defeated boss's smoke as the arena becomes warm again.
  for (let i = 0; i < 55; i++) {
    const x = rand(i + 1) * W + Math.sin(t * .4 + i) * 15;
    const y = (rand(i + 80) * 650 - t * (6 + rand(i + 140) * 11) + 900) % 700;
    const alpha = .1 + (.5 + .5 * Math.sin(t * 1.5 + i)) * .32;
    ctx.fillStyle = `rgba(255,224,162,${alpha})`;
    ctx.fillRect(x, y, i % 8 ? 2 : 3, i % 8 ? 2 : 3);
  }
}

// Every fox retains the exact in-game artwork; directional changes, anticipation, running
// bobs, jump arcs, squash and landing rings give the group performance its character.
const FOXES = [
  { start: [-120, 380], end: [304, 481], height: 140, delay: .22 },
  { start: [1420, 380], end: [980, 481], height: 140, delay: .38 },
  { start: [-170, 600], end: [391, 525], height: 174, delay: .1 },
  { start: [1450, 600], end: [886, 525], height: 174, delay: .25 },
  { start: [20, 850], end: [498, 552], height: 207, delay: .4 },
  { start: [1260, 850], end: [783, 552], height: 207, delay: .5 },
  { start: [640, 900], end: [640, 579], height: 237, delay: 0 },
];

function foxPose(t, fox, i) {
  const move = seg(t, .1 + fox.delay, 2.6 + fox.delay);
  const x = lerp(fox.start[0], fox.end[0], move);
  const baseY = lerp(fox.start[1], fox.end[1], move);
  const runBob = move < 1 ? Math.abs(Math.sin(t * 15 + i)) * 10 * (1 - seg(t, 2, 3)) : 0;
  const jumpAt = 4.1 + (i === 6 ? 0 : i % 3 * .07);
  const jumpU = clamp((t - jumpAt) / .9);
  const jump = Math.sin(jumpU * Math.PI) * (i === 6 ? 92 : 66);
  const afterHop = t > 6.6 + i * .09 ? Math.max(0, Math.sin((t - 6.6 - i * .09) * 4)) * 7 : 0;
  let squash = 1 - seg(t, jumpAt - .2, jumpAt) * .13 * (1 - seg(t, jumpAt, jumpAt + .1));
  squash += Math.sin(jumpU * Math.PI) * .035;
  const land = t - jumpAt - .9;
  if (land > 0 && land < .28) squash -= Math.sin(land / .28 * Math.PI) * .14;
  const lookingIn = t > 2.4 && t < 4.2;
  let view = x < 620 ? 'right' : x > 660 ? 'left' : 'up';
  if (move >= .97 && !lookingIn) view = i % 2 ? 'down-left' : 'down-right';
  if (i === 6 && t > 3.1) view = 'down-right';
  return { x, y: baseY - runBob - jump - afterHop, baseY, squash, view, moving: move < .98, land };
}

function drawFox(ctx, art, t, fox, i) {
  const pose = foxPose(t, fox, i), sheet = art?.hero;
  if (!sheet) return;
  const { x, y, baseY, squash, view, moving, land } = pose;
  ellipse(ctx, x, baseY + 2, fox.height * .32, fox.height * .075, '#010a1666');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ellipse(ctx, x, baseY + 1, fox.height * .37, fox.height * .07, `rgba(255,180,99,${.12 + seg(t, 4, 5) * .16})`);
  ctx.restore();
  if (moving) {
    for (let d = 0; d < 4; d++) {
      const p = ((t * 2.5 + i * .13 + d * .23) % 1);
      ctx.fillStyle = `rgba(173,194,203,${(1 - p) * .17})`;
      ctx.fillRect(x - Math.sign(fox.end[0] - fox.start[0]) * p * 90, baseY - p * 16, 4 + p * 8, 3 + p * 4);
    }
  }
  if (land > 0 && land < .6) {
    ctx.save(); ctx.globalAlpha = (1 - land / .6) * .6;
    ctx.strokeStyle = '#ffe6af'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, baseY, 15 + land * 120, 4 + land * 20, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  const f = sheet.frames[sheet.anims[view]?.frames[0] ?? 0];
  const k = fox.height / sheet.headroom;
  ctx.save(); ctx.translate(x, y);
  ctx.rotate(moving ? Math.sin(t * 15 + i) * .035 : Math.sin(t * 2.4 + i) * .014);
  ctx.scale(1 / Math.sqrt(squash), squash); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, -sheet.pivot.x * k, -sheet.pivot.y * k, f.w * k, f.h * k);
  ctx.restore();
  // Three short celebratory marks belong to each fox; they read as a shared cheer.
  const cheer = seg(t, 4.25 + i * .04, 4.5 + i * .04) * (1 - seg(t, 5.35, 5.9));
  if (cheer > 0) {
    ctx.save(); ctx.globalAlpha = cheer; ctx.strokeStyle = '#ffe6a9'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let j = -1; j <= 1; j++) {
      const a = -Math.PI / 2 + j * .5;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 25, y - fox.height - 10 + Math.sin(a) * 15);
      ctx.lineTo(x + Math.cos(a) * 40, y - fox.height - 10 + Math.sin(a) * 30); ctx.stroke();
    }
    ctx.restore();
  }
}

function unity(ctx, t) {
  const appear = seg(t, 1.8, 2.8), release = seg(t, 4.0, 4.6);
  const strength = appear * (1 - release);
  if (strength > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    FOXES.forEach((fox, i) => {
      const p = foxPose(t, fox, i);
      ctx.globalAlpha = strength * .4;
      ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - fox.height * .4);
      ctx.quadraticCurveTo(640, 470, 640, 328); ctx.stroke();
      const u = (t * .7 + i / 7) % 1;
      const px = (1 - u) ** 2 * p.x + 2 * (1 - u) * u * 640 + u * u * 640;
      const py = (1 - u) ** 2 * (p.y - fox.height * .4) + 2 * (1 - u) * u * 470 + u * u * 328;
      ctx.globalAlpha = strength;
      star(ctx, px, py, 5, '#fff1c6');
    });
    ctx.globalAlpha = strength;
    const glow = ctx.createRadialGradient(640, 328, 0, 640, 328, 90);
    glow.addColorStop(0, '#fff5cc'); glow.addColorStop(.1, '#ffdf9ddc'); glow.addColorStop(1, '#ffb44700');
    ctx.fillStyle = glow; ctx.fillRect(540, 228, 200, 200);
    star(ctx, 640, 328, 14 + Math.sin(t * 4) * 2, '#fffbe7', t * .3);
    ctx.restore();
  }
  const burst = (t - 4.14) / 1.3;
  if (burst > 0 && burst < 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - burst) * .8;
    ctx.strokeStyle = '#ffe6b0'; ctx.lineWidth = (1 - burst) * 4;
    ctx.beginPath(); ctx.ellipse(640, 440, burst * 620, burst * 210, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 38; i++) {
      const a = i * 2.39996, r = (70 + rand(i + 400) * 340) * ease(burst);
      star(ctx, 640 + Math.cos(a) * r, 340 + Math.sin(a) * r * .63, 3 + (1 - burst) * 5, colors[i % 4], a);
    }
    ctx.restore();
  }
}

function confetti(ctx, t) {
  const fade = seg(t, 4.45, 5.1);
  if (!fade) return;
  ctx.save(); ctx.globalAlpha = fade * .85;
  for (let i = 0; i < 100; i++) {
    const age = t - 4.45;
    const y = -80 + rand(i + 600) * 230 + age * (42 + rand(i + 800) * 60);
    const x = rand(i + 200) * W + Math.sin(age * 1.4 + i) * (20 + rand(i) * 35);
    ctx.save(); ctx.translate(x, y); ctx.rotate(age * (i % 2 ? 1 : -1) + i);
    ctx.fillStyle = colors[i % 4];
    if (i % 7 === 0) star(ctx, 0, 0, 5, colors[i % 4]);
    else ctx.fillRect(-3, -2, 6, 3 + Math.abs(Math.sin(age * 3 + i)) * 5);
    ctx.restore();
  }
  ctx.restore();
}

export function drawVictoryFilm(canvasOrContext, art, seconds) {
  const ctx = canvasOrContext.getContext ? canvasOrContext.getContext('2d') : canvasOrContext;
  const t = Math.max(0, Math.min(VICTORY_FILM_SECONDS, seconds));
  ctx.save(); ctx.scale(ctx.canvas.width / W, ctx.canvas.height / H);
  backdrop(ctx, art, t);
  unity(ctx, t);
  FOXES.forEach((fox, i) => drawFox(ctx, art, t, fox, i));
  confetti(ctx, t);
  const opening = 1 - seg(t, 2.7, 3.4);
  type(ctx, 'MỘT ĐỘI. MỘT TINH THẦN.', 152, 42, '#f9ecd4', opening, 1.4);
  type(ctx, 'Từng giọt nước. Từng nỗ lực. Một chiến thắng chung.', 213, 23, '#c5d6e0', opening);
  const title = seg(t, 4.75, 5.6);
  const lift = lerp(16, 0, title);
  type(ctx, 'CÙNG NHAU,', 117 + lift, 28, '#ffe0a0', title, 5);
  type(ctx, 'CHÚNG TA LÀM ĐƯỢC!', 175 + lift, 62, '#fff8e9', title);
  type(ctx, 'MỖI CHÚ CÁO  ·  MỘT PHẦN CHIẾN THẮNG', 630, 23, '#ffe0a0', seg(t, 6.0, 6.7), 1.2);
  // A subtle cinematic frame; the last shot holds visibly until the separate podium reveal.
  ctx.fillStyle = '#06101bbd'; ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26);
  ctx.restore();
}

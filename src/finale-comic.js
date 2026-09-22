// The finale told as a comic page. Six panels cut from assets/source/finale-comic-raw.webp by
// tools/build-finale-comic.py: the first three read as a page before the throw, the last three
// slam over the live scene on the beats the scene is already hitting.
//
// Pure function of time like the guide clips and the victory film, so a projector that
// reconnects halfway through lands on the right panel instead of restarting the page.
import { FINALE } from './finale-config.js';

const W = 1920, H = 1080;
const FONT = '"MoMo Trusts Display", "MoMo Trusts Sans", system-ui, sans-serif';
const PAPER = '#fefcea';
const INK = '#33200f';
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const u = clamp(n); return u * u * (3 - 2 * u); };
const out = n => 1 - (1 - clamp(n)) ** 3;
const seg = (t, a, b) => ease((t - a) / (b - a));

// Panels are 1-indexed on disk, the way the page reads.
const SRC = n => `assets/source/comic/panel-${n}.webp`;

// The page: three panels landing left to right and stepping down, the way the bottle travels.
// cy/h are in the 1920×1080 design space; widths come from each panel's own aspect ratio, so
// nothing is stretched. `at` is when the panel slams in, seconds into the comic.
const PAGE = [
  { n: 1, at: 0.15, cx: 390, cy: 455, h: 590, rot: -0.038 },
  { n: 2, at: 1.30, cx: 1140, cy: 340, h: 500, rot: 0.030 },
  { n: 3, at: 2.50, cx: 1500, cy: 710, h: 670, rot: -0.022 },
];
const SLAM = 0.42;

// The last three panels cut into the live scene on its own beats, in scene seconds. Short:
// they punctuate the action, they do not replace it.
const CUT_INS = [
  { n: 4, at: FINALE.impactAt - 0.08, hold: 0.78, cx: 1180, cy: 470, h: 700, rot: 0.045 },
  { n: 5, at: FINALE.defeatAt + 0.15, hold: 0.85, cx: 760, cy: 560, h: 660, rot: -0.035 },
  { n: 6, at: FINALE.sceneSeconds - 1.15, hold: 1.15, cx: 960, cy: 520, h: 720, rot: 0.02 },
];

const COMIC_SECONDS = FINALE.comicSeconds;
// The phone tells the same story on the same beats. It shares this schedule rather than keeping
// its own copy: two lists of timings drift the moment one of them is edited.
export const COMIC_PAGE_AT = PAGE.map(p => p.at);
export const COMIC_CUT_AT = CUT_INS.map(({ n, at, hold }) => ({ n, at, hold }));
export const comicPanelSrc = SRC;

let artPromise;
/** Loads the six panels once. Resolves even if one is missing, so the finale never stalls. */
export function loadComicArt() {
  if (!artPromise) artPromise = Promise.all([1, 2, 3, 4, 5, 6].map(n => new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = new URL(`../${SRC(n)}`, import.meta.url).href;
  })));
  return artPromise;
}

function frame(ctx, img, { cx, cy, h, rot }, pop, lift) {
  if (!img?.naturalWidth) return;
  const w = h * (img.naturalWidth / img.naturalHeight);
  // Overshoot then settle: the panel is stamped onto the page, not faded onto it.
  const scale = 1 + (1 - out(pop)) * 0.22;
  ctx.save();
  ctx.translate(cx, cy + (1 - out(pop)) * lift);
  ctx.rotate(rot * out(pop));
  ctx.scale(scale, scale);
  ctx.globalAlpha = clamp(pop * 3);
  const x = -w / 2, y = -h / 2;
  ctx.shadowColor = '#2a190b66';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = INK;
  ctx.fillRect(x - 7, y - 7, w + 14, h + 14);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h);
  // A white bloom on the first frames reads as the impact of the panel landing.
  const flash = 1 - clamp(pop / 0.35);
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.7;
    ctx.fillStyle = '#fffdf2';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

// Radiating lines behind a panel, the manga way of saying "look here". Deterministic angles so
// a dropped frame or a reconnect never reshuffles them.
function speedLines(ctx, cx, cy, spread, strength, color = '#d9c9a8') {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = strength * 0.5;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < 48; i++) {
    const a = i * 2.399963;
    const inner = spread * (0.42 + (i % 5) * 0.06);
    const outer = spread * (1.05 + (i % 7) * 0.09) * (0.55 + strength * 0.45);
    ctx.lineWidth = i % 4 ? 3 : 7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.82);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

function caption(ctx, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8a6a3f';
  ctx.font = `700 34px ${FONT}`;
  ctx.letterSpacing = '7px';
  ctx.fillText('ĐÒN KẾT LIỄU', 120, 880);
  ctx.fillStyle = INK;
  ctx.font = `800 76px ${FONT}`;
  ctx.letterSpacing = '0px';
  ctx.fillText('Cả hội trường', 118, 964);
  ctx.fillText('dồn vào một cú ném.', 118, 1040);
  ctx.restore();
}

/**
 * The comic page, `t` seconds into the unleash phase. Fills the frame: while this is drawing
 * the arena behind it is only holding its first frame, waiting for the scene to start.
 */
export function drawComicPage(ctx, art, t, reducedMotion = false) {
  const leaving = seg(t, COMIC_SECONDS, COMIC_SECONDS + 0.45);
  if (leaving >= 1) return false;
  ctx.save();
  // The page pulls back as the last panel lands, handing the eye to the scene underneath.
  ctx.globalAlpha = 1 - leaving;
  if (!reducedMotion && leaving > 0) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(1 + leaving * 0.14, 1 + leaving * 0.14);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // Paper: a warm vignette and a light grain, so a flat fill does not read as a blank screen.
  const warm = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1250);
  warm.addColorStop(0, '#fffdf200');
  warm.addColorStop(1, '#d8c5a033');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);

  for (const spot of PAGE) {
    const pop = reducedMotion ? clamp((t - spot.at) / 0.25) : clamp((t - spot.at) / SLAM);
    if (pop <= 0) continue;
    if (!reducedMotion) speedLines(ctx, spot.cx, spot.cy, spot.h * 0.95, (1 - pop) ** 2);
    frame(ctx, art?.[spot.n - 1], spot, pop, reducedMotion ? 0 : -120);
  }
  caption(ctx, seg(t, PAGE[2].at + 0.25, PAGE[2].at + 0.9));
  ctx.restore();
  return true;
}

/**
 * Panels 4-6 over the live scene, `t` seconds into the scene. Each one darkens the arena for
 * as long as it holds, then gets out of the way — the scene keeps playing underneath.
 */
export function drawComicCutIn(ctx, art, t, reducedMotion = false) {
  const cut = CUT_INS.find(c => t >= c.at && t < c.at + c.hold + 0.28);
  if (!cut) return false;
  const since = t - cut.at;
  const pop = reducedMotion ? clamp(since / 0.18) : clamp(since / 0.3);
  const gone = seg(t, cut.at + cut.hold, cut.at + cut.hold + 0.28);
  ctx.save();
  ctx.globalAlpha = 1 - gone;
  ctx.fillStyle = `rgba(8, 16, 24, ${0.72 * pop})`;
  ctx.fillRect(0, 0, W, H);
  if (!reducedMotion) {
    speedLines(ctx, cut.cx, cut.cy, cut.h * 1.35, pop * (1 - gone), '#f4e6c4');
    // A short shake on the frames the panel lands, never for the whole hold.
    const jolt = (1 - clamp(since / 0.22)) * 16;
    if (jolt > 0) ctx.translate(Math.sin(since * 92) * jolt, Math.cos(since * 71) * jolt * 0.6);
  }
  frame(ctx, art?.[cut.n - 1], cut, pop, reducedMotion ? 0 : 70);
  ctx.restore();
  return true;
}

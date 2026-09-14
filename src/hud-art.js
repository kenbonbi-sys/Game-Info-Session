// Small UI illustrations share the playable character sheets. Decorative layers
// are cached; the lobby only redraws its two sprites and a few pixels of dust.
const duelLayers = new WeakMap();
const spriteBounds = new WeakMap();

function block(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function step(ctx, x, y, w, h, cut, color) {
  block(ctx, x + cut, y, w - cut * 2, h, color);
  block(ctx, x, y + cut, w, h - cut * 2, color);
}

function spriteFrame(sheet, frameIndex = 0) {
  if (!sheet?.image || !sheet.frames?.length) return null;
  return sheet.frames[frameIndex] ?? sheet.frames[0];
}

function visibleBounds(sheet, document) {
  let cached = spriteBounds.get(sheet);
  if (cached) return cached;
  const byFrame = new Map();
  const pivotX = sheet.pivot?.x ?? sheet.frames[0].w / 2;
  let left = Infinity;
  let right = -Infinity;
  let pixels;
  let width;
  // Read the source only once, through a scratch surface so the sheet itself
  // stays untouched. Union bounds keep animation frames at a consistent scale.
  try {
    const scratch = document.createElement('canvas');
    scratch.width = sheet.image.naturalWidth || sheet.image.width;
    scratch.height = sheet.image.naturalHeight || sheet.image.height;
    const source = scratch.getContext('2d', { willReadFrequently: true });
    source.drawImage(sheet.image, 0, 0);
    width = scratch.width;
    pixels = source.getImageData(0, 0, width, scratch.height).data;
  } catch {
    // A future cross-origin sheet can still render with its original bounds.
  }
  for (const frame of sheet.frames) {
    let x0 = frame.w, y0 = frame.h, x1 = -1, y1 = -1;
    if (pixels) {
      for (let y = 0; y < frame.h; y++) {
        for (let x = 0; x < frame.w; x++) {
          if (!pixels[((frame.y + y) * width + frame.x + x) * 4 + 3]) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    }
    const bounds = x1 >= x0
      ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
      : { x: 0, y: 0, w: frame.w, h: frame.h };
    byFrame.set(frame, bounds);
    left = Math.min(left, (frame.ox ?? 0) + bounds.x - pivotX);
    right = Math.max(right, (frame.ox ?? 0) + bounds.x + bounds.w - pivotX);
  }
  cached = { byFrame, width: Math.max(1, right - left) };
  spriteBounds.set(sheet, cached);
  return cached;
}

function paintSprite(ctx, sheet, frameIndex, x, feetY, height, maxWidth) {
  const frame = spriteFrame(sheet, frameIndex);
  if (!frame) return;
  const pivot = sheet.pivot ?? { x: frame.w / 2, y: frame.h };
  const visible = visibleBounds(sheet, ctx.canvas.ownerDocument);
  const bounds = visible.byFrame.get(frame);
  const scale = Math.min(height / (sheet.headroom || frame.h), maxWidth / visible.width);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.image, frame.x + bounds.x, frame.y + bounds.y, bounds.w, bounds.h,
    Math.round(x + ((frame.ox ?? 0) + bounds.x - pivot.x) * scale),
    Math.round(feetY + ((frame.oy ?? 0) + bounds.y - pivot.y) * scale),
    Math.round(bounds.w * scale), Math.round(bounds.h * scale));
}

function preferredHeroFrame(sheet) {
  return sheet?.anims?.['down-right']?.frames?.[0]
    ?? sheet?.anims?.right?.frames?.[0]
    ?? sheet?.anims?.idle?.frames?.[0]
    ?? 0;
}

function idleFrame(sheet, time) {
  const frames = sheet?.anims?.idle?.frames ?? [0];
  const duration = frames.reduce((total, index) => total + (sheet?.frames?.[index]?.dur || 125), 0);
  let elapsed = Math.max(0, time * 1000) % duration;
  for (const index of frames) {
    elapsed -= sheet?.frames?.[index]?.dur || 125;
    if (elapsed < 0) return index;
  }
  return frames[0] ?? 0;
}

/** Paint once after loading the sheet. Canvas dimensions are kept unchanged. */
export function paintHudPortrait(canvas, sheet, { frameIndex = 0, kind = 'hero' } = {}) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(width / 96, height / 96);
  ctx.imageSmoothingEnabled = false;
  const boss = kind === 'boss';
  step(ctx, 0, 0, 96, 96, 6, '#0e2136cc');
  step(ctx, 7, 8, 82, 75, 5, boss ? '#52302855' : '#1f3c5b55');
  block(ctx, 13, 81, 70, 3, boss ? '#c0624d66' : '#6f9ed066');
  step(ctx, 19, 76, 58, 13, 4, '#08162588');
  block(ctx, 10, 12, 8, 2, boss ? '#e07c6699' : '#9fc3ea99');
  block(ctx, 10, 12, 2, 8, boss ? '#e07c6699' : '#9fc3ea99');
  paintSprite(ctx, sheet, frameIndex, 48, 82, 70, 82);
  ctx.restore();
}

function platform(ctx, x, amber = false) {
  const rim = amber ? '#9a5849' : '#4a6786';
  const glow = amber ? '#f0836a' : '#9cc1e8';
  step(ctx, x - 91, 182, 182, 30, 10, '#08192c');
  step(ctx, x - 83, 179, 166, 25, 8, rim);
  step(ctx, x - 81, 177, 162, 21, 8, amber ? '#3b2b27' : '#253b53');
  step(ctx, x - 68, 182, 136, 12, 4, '#0f2339');
  block(ctx, x - 65, 177, 130, 2, amber ? '#c98373' : '#7f9fc2');
  block(ctx, x - 19, 201, 38, 3, glow);
  block(ctx, x - 70, 195, 12, 2, rim);
  block(ctx, x + 58, 195, 12, 2, rim);
  // A low stepped contact shadow keeps both feet on the same plane.
  step(ctx, x - 41, 174, 82, 16, 5, '#091725bb');
}

function createDuelLayer(canvas) {
  const layer = canvas.ownerDocument.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const ctx = layer.getContext('2d');
  ctx.scale(layer.width / 640, layer.height / 220);
  ctx.imageSmoothingEnabled = false;

  // Soft light belongs to the environment; sprite pixels retain their colors.
  for (const [x, color] of [[160, '#7cb4f022'], [480, '#f26d4f22']]) {
    const light = ctx.createRadialGradient(x, 124, 10, x, 124, 118);
    light.addColorStop(0, color);
    light.addColorStop(1, '#14293f00');
    ctx.fillStyle = light;
    ctx.fillRect(x - 118, 6, 236, 208);
  }

  // Sparse, fixed stars and a lower horizon suggest the same station as the map.
  const stars = [[44, 50, 2], [87, 22, 3], [253, 40, 2], [269, 153, 2],
    [368, 32, 2], [394, 161, 2], [568, 31, 3], [601, 72, 2]];
  for (const [x, y, size] of stars) block(ctx, x, y, size, size, '#8fa9c466');
  block(ctx, 61, 112, 10, 2, '#799cc288');
  block(ctx, 65, 108, 2, 10, '#799cc288');
  block(ctx, 563, 104, 10, 2, '#c97c6b88');
  block(ctx, 567, 100, 2, 10, '#c97c6b88');
  block(ctx, 29, 205, 582, 2, '#475a6f33');
  block(ctx, 50, 213, 240, 2, '#475a6f22');
  block(ctx, 350, 213, 240, 2, '#475a6f22');

  platform(ctx, 160);
  platform(ctx, 480, true);
  // Small segmented side marks frame the duel without obscuring the central VS.
  block(ctx, 16, 163, 3, 22, '#67829f55');
  block(ctx, 16, 185, 18, 3, '#67829f55');
  block(ctx, 621, 163, 3, 22, '#a56f6355');
  block(ctx, 606, 185, 18, 3, '#a56f6355');
  return layer;
}

/** time is in seconds. Reduced motion also freezes the source sprite animation. */
export function drawJoinDuel(canvas, hero, boss, time = 0, { reducedMotion = false } = {}) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  let layer = duelLayers.get(canvas);
  if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
    layer = createDuelLayer(canvas);
    duelLayers.set(canvas, layer);
  }
  const t = reducedMotion || !Number.isFinite(time) ? 0 : Math.max(0, time);
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, 0, 0);
  ctx.scale(canvas.width / 640, canvas.height / 220);
  const heroBob = reducedMotion ? 0 : Math.round(Math.sin(t * 2.5) * 1.5);
  paintSprite(ctx, hero, preferredHeroFrame(hero), 160, 180 + heroBob, 138, 166);
  paintSprite(ctx, boss, idleFrame(boss, t), 480, 180, 157, 194);

  for (let i = 0; i < 6; i++) {
    const amber = i >= 3;
    const progress = (t * 0.13 + i * 0.193) % 1;
    const x = (amber ? 480 : 160) + [-71, 63, 47][i % 3];
    const y = Math.round(170 - progress * 105);
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.55;
    block(ctx, x, y, 2, 4, amber ? '#f5a796' : '#c3dbf5');
  }
  ctx.restore();
}

// Pixel-art sprites: procedural placeholders + Aseprite sprite sheet loader.
// Every character sheet has the same shape, whether generated or loaded:
// { image, frames: [{x, y, w, h, ox, oy, dur}], anims: {name: {frames, loop}}, pivot: {x, y} }

export const FOX_FRAME = 32;

const FOX_PAL = {
  o: '#3b1f14', O: '#f07b2c', d: '#c4521c', w: '#fff3e0',
  k: '#1a1a1a', e: '#ffffff', p: '#ff9fb2',
};

// Fox faces RIGHT (tail on the left). The game flips it when moving left.
const FOX_HEAD = [
  '.ok..............ko.',
  '.okk............kko.',
  '.oOkk..........kkOo.',
  '.oOOdo........odOOo.',
  '.oOOOdoooooooodOOOo.',
  'oOOOOOOOOOOOOOOOOOOo',
  'oOOOOOOOOOOOOOOOOOOo',
  'oOOekOOOOOOOOOOekOOo',
  'oOOkkOOOOOOOOOOkkOOo',
  'owwkkwOOOOOOOOwkkwwo',
  'owpwwwwwwkkwwwwwwpwo',
  '.owwwwwwwwwwwwwwwwo.',
  '..owwwwwwwwwwwwwwo..',
  '...oowwwwwwwwwwoo...',
  '.....oooooooooo.....',
];

const FOX_HEAD_CLOSED = FOX_HEAD.map((row, r) => {
  if (r < 7 || r > 9) return row;
  const chars = [...row];
  for (const c of [3, 4, 15, 16]) chars[c] = r === 9 ? 'k' : 'O';
  return chars.join('');
});

const FOX_BODY = [
  '....oOOwwwwwwOOo....',
  '...oOOOwwwwwwOOOo...',
  '...oOOOwwwwwwOOOo...',
  '...oOOOOwwwwOOOOo...',
  '...oOOOOOOOOOOOOo...',
  '....oooooooooooo....',
];

const FOX_LEG = ['oddo', 'oddo', 'oddo', 'okko', '.oo.'];

const FOX_TAIL = [
  '..ooo....',
  '.owwwo...',
  'owwwwOo..',
  'oOwwOOOo.',
  'oOOOOOOOo',
  '.oOOOOOdo',
  '..oOOOddo',
  '...ooodo.',
];

// Per-frame pose offsets. Edit these to tweak the placeholder animation.
const FOX_ANIMS = {
  idle: {
    fps: 6, loop: true, frames: [
      { bob: 0, tailDy: 0 },
      { bob: 0, tailDy: -1 },
      { bob: 1, tailDy: 0 },
      { bob: 1, tailDy: 1, eyes: 'closed' },
    ],
  },
  run: {
    fps: 12, loop: true, frames: [
      { bob: 0, legL: [-1, 0], legR: [1, -1], tailDx: 0, tailDy: 0 },
      { bob: -1, legL: [0, -1], legR: [0, 0], tailDx: -1, tailDy: -1 },
      { bob: -1, legL: [1, -1], legR: [-1, 0], tailDx: -1, tailDy: 0 },
      { bob: 0, legL: [1, -1], legR: [-1, 0], tailDx: 0, tailDy: 1 },
      { bob: -1, legL: [0, 0], legR: [0, -1], tailDx: -1, tailDy: 0 },
      { bob: -1, legL: [-1, 0], legR: [1, -1], tailDx: -1, tailDy: -1 },
    ],
  },
  hurt: {
    fps: 10, loop: false, frames: [
      { bob: 0, dx: -1, eyes: 'closed', tint: '#ffffff' },
      { bob: 1, dx: 1, eyes: 'closed', tint: '#ff5050' },
    ],
  },
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

function paint(ctx, grid, x, y, pal) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const color = pal[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}

function silhouette(src, color) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function drawFoxFrame(ctx, ox, oy, f) {
  const bob = f.bob ?? 0;
  const x = ox + (f.dx ?? 0);
  const [lx, ly] = f.legL ?? [0, 0];
  const [rx, ry] = f.legR ?? [0, 0];
  paint(ctx, FOX_TAIL, x + 3 + (f.tailDx ?? 0), oy + 13 + bob + (f.tailDy ?? 0), FOX_PAL);
  paint(ctx, FOX_LEG, x + 13 + lx, oy + 22 + ly, FOX_PAL);
  paint(ctx, FOX_LEG, x + 19 + rx, oy + 22 + ry, FOX_PAL);
  paint(ctx, FOX_BODY, x + 8, oy + 18 + bob, FOX_PAL);
  paint(ctx, f.eyes === 'closed' ? FOX_HEAD_CLOSED : FOX_HEAD, x + 8, oy + 4 + bob, FOX_PAL);
  if (f.tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = f.tint;
    ctx.fillRect(ox, oy, FOX_FRAME, FOX_FRAME);
    ctx.restore();
  }
}

// Placeholder fox: one row per animation, 32x32 frames.
export function buildFoxSheet() {
  const names = Object.keys(FOX_ANIMS);
  const cols = Math.max(...names.map(n => FOX_ANIMS[n].frames.length));
  const image = makeCanvas(cols * FOX_FRAME, names.length * FOX_FRAME);
  const ctx = image.getContext('2d');
  const frames = [];
  const anims = {};
  names.forEach((name, row) => {
    const a = FOX_ANIMS[name];
    anims[name] = { frames: [], loop: a.loop };
    a.frames.forEach((pose, col) => {
      const x = col * FOX_FRAME;
      const y = row * FOX_FRAME;
      drawFoxFrame(ctx, x, y, pose);
      anims[name].frames.push(frames.length);
      frames.push({ x, y, w: FOX_FRAME, h: FOX_FRAME, ox: 0, oy: 0, dur: Math.round(1000 / a.fps) });
    });
  });
  return { image, frames, anims, pivot: { x: 16, y: 27 }, headroom: 23, source: 'procedural' };
}

// Same JSON shape Aseprite writes with --format json-array --list-tags.
export function sheetToAsepriteJson(sheet, imageName) {
  return {
    frames: sheet.frames.map((f, i) => ({
      filename: `fox ${i}.aseprite`,
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
      duration: f.dur,
    })),
    meta: {
      app: 'fox-swarm',
      image: imageName,
      format: 'RGBA8888',
      size: { w: sheet.image.width, h: sheet.image.height },
      scale: '1',
      frameTags: Object.entries(sheet.anims).map(([name, a]) => ({
        name, from: a.frames[0], to: a.frames.at(-1), direction: 'forward',
      })),
    },
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Không load được ảnh ${src}`));
    img.src = src;
  });
}

const ONE_SHOT = new Set(['hurt', 'death', 'attack']);

// Loads a sheet exported from Aseprite:
//   aseprite -b fox.aseprite --sheet assets/fox.png --data assets/fox.json --format json-array --list-tags --list-slices
export async function loadAsepriteSheet(jsonUrl) {
  const res = await fetch(jsonUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${jsonUrl}: HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data.frames) ? data.frames : Object.values(data.frames);
  const image = await loadImage(new URL(data.meta.image, new URL(jsonUrl, location.href)).href);
  const frames = list.map(f => ({
    x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h,
    ox: f.spriteSourceSize?.x ?? 0, oy: f.spriteSourceSize?.y ?? 0,
    dur: f.duration ?? 100,
  }));
  const anims = {};
  for (const tag of data.meta.frameTags ?? []) {
    const idx = [];
    for (let i = tag.from; i <= tag.to; i++) idx.push(i);
    if (tag.direction?.startsWith('reverse') || tag.direction === 'pingpong_reverse') idx.reverse();
    if (tag.direction?.startsWith('pingpong')) idx.push(...idx.slice(1, -1).reverse());
    const name = tag.name.toLowerCase();
    anims[name] = { frames: idx, loop: !ONE_SHOT.has(name) };
  }
  if (!anims.idle) anims.idle = { frames: frames.map((_, i) => i), loop: true };
  const size = list[0].sourceSize ?? { w: frames[0].w, h: frames[0].h };
  const key = data.meta.slices?.find(s => s.name.toLowerCase() === 'pivot')?.keys?.[0];
  const pivot = key?.pivot
    ? { x: key.bounds.x + key.pivot.x, y: key.bounds.y + key.pivot.y }
    : { x: size.w / 2, y: size.h - 1 };
  return { image, frames, anims, pivot, headroom: pivot.y, source: jsonUrl };
}

export class Animator {
  constructor(sheet) {
    this.sheet = sheet;
    this.name = 'idle';
    this.index = 0;
    this.time = 0;
    this.done = false;
  }

  play(name, restart = false) {
    if (!this.sheet.anims[name]) name = 'idle';
    if (name === this.name && !restart) return;
    this.name = name;
    this.index = 0;
    this.time = 0;
    this.done = false;
  }

  get frameIndex() {
    return this.sheet.anims[this.name].frames[this.index];
  }

  update(ms) {
    const anim = this.sheet.anims[this.name];
    if (this.done) return;
    this.time += ms;
    let frame = this.sheet.frames[anim.frames[this.index]];
    while (this.time >= frame.dur) {
      this.time -= frame.dur;
      if (this.index < anim.frames.length - 1) this.index++;
      else if (anim.loop) this.index = 0;
      else { this.done = true; break; }
      frame = this.sheet.frames[anim.frames[this.index]];
    }
  }

  // (x, y) is the pivot point in world space (the character's feet).
  draw(ctx, x, y, flipX = false, frameIndex = this.frameIndex) {
    const { image, frames, pivot } = this.sheet;
    const f = frames[frameIndex];
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(image, f.x, f.y, f.w, f.h, f.ox - pivot.x, f.oy - pivot.y, f.w, f.h);
    ctx.restore();
  }
}

// ---- Grid sprite sheets (e.g. AI-generated PNG) -----------------------------
// Uniform cols×rows grid on a transparent background. The art is not on a real pixel grid,
// so each cell is downscaled once with high-quality smoothing to `size` px wide (height keeps
// the cell's aspect ratio), then drawn 1:1.
export async function loadGridSheet(url, { cols, rows, size, pivot, anims }) {
  const src = await loadImage(url);
  const cellW = src.naturalWidth / cols;
  const cellH = src.naturalHeight / rows;
  const fw = size;
  const fh = Math.round((size * cellH) / cellW);
  const image = document.createElement('canvas');
  image.width = cols * fw;
  image.height = rows * fh;
  const g = image.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const frames = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.drawImage(src, c * cellW, r * cellH, cellW, cellH, c * fw, r * fh, fw, fh);
      frames.push({ x: c * fw, y: r * fh, w: fw, h: fh, ox: 0, oy: 0, dur: 100 });
    }
  }
  const out = {};
  for (const [name, a] of Object.entries(anims)) out[name] = { frames: a.frames, fps: a.fps ?? 8, loop: a.loop ?? true };
  // Visible art height inside a cell, unioned over every frame: what callers scale the sprite by.
  const data = g.getImageData(0, 0, image.width, image.height).data;
  let top = fh;
  let bottom = -1;
  for (const f of frames) {
    for (let r = 0; r < f.h; r++) {
      let opaque = false;
      for (let c = 0; c < f.w && !opaque; c++) opaque = data[((f.y + r) * image.width + f.x + c) * 4 + 3] > 0;
      if (!opaque) continue;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
    }
  }
  return {
    image, frames, anims: out,
    pivot: { x: fw * pivot.x, y: fh * pivot.y },
    headroom: bottom + 1 - top,
    hurtImage: tinted(image, 'rgba(255, 60, 60, 0.55)'),
    flashImage: silhouette(image, '#ffffff'),
    source: url,
  };
}

// Splits a grid sheet into a static base layer and a movable layer (e.g. a turret barrel that
// swivels). `zones` are non-overlapping rectangles in frame fractions {x0, x1, y0, y1}; the pixels
// inside them move from the base to the movable layer, in every frame.
export function splitGridSheet(sheet, zones) {
  const base = makeCanvas(sheet.image.width, sheet.image.height);
  const part = makeCanvas(sheet.image.width, sheet.image.height);
  const gb = base.getContext('2d');
  const gp = part.getContext('2d');
  gb.drawImage(sheet.image, 0, 0);
  for (const f of sheet.frames) {
    for (const z of zones) {
      // Rounded edges so adjacent zones share a boundary instead of overlapping by a pixel.
      const x = f.x + Math.round(z.x0 * f.w);
      const y = f.y + Math.round(z.y0 * f.h);
      const w = f.x + Math.round(z.x1 * f.w) - x;
      const h = f.y + Math.round(z.y1 * f.h) - y;
      gp.drawImage(sheet.image, x, y, w, h, x, y, w, h);
      gb.clearRect(x, y, w, h);
    }
  }
  const layer = image => ({ image, hurtImage: tinted(image, 'rgba(255, 60, 60, 0.55)') });
  return { base: layer(base), part: layer(part) };
}

// ---- SVG sprite strips (e.g. Canva exports) --------------------------------
// The SVG embeds an upscaled pixel-art bitmap (+ an optional luminance <mask> for
// transparency) laid out as a horizontal strip of square frames. We read the
// bitmap directly, detect the upscale factor and resample to 1 art pixel = 1 game pixel.

function svgHref(el) {
  return el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
}

function pixelsOf(img, w, h) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

function tinted(src, color) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Maps image pixels to SVG user units: X = tx + px * sx (translate/scale/matrix only).
function imagePlacement(el, naturalW, naturalH) {
  let sx = Number(el.getAttribute('width') ?? naturalW) / naturalW;
  let sy = Number(el.getAttribute('height') ?? naturalH) / naturalH;
  let tx = Number(el.getAttribute('x') ?? 0);
  let ty = Number(el.getAttribute('y') ?? 0);
  for (let node = el.parentElement; node && node.tagName !== 'svg'; node = node.parentElement) {
    const t = node.getAttribute('transform');
    if (!t) continue;
    for (const [, fn, args] of t.matchAll(/(matrix|translate|scale)\(([^)]*)\)/g)) {
      const n = args.split(/[\s,]+/).filter(Boolean).map(Number);
      const [a, d, e, f] = fn === 'matrix' ? [n[0], n[3], n[4], n[5]]
        : fn === 'translate' ? [1, 1, n[0], n[1] ?? 0]
        : [n[0], n[1] ?? n[0], 0, 0];
      tx = a * tx + e;
      ty = d * ty + f;
      sx *= a;
      sy *= d;
    }
  }
  return { sx, sy, tx, ty };
}

// Finds the upscale factor k (and grid phase) that most colour edges line up with.
function detectGrid(rgba, w, h) {
  const edgeAt = (i, j) => Math.abs(rgba[i] - rgba[j]) + Math.abs(rgba[i + 1] - rgba[j + 1]) +
    Math.abs(rgba[i + 2] - rgba[j + 2]) + Math.abs(rgba[i + 3] - rgba[j + 3]) > 60;
  const scan = horizontal => {
    const counts = Array.from({ length: 9 }, (_, k) => new Array(k).fill(0));
    let edges = 0;
    const [outer, inner] = horizontal ? [h, w] : [w, h];
    const step = Math.max(1, Math.floor(outer / 200));
    for (let a = 0; a < outer; a += step) {
      for (let b = 1; b < inner; b++) {
        const i = (horizontal ? a * w + b : b * w + a) * 4;
        const j = (horizontal ? a * w + b - 1 : (b - 1) * w + a) * 4;
        if (!edgeAt(i, j)) continue;
        edges++;
        for (let k = 2; k <= 8; k++) counts[k][b % k]++;
      }
    }
    return { counts, edges };
  };
  const hx = scan(true);
  const vy = scan(false);
  // Score = how much better than chance (1/k) the edges line up; the true factor wins.
  let best = { k: 1, px: 0, py: 0, score: 0.25 };
  for (let k = 2; k <= 8; k++) {
    const bestX = Math.max(...hx.counts[k]);
    const bestY = Math.max(...vy.counts[k]);
    const score = Math.min(bestX / (hx.edges || 1), bestY / (vy.edges || 1)) - 1 / k;
    if (score > best.score) best = { k, px: hx.counts[k].indexOf(bestX), py: vy.counts[k].indexOf(bestY), score };
  }
  return best;
}

// views: frame names in order for directional sprites (e.g. a 360° turnaround);
// otherwise every frame becomes one looping animation called `name`.
export async function loadSvgStrip(url, { views = null, name = 'idle', fps = 8, pixel = 0 } = {}) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  const [vbX, vbY, vbW, vbH] = (svg.getAttribute('viewBox') ?? `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`)
    .split(/[\s,]+/).map(Number);
  const images = [...doc.getElementsByTagName('image')];
  const colorEl = images.find(el => !el.closest('mask'));
  const maskEl = images.find(el => el.closest('mask'));
  if (!colorEl) throw new Error(`${url}: SVG không có <image> bitmap bên trong`);

  const color = await loadImage(svgHref(colorEl));
  const w = color.naturalWidth;
  const h = color.naturalHeight;
  const rgba = pixelsOf(color, w, h);
  if (maskEl) {
    const mask = pixelsOf(await loadImage(svgHref(maskEl)), w, h);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = (mask[i] * mask[i + 3]) / 255 >= 128 ? 255 : 0;
  } else {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] >= 128 ? 255 : 0;
  }

  const place = imagePlacement(colorEl, w, h);
  const grid = pixel ? { k: pixel, px: 0, py: 0 } : detectGrid(rgba, w, h);
  const k = grid.k;
  const frameCount = Math.round(vbW / vbH);
  const size = Math.round(vbH / place.sx / k);
  const rows = Math.round(vbH / place.sy / k);
  const image = makeCanvas(size * frameCount, rows);
  const g = image.getContext('2d');
  const out = g.createImageData(image.width, rows);
  const snap = (v, phase) => Math.round(v) + (((phase - Math.round(v)) % k) + k) % k;
  for (let f = 0; f < frameCount; f++) {
    const x0 = snap((vbX + f * vbH - place.tx) / place.sx, grid.px);
    const y0 = snap((vbY - place.ty) / place.sy, grid.py);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < size; c++) {
        const ix = x0 + c * k + (k >> 1);
        const iy = y0 + r * k + (k >> 1);
        if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
        const si = (iy * w + ix) * 4;
        out.data.set(rgba.subarray(si, si + 4), (r * image.width + f * size + c) * 4);
      }
    }
  }
  g.putImageData(out, 0, 0);

  let top = rows;
  let bottom = -1;
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < image.width; x++) {
      if (!out.data[(r * image.width + x) * 4 + 3]) continue;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
    }
  }

  const frames = Array.from({ length: frameCount }, (_, f) => ({
    x: f * size, y: 0, w: size, h: rows, ox: 0, oy: 0, dur: Math.round(1000 / fps),
  }));
  const anims = views
    ? Object.fromEntries(views.slice(0, frameCount).map((v, i) => [v, { frames: [i], loop: true }]))
    : { [name]: { frames: frames.map((_, i) => i), loop: true } };
  return {
    image, frames, anims, views,
    pivot: { x: size / 2, y: bottom + 1 },
    headroom: bottom + 1 - top,
    hurtImage: tinted(image, 'rgba(255, 70, 70, 0.55)'),
    flashImage: silhouette(image, '#ffffff'),
    pixelScale: k,
    source: url,
  };
}

// For single-frame-per-direction sheets: picks the view from the movement
// direction and adds a small bob so running/idle still read as motion.
export class DirectionalAnimator {
  constructor(sheet) {
    this.sheet = sheet;
    this.name = 'idle';
    this.time = 0;
    this.facing = 1;
    this.view = sheet.views[0];
  }

  play(name) {
    if (name === this.name) return;
    this.name = name;
    this.time = 0;
  }

  face(vx, vy) {
    if (Math.hypot(vx, vy) < 12) return;
    if (Math.abs(vx) > 4) this.facing = Math.sign(vx);
    const side = this.facing > 0 ? 'right' : 'left';
    const sector = (Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8;
    const candidates = [
      ['right'], ['down-right', 'right'], ['down', `down-${side}`], ['down-left', 'left'],
      ['left'], ['up-left', 'up', 'left'], ['up', `up-${side}`], ['up-right', 'up', 'right'],
    ][sector];
    this.view = candidates.find(v => this.sheet.anims[v]) ?? this.view;
  }

  update(ms) {
    this.time += ms;
  }

  get index() {
    return this.view;
  }

  get frameIndex() {
    return this.sheet.anims[this.view].frames[0];
  }

  get bob() {
    if (this.name === 'run') return [0, -1, -2, -1][Math.floor(this.time / 80) % 4];
    if (this.name === 'idle') return Math.floor(this.time / 450) % 2 ? -1 : 0;
    return 0;
  }

  draw(ctx, x, y, _flipX = false, frameIndex = this.frameIndex) {
    const { frames, pivot } = this.sheet;
    const image = this.name === 'hurt' ? this.sheet.hurtImage : this.sheet.image;
    const f = frames[frameIndex];
    ctx.drawImage(image, f.x, f.y, f.w, f.h, Math.round(x - pivot.x), Math.round(y - pivot.y + this.bob), f.w, f.h);
  }
}

// ---- Enemies ---------------------------------------------------------------

const SLIME = [
  '....oooooo....',
  '..ooLLLLLLoo..',
  '.oLeeLLLLLLLo.',
  '.oLeLLLLLLLLo.',
  'oLLLkLLLLkLLLo',
  'oLLLkLLLLkLLLo',
  'oLLLLLLLLLLLLo',
  'oDLLLLLLLLLLDo',
  '.oDDDDDDDDDDo.',
  '..oooooooooo..',
];
const SLIME_SQUASH = SLIME.filter((_, i) => i !== 3);

const SLIME_COLORS = {
  slimeGreen: { L: '#7ed957', D: '#3f9b3a', e: '#e8ffd8' },
  slimePurple: { L: '#b06cff', D: '#6b3bb8', e: '#f0e0ff' },
  slimeBlue: { L: '#5ad1ff', D: '#2a7fb8', e: '#e0f7ff' },
  slimeRed: { L: '#ff6b6b', D: '#b83b3b', e: '#ffe0e0' },
};

// Wings up / wings down. Bats hover, so they are painted high in the cell.
const BAT_A = [
  '.oo........oo.',
  'oWWo.oooo.oWWo',
  'oWWWoobbooWWWo',
  '.oWWWbeebWWWo.',
  '..oWWbbbbWWo..',
  '...oobbbboo...',
  '.....obbo.....',
  '......oo......',
];
const BAT_B = [
  '..............',
  'oWo........oWo',
  'oWWo.oooo.oWWo',
  'oWWWoobbooWWWo',
  '.oWWWbeebWWWo.',
  '..oWWbbbbWWo..',
  '...oobbbboo...',
  '.....obbo.....',
];
const BAT_PAL = { o: '#180f22', W: '#6b4a8f', b: '#3b2352', e: '#ff5a5a' };

// A drifting flame-ghost: no legs, a tail that flickers between the two frames.
const WISP_A = [
  '....oooo....',
  '..ooWWWWoo..',
  '.oWWWWWWWWo.',
  'oWWeeWWeeWWo',
  'oWWeeWWeeWWo',
  'oWWWWWWWWWWo',
  '.oWWWWWWWWo.',
  '..oWWWWWWo..',
  '...ooWWoo...',
  '..o.oWWo.o..',
];
const WISP_B = [
  '....oooo....',
  '..ooWWWWoo..',
  '.oWWWWWWWWo.',
  'oWWeeWWeeWWo',
  'oWWeeWWeeWWo',
  'oWWWWWWWWWWo',
  '.oWWWWWWWWo.',
  '..oWWWWWWo..',
  '...oWWWWo...',
  '..oo.oo.oo..',
];
const WISP_PAL = { o: '#0d2a33', W: '#7df6ff', e: '#0a3a44' };

// Side-on tusked hog facing right: humped back, snout poking out, one tusk under the eye.
// Frame B only swaps the legs — the charge wind-up is what sells the animation, not the walk.
const BOAR_A = [
  '...ooooooo......',
  '..oBBBBBBBoo....',
  '.oBBBBBBBBBBoo..',
  '.oBBBBBBBBBBBBo.',
  'oBBBBBBBBBBeBBSo',
  'oBBBBBBBBBBBBSSo',
  'oBBBBBBBBBBBWSSo',
  '.oBBBBBBBBBBBBo.',
  '.obbo.obbo......',
  '..oo...oo.......',
];
const BOAR_B = [
  ...BOAR_A.slice(0, 8),
  '..obbo.obbo.....',
  '...oo...oo......',
];
const BOAR_PAL = { o: '#2a1a10', B: '#a9743f', b: '#6b4423', S: '#d99a63', W: '#fff3e0', e: '#ff5a5a' };

// Squat spitter with eyes on top; frame B is the squash before the spit.
const TOAD_A = [
  '..oo........oo..',
  '.oGGo......oGGo.',
  '.oGeGGGGGGGeGo..',
  '.oGGGGGGGGGGGGo.',
  'oGGGGGGGGGGGGGGo',
  'oGGkkkkkkkkkkGGo',
  'oGGGGGGGGGGGGGGo',
  '.oDDGGGGGGGGDDo.',
  '..oDDDDDDDDDDo..',
  '...oooooooooo...',
];
const TOAD_B = TOAD_A.filter((_, i) => i !== 3);
const TOAD_PAL = { o: '#1e2a10', G: '#8ec63f', D: '#5a8a28', e: '#2a3a14', k: '#3c2a12' };

// Walking mine. The fuse is the only thing that moves.
const PUFF_A = [
  '.....ff.....',
  '....oPPo....',
  '..ooPPPPoo..',
  '.oPPPPPPPPo.',
  'oPPeePPeePPo',
  'oPPPPPPPPPPo',
  'oPPPPkkPPPPo',
  '.oPPPPPPPPo.',
  '..ooPPPPoo..',
  '....oooo....',
];
const PUFF_B = [
  '....f.f.....',
  '....oPPo....',
  '..ooPPPPoo..',
  '.oPPPPPPPPo.',
  'oPPeePPeePPo',
  'oPPPPPPPPPPo',
  'oPPPPkkPPPPo',
  '.oPPPPPPPPo.',
  '..ooPPPPoo..',
  '....oooo....',
];
const PUFF_PAL = { o: '#2a1508', P: '#ff9f4a', k: '#3a2010', e: '#fff3e0', f: '#ffd23f' };

// One humanoid grid for the whole bandit family — hat, masked face, tunic, boots. Only the
// palette changes between a grunt, an archer, the treasure runner, the brute and the captain.
const BANDIT_A = [
  '...oooooo...',
  '..oHHHHHHo..',
  '.oHHHHHHHHo.',
  '.oSSSSSSSSo.',
  '.oSkSSSSkSo.',
  '.oMMMMMMMMo.',
  '..oMMMMMMo..',
  '.oBBBBBBBBo.',
  'oBBBBBBBBBBo',
  'oBBBBBBBBBBo',
  'oBBBBBBBBBBo',
  '.oBBBBBBBBo.',
  '.oLLo..oLLo.',
  '.oooo..oooo.',
];
const BANDIT_B = [
  ...BANDIT_A.slice(0, 12),
  '..oLLoLLo...',
  '..ooooooo...',
];
const BANDIT_PALS = {
  bandit: { o: '#1d1108', H: '#5a3a24', S: '#e8b088', k: '#241a12', M: '#c94f3a', B: '#7a4a2e', L: '#3f2a1c' },
  archer: { o: '#101c12', H: '#2f4a2a', S: '#e8b088', k: '#241a12', M: '#3f9b5a', B: '#40603a', L: '#26361f' },
  mule: { o: '#2a1e06', H: '#8a6a1a', S: '#e8b088', k: '#241a12', M: '#ffd23f', B: '#c58f2a', L: '#5e4413' },
  brute: { o: '#240c0c', H: '#3a1f1f', S: '#e0a07a', k: '#1a1010', M: '#d8d8d8', B: '#8c2f2f', L: '#4a1c1c' },
  captain: { o: '#180f2a', H: '#2a1a4a', S: '#e8b088', k: '#1a1030', M: '#ffd23f', B: '#5a3f8c', L: '#31215c' },
};

// Every enemy sheet is 16×16 with the feet at y = 15, so swarm.js can draw them all the same way:
// frames to animate, flash for the hit blink, frost for the slowed-down tint.
// One row per enemy sheet: the two frames with the y they sit at, the palette, the x inset, and
// the colour the game throws around as particles when the thing dies.
const CRITTERS = {
  ...Object.fromEntries(Object.entries(SLIME_COLORS).map(([key, colors]) => [key, {
    frames: [[SLIME, 5], [SLIME_SQUASH, 6]], pal: { o: '#221428', k: '#140a1a', ...colors }, x: 1, color: colors.L,
  }])),
  bat: { frames: [[BAT_A, 3], [BAT_B, 3]], pal: BAT_PAL, x: 1, color: '#8d6bb5' },
  wisp: { frames: [[WISP_A, 3], [WISP_B, 3]], pal: WISP_PAL, x: 2, color: '#7df6ff' },
  boar: { frames: [[BOAR_A, 5], [BOAR_B, 5]], pal: BOAR_PAL, x: 0, color: '#a9743f' },
  toad: { frames: [[TOAD_A, 5], [TOAD_B, 6]], pal: TOAD_PAL, x: 0, color: '#8ec63f' },
  puff: { frames: [[PUFF_A, 5], [PUFF_B, 5]], pal: PUFF_PAL, x: 2, color: '#ff9f4a' },
  ...Object.fromEntries(Object.entries(BANDIT_PALS).map(([key, pal]) => [key, {
    frames: [[BANDIT_A, 1], [BANDIT_B, 1]], pal, x: 2, color: pal.M,
  }])),
};

// What ENEMY_TYPES.art is allowed to name. Exported so a test can catch a typo without a canvas.
export const ENEMY_ART_KEYS = Object.keys(CRITTERS);

export function buildEnemyArt() {
  const out = {};
  for (const [key, c] of Object.entries(CRITTERS)) {
    const frames = c.frames.map(([grid, y]) => {
      const canvas = makeCanvas(16, 16);
      paint(canvas.getContext('2d'), grid, c.x, y, c.pal);
      return canvas;
    });
    out[key] = {
      frames,
      flash: frames.map(f => silhouette(f, '#ffffff')),
      frost: frames.map(f => silhouette(f, '#9fe8ff')),
      color: c.color,
    };
  }
  return out;
}

// Every grid row has to be the same length or paint() quietly drops pixels off the short rows.
export function raggedGrids() {
  const bad = [];
  for (const [key, c] of Object.entries(CRITTERS)) {
    for (const [grid] of c.frames) {
      const w = grid[0].length;
      if (grid.some(row => row.length !== w)) bad.push(key);
    }
  }
  for (const [key, [grid]] of Object.entries(PICKUPS)) {
    const w = grid[0].length;
    if (grid.some(row => row.length !== w)) bad.push(key);
  }
  return [...new Set(bad)];
}

// ---- Pickups ---------------------------------------------------------------

const HEART = [
  '.oo...oo.',
  'oRRo.oRRo',
  'oRRRoRRRo',
  'oRRRRRRRo',
  '.oRRRRRo.',
  '..oRRRo..',
  '...oRo...',
  '....o....',
];
const COIN = [
  '..oooo..',
  '.oGGGGo.',
  'oGGYYGGo',
  'oGYYYYGo',
  'oGYYYYGo',
  'oGGYYGGo',
  '.oGGGGo.',
  '..oooo..',
];
const MAGNET = [
  '.oo....oo.',
  'oMMo..oMMo',
  'oMMo..oMMo',
  'oMMo..oMMo',
  'oMMooooMMo',
  'oMMMMMMMMo',
  'oMMMMMMMMo',
  '.oMMMMMMo.',
  '..oooooo..',
];
const BOMB = [
  '........f.',
  '.......f..',
  '..oooo.f..',
  '.oBBBBoo..',
  'oBBwBBBBo.',
  'oBBBBBBBo.',
  'oBBBBBBBo.',
  '.oBBBBBo..',
  '..ooooo...',
];
const CHEST = [
  '.oooooooooo.',
  '.oGGGGGGGGo.',
  '.oGkkkkkkGo.',
  '.oooooooooo.',
  '.oWWWWWWWWo.',
  '.oWWWkkWWWo.',
  '.oWWWkkWWWo.',
  '.oWWWWWWWWo.',
  '.oooooooooo.',
];

const PICKUPS = {
  heart: [HEART, { o: '#3a0d14', R: '#ff5a6e' }],
  coin: [COIN, { o: '#5a3a06', G: '#c28100', Y: '#ffd23f' }],
  magnet: [MAGNET, { o: '#0d2436', M: '#5ad1ff' }],
  bomb: [BOMB, { o: '#10131c', B: '#39415a', w: '#c9d1e0', f: '#ffd23f' }],
  chest: [CHEST, { o: '#2a1a06', G: '#c28100', W: '#8a5a1e', k: '#ffd23f' }],
};

export function buildPickupArt() {
  const out = {};
  for (const [key, [grid, pal]] of Object.entries(PICKUPS)) {
    const c = makeCanvas(grid[0].length, grid.length);
    paint(c.getContext('2d'), grid, 0, 0, pal);
    out[key] = c;
  }
  return out;
}

// ---- Environment -----------------------------------------------------------

const ROCK = [
  '.....oooooo.....',
  '...ooggggggoo...',
  '..oggGGggggggo..',
  '.ogGGgggggggggo.',
  '.oggggggggggggo.',
  'oggggggggggggsgo',
  'ogsggggggggsssgo',
  '.ossggggggsssso.',
  '..oooooooooooo..',
];
const ROCK_PAL = { o: '#2a2a36', g: '#8a8f9e', G: '#c3c7d1', s: '#5d6170' };

const BUSH = [
  '.......oooooo.......',
  '....oooLLLLLLooo....',
  '...oLLLLLLLLLLLLo...',
  '..oLLlLLLLLLLlLLLo..',
  '.oLLlllLLLLLLllLLLo.',
  '.oLLLLLLLLLLLLLLLLo.',
  'oDLLLLLLLlLLLLLLLLDo',
  'oDLLLLLLlllLLLLLLLDo',
  'oDDLLLLLLLLLLLLLLDDo',
  '.oDDLLLLLLLLLLLLDDo.',
  '..oDDDDLLLLLLDDDDo..',
  '...ooDDDDDDDDDDoo...',
  '.....oooooooooo.....',
  '........oTTo........',
  '........oTTo........',
  '.......oooooo.......',
];
const BUSH_PAL = { o: '#173a22', L: '#4fae4a', l: '#7fd66b', D: '#2f7a3a', T: '#7a4a2a' };

// A real tree: trunk, root flare, and a canopy with a lit top-left and a shaded underside.
// The old one was the bush canvas drawn at 2x, which is why a quarter of the props used to be a
// blurry copy of the prop standing next to them.
const TREE = [
  '.......oooooo.......',
  '.....ooLLLLLLoo.....',
  '...ooLLLLLLLLLLoo...',
  '..oLLLLLlllLLLLLLo..',
  '.oLLLLlllllllLLLLLo.',
  '.oLLLlllllllllLLLLo.',
  'oLLLLlllllllllLLLLLo',
  'oLLLLLlllllllLLLLLLo',
  'oDLLLLLlllllLLLLLLDo',
  'oDDLLLLLLLLLLLLLLDDo',
  'oDDDLLLLLLLLLLLLDDDo',
  '.oDDDDLLLLLLLLDDDDo.',
  '.oDDDDDDLLLLDDDDDDo.',
  '..oDDDDDDDDDDDDDDo..',
  '...ooDDDDDDDDDDoo...',
  '.....oooTTTToo......',
  '........oTTo........',
  '........oTTo........',
  '.......oTTTTo.......',
  '......ooTTTTToo.....',
  '.....oRRoooooRRo....',
  '.....oooo...oooo....',
];
const TREE_PAL = { o: '#14301c', L: '#3f8f3c', l: '#63c057', D: '#255c2c', T: '#6b4526', R: '#4a2f1a' };

// A narrow conifer, so a stand of trees has more than one silhouette in it.
const PINE = [
  '........oo........',
  '.......oPPo.......',
  '......oPPPPo......',
  '.....oPppPPPo.....',
  '....oPPppPPPPo....',
  '...oPPPppPPPPPo...',
  '.....oPPPPPPo.....',
  '....oPPPppPPPo....',
  '...oPPPppPPPPPo...',
  '..oPPPPppPPPPPPo..',
  '....oPPPPPPPPo....',
  '...oPPPppPPPPPo...',
  '..oPPPPppPPPPPPo..',
  '.oPPPPPppPPPPPPPo.',
  '..ooPPPPPPPPPPoo..',
  '.....oooTToo......',
  '........TT........',
  '.......oTTo.......',
  '......ooooooo.....',
];
const PINE_PAL = { o: '#10261a', P: '#2f6f3f', p: '#4a9455', T: '#4a2f1a' };

// A cluster, not the single grey blob that used to be 35% of every prop on screen.
const BOULDER = [
  '....oooooo....',
  '..ooggGGggoo..',
  '.oggGGGGggsgo.',
  'oggGGGgggssggo',
  'oggggggggsssgo',
  'ogsggggggsssgo',
  '.osssgggsssso.',
  '..oossssssoo..',
  '...oooooooo...',
];
const STUMP = [
  '..oooooo..',
  '.oTTTTTTo.',
  'oTtttttTTo',
  'oTtRRRtTTo',
  'oTtttttTTo',
  'oTTTTTTTTo',
  '.oTTTTTTo.',
  '..oooooo..',
];
const STUMP_PAL = { o: '#2a1a0e', T: '#6b4526', t: '#8a5c33', R: '#4a2f1a' };

const MUSHROOM = [
  '..oooo..',
  '.oRRRRo.',
  'oRRwRRRo',
  'oRRRRwRo',
  '.oooooo.',
  '..oWWo..',
  '..oWWo..',
  '.oooooo.',
];
const MUSHROOM_PAL = { o: '#3a1218', R: '#c9424a', w: '#f2e2d0', W: '#e8dcc6' };

function fromGrid(grid, pal) {
  const c = makeCanvas(grid[0].length, grid.length);
  paint(c.getContext('2d'), grid, 0, 0, pal);
  return c;
}

// Baked drop shadow: the prop's own silhouette, squashed and darkened, so every shadow on the
// field shares one light direction instead of being an anti-aliased ellipse sized off the canvas.
function bakeShadow(img) {
  const h = Math.max(3, Math.round(img.height * 0.28));
  const c = makeCanvas(img.width, h);
  const g = c.getContext('2d');
  g.globalAlpha = 0.3;
  g.drawImage(silhouette(img, '#0d1a12'), 0, 0, img.width, h);
  return c;
}

export function buildProps() {
  const art = {
    rock: { img: fromGrid(ROCK, ROCK_PAL), r: 7 },
    boulder: { img: fromGrid(BOULDER, ROCK_PAL), r: 8 },
    bush: { img: fromGrid(BUSH, BUSH_PAL), r: 4 },
    tree: { img: fromGrid(TREE, TREE_PAL), r: 5 },
    pine: { img: fromGrid(PINE, PINE_PAL), r: 5 },
    stump: { img: fromGrid(STUMP, STUMP_PAL), r: 5 },
    mushroom: { img: fromGrid(MUSHROOM, MUSHROOM_PAL), r: 3 },
  };
  for (const p of Object.values(art)) p.shadow = bakeShadow(p.img);
  return art;
}

// ---- Terrain ---------------------------------------------------------------
// Four ground materials the world is painted from. Each is a flat base plus speckle, so a baked
// chunk can blend two of them through a dither mask and still land on whole pixels.
export const MATERIALS = [
  { key: 'meadow', base: '#5da84a', dark: '#4f9a3e', light: '#6bb857', speck: '#478c38' },
  { key: 'moss', base: '#48924a', dark: '#3a7b40', light: '#5fae5c', speck: '#2f6b38' },
  { key: 'dirt', base: '#8a7047', dark: '#755d3a', light: '#9d8256', speck: '#634d2f' },
  { key: 'shale', base: '#6f7386', dark: '#5c6072', light: '#848a9c', speck: '#4a4e5e' },
];

// 4x4 ordered-dither thresholds, used to break the boundary between two materials into pixel
// stipple instead of the soft alpha ramp a gradient would give.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Little things stamped into the baked ground: hundreds per screen at zero per-frame cost.
const SCATTER = {
  pebble: ['.oo.', 'oGGo', 'oGgo', '.oo.'],
  twig: ['..oo', '.oT.', 'oT..', 'o...'],
  blade: ['.o.', 'oLo', 'oLo', '.o.'],
  flower: ['.F.', 'FYF', '.F.'],
  bone: ['o.o', 'oWo', '.W.', 'oWo'],
  crack: ['o...', '.oo.', '..o.', '..oo'],
};
const SCATTER_PAL = {
  o: 'rgba(30,38,28,0.45)', G: '#8d93a2', g: '#6a7080', T: '#6b4a2a',
  L: '#7fd66b', F: '#e8e3a0', Y: '#e8a53a', W: '#d8d4c4',
};

function stampScatter(g, kind, x, y, rng) {
  const grid = SCATTER[kind];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const color = SCATTER_PAL[grid[r][c]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x + c, y + r, 1, 1);
    }
  }
  void rng;
}

// Bakes one chunk of terrain into a single canvas, `size` tiles square at 32px per tile.
//
// Material is sampled per 2x2 pixel block rather than per tile, which is the whole trick: a
// tile-resolution material map can only produce 32px staircase edges no amount of dithering
// hides, while sampling at 2px lets the noise itself draw the coastline. The ordered dither is
// then only applied in the narrow band where two materials are close, to stipple the seam.
export function bakeChunk(size, tiles, materialAtPx, rng) {
  const px = size * 32;
  const originX = tiles.x * 32;
  const originY = tiles.y * 32;
  const c = makeCanvas(px, px);
  const g = c.getContext('2d');
  const B = 2;

  for (let y = 0; y < px; y += B) {
    for (let x = 0; x < px; x += B) {
      const wx = originX + x;
      const wy = originY + y;
      const s = materialAtPx(wx, wy);
      let m = MATERIALS[s.index];
      // Inside the transition band, stipple the two materials together through the Bayer matrix.
      if (s.other >= 0 && s.edge < 1) {
        const cover = (1 - s.edge) * 16;
        if (BAYER[(y >> 1) & 3][(x >> 1) & 3] < cover) m = MATERIALS[s.other];
      }
      const r = rng();
      g.fillStyle = r < 0.16 ? m.dark : r < 0.3 ? m.light : m.base;
      g.fillRect(x, y, B, B);
    }
  }

  // Single-pixel speckle on top, so the 2px blocks do not read as a grid of their own.
  for (let n = 0; n < px * 3; n++) {
    const x = (rng() * px) | 0;
    const y = (rng() * px) | 0;
    const m = MATERIALS[materialAtPx(originX + x, originY + y).index];
    g.fillStyle = rng() < 0.5 ? m.speck : m.light;
    g.fillRect(x, y, 1, 1);
  }

  // Scatter last, in chunk space so it straddles tile seams — which is what finally stops the
  // 32px lattice of the old tile set from reading at all.
  const count = 30 + ((rng() * 20) | 0);
  for (let i = 0; i < count; i++) {
    const x = (rng() * (px - 4)) | 0;
    const y = (rng() * (px - 4)) | 0;
    const mat = MATERIALS[materialAtPx(originX + x, originY + y).index].key;
    // Bones and cracks belong on stone and dirt, blades and flowers on the green.
    const pool = mat === 'shale' ? ['pebble', 'crack', 'bone'] :
      mat === 'dirt' ? ['pebble', 'twig', 'crack', 'bone'] : ['blade', 'blade', 'flower', 'twig', 'pebble'];
    stampScatter(g, pool[(rng() * pool.length) | 0], x, y, rng);
  }
  return c;
}


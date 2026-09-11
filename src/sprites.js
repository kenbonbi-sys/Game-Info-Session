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
  return {
    image, frames, anims: out,
    pivot: { x: fw * pivot.x, y: fh * pivot.y },
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
  green: { L: '#7ed957', D: '#3f9b3a', e: '#e8ffd8' },
  purple: { L: '#b06cff', D: '#6b3bb8', e: '#f0e0ff' },
  red: { L: '#ff6b6b', D: '#b83b3b', e: '#ffe0e0' },
};

// 16x16 frames, feet at y = 15.
export function buildSlimeArt() {
  const out = {};
  for (const [type, colors] of Object.entries(SLIME_COLORS)) {
    const pal = { o: '#221428', k: '#140a1a', ...colors };
    const frames = [[SLIME, 5], [SLIME_SQUASH, 6]].map(([grid, y]) => {
      const c = makeCanvas(16, 16);
      paint(c.getContext('2d'), grid, 1, y, pal);
      return c;
    });
    out[type] = { frames, flash: frames.map(f => silhouette(f, '#ffffff')), color: colors.L };
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

export function buildProps() {
  const rock = makeCanvas(16, 9);
  paint(rock.getContext('2d'), ROCK, 0, 0, ROCK_PAL);
  const bush = makeCanvas(20, 16);
  paint(bush.getContext('2d'), BUSH, 0, 0, BUSH_PAL);
  const tree = makeCanvas(40, 32);
  tree.getContext('2d').drawImage(bush, 0, 0, 40, 32);
  return {
    rock: { img: rock, r: 7 },
    bush: { img: bush, r: 3 },
    tree: { img: tree, r: 6 },
  };
}

export function buildGrassTiles(rng) {
  const tiles = [];
  for (let i = 0; i < 6; i++) {
    const c = makeCanvas(32, 32);
    const g = c.getContext('2d');
    g.fillStyle = '#5da84a';
    g.fillRect(0, 0, 32, 32);
    for (let n = 0; n < 26; n++) {
      g.fillStyle = rng() < 0.5 ? '#4f9a3e' : '#6bb857';
      g.fillRect(Math.floor(rng() * 32), Math.floor(rng() * 32), 1, 1);
    }
    if (rng() < 0.6) {
      const x = 2 + Math.floor(rng() * 26);
      const y = 3 + Math.floor(rng() * 26);
      g.fillStyle = '#478c38';
      g.fillRect(x, y, 1, 2);
      g.fillRect(x + 2, y, 1, 2);
      g.fillRect(x + 1, y - 1, 1, 3);
    }
    if (rng() < 0.25) {
      const x = 2 + Math.floor(rng() * 28);
      const y = 2 + Math.floor(rng() * 28);
      g.fillStyle = rng() < 0.5 ? '#fff4a8' : '#ffd1e8';
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = '#e8a53a';
      g.fillRect(x, y, 1, 1);
    }
    tiles.push(c);
  }
  return tiles;
}

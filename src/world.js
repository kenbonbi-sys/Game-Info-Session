// Input, RNG, spatial hashing and the map (baked terrain chunks + props with colliders).
import { bakeChunk, buildProps, MATERIALS } from './sprites.js';

export const Input = {
  down: new Set(),
  pressed: new Set(),

  init() {
    const clearKeys = () => {
      this.down.clear();
      this.pressed.clear();
    };
    addEventListener('keydown', e => {
      const target = e.target;
      if (target instanceof Element && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearKeys();
    });
  },

  axis() {
    const d = this.down;
    const x = (d.has('KeyD') || d.has('ArrowRight') ? 1 : 0) - (d.has('KeyA') || d.has('ArrowLeft') ? 1 : 0);
    const y = (d.has('KeyS') || d.has('ArrowDown') ? 1 : 0) - (d.has('KeyW') || d.has('ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  },

  hit(code) {
    return this.pressed.has(code);
  },

  endFrame() {
    this.pressed.clear();
  },
};

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.buckets = new Map();
  }

  clear() {
    this.buckets.clear();
  }

  key(cx, cy) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  insert(obj) {
    const k = this.key(Math.floor(obj.x / this.cell), Math.floor(obj.y / this.cell));
    let bucket = this.buckets.get(k);
    if (!bucket) this.buckets.set(k, (bucket = []));
    bucket.push(obj);
  }

  query(x, y, r) {
    const out = [];
    const c = this.cell;
    const x1 = Math.floor((x + r) / c);
    const y1 = Math.floor((y + r) / c);
    for (let cx = Math.floor((x - r) / c); cx <= x1; cx++) {
      for (let cy = Math.floor((y - r) / c); cy <= y1; cy++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (bucket) for (const o of bucket) out.push(o);
      }
    }
    return out;
  }
}

export const WORLD = { w: 2400, h: 2400, tile: 32 };

const CHUNK = 8;                  // tiles per chunk side — 256px of baked ground per canvas
const CHUNK_PX = CHUNK * WORLD.tile;
const TILES_X = WORLD.w / WORLD.tile;
const CHUNKS_X = Math.ceil(TILES_X / CHUNK);

// Smooth value noise over the tile grid. Two octaves is enough to get regions that read as
// meadow / mossy hollow / dry dirt / shale without looking like a heightmap.
function makeNoise(rng) {
  const SIZE = 64;
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)];
  const smooth = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    // smoothstep, so regions have soft shoulders instead of diamond-shaped bilinear artefacts
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  return (x, y, scale) => smooth(x / scale, y / scale) * 0.65 + smooth(x / (scale / 2.7), y / (scale / 2.7)) * 0.35;
}

export class World {
  constructor(seed) {
    const rng = mulberry32(seed);
    this.seed = seed;
    const noise = makeNoise(rng);
    const wet = makeNoise(rng);

    // Material as a continuous function of world PIXEL position. Sampling below tile resolution
    // is what gives organic region edges; `edge` is how far this pixel is from the nearest
    // threshold, normalised, so the baker knows where to stipple the two materials together.
    const T = WORLD.tile;
    const BAND = 0.055;                 // width of the transition band in noise units
    this.materialAtPx = (px, py) => {
      const tx = px / T;
      const ty = py / T;
      const n = noise(tx, ty, 13);
      const w = wet(tx + 120, ty - 90, 9);
      let index;
      let other = -1;
      let dist;
      if (n > 0.63) {
        index = 3;                                  // shale ridges
        other = w > 0.6 ? 1 : 0;
        dist = n - 0.63;
      } else if (n < 0.37) {
        index = w > 0.5 ? 1 : 2;                    // hollows go mossy or bare dirt
        other = 0;
        dist = 0.37 - n;
      } else {
        index = w > 0.64 ? 1 : 0;                   // meadow, mossy where it is damp
        dist = Math.min(0.63 - n, n - 0.37);
        other = n > 0.5 ? 3 : (w > 0.5 ? 1 : 2);
      }
      return { index, other, edge: Math.min(1, dist / BAND) };
    };
    // Tile-resolution answer, for prop placement.
    this.materialAt = (tx, ty) => this.materialAtPx(tx * T + T / 2, ty * T + T / 2).index;

    this.chunks = new Map();
    this.art = buildProps();
    this.props = [];
    this.propHash = new SpatialHash(64);
    this.scatterProps(rng);
  }

  // Props cluster by material — pines and trees in the damp green, boulders on shale, stumps and
  // mushrooms at the edges — so the field reads as authored rather than sprinkled.
  scatterProps(rng) {
    const cx = WORLD.w / 2;
    const cy = WORLD.h / 2;
    const kindsFor = mat => (
      mat === 1 ? ['tree', 'pine', 'pine', 'bush', 'mushroom', 'stump'] :
      mat === 3 ? ['boulder', 'boulder', 'rock', 'rock', 'stump'] :
      mat === 2 ? ['rock', 'stump', 'bush', 'boulder'] :
      ['tree', 'bush', 'bush', 'rock', 'pine']
    );
    let placed = 0;
    let guard = 0;
    while (placed < 260 && guard++ < 4000) {
      // Clumps: pick a seed point, then drop a few props around it.
      const sx = 40 + rng() * (WORLD.w - 80);
      const sy = 40 + rng() * (WORLD.h - 80);
      const clump = 1 + ((rng() * 4) | 0);
      for (let i = 0; i < clump && placed < 260; i++) {
        const x = sx + (rng() - 0.5) * 90;
        const y = sy + (rng() - 0.5) * 90;
        if (x < 24 || y < 24 || x > WORLD.w - 24 || y > WORLD.h - 24) continue;
        if (Math.hypot(x - cx, y - cy) < 110) continue;
        const mat = this.materialAt((x / WORLD.tile) | 0, (y / WORLD.tile) | 0);
        const pool = kindsFor(mat);
        const kind = pool[(rng() * pool.length) | 0];
        const prop = { kind, x, y, flip: rng() < 0.5, ...this.art[kind] };
        this.props.push(prop);
        this.propHash.insert(prop);
        placed++;
      }
    }
  }

  // Chunks bake lazily and are kept in an LRU, so panning the map costs one bake per new chunk
  // and drawGround costs ~9 drawImage calls a frame instead of ~273.
  chunkAt(cx, cy) {
    const key = cy * CHUNKS_X + cx;
    let c = this.chunks.get(key);
    if (c) {
      this.chunks.delete(key);
      this.chunks.set(key, c);
      return c;
    }
    const rng = mulberry32((this.seed ^ (key * 0x9e3779b1)) >>> 0);
    c = bakeChunk(CHUNK, { x: cx * CHUNK, y: cy * CHUNK }, this.materialAtPx, rng);
    this.chunks.set(key, c);
    if (this.chunks.size > 28) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }

  // Push a circle entity (x, y, r) out of props and keep it inside the map.
  collide(ent) {
    for (const p of this.propHash.query(ent.x, ent.y, ent.r + 16)) {
      const dx = ent.x - p.x;
      const dy = ent.y - p.y;
      const min = ent.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-4) continue;
      const d = Math.sqrt(d2);
      ent.x += (dx / d) * (min - d);
      ent.y += (dy / d) * (min - d);
    }
    ent.x = Math.max(ent.r, Math.min(WORLD.w - ent.r, ent.x));
    ent.y = Math.max(ent.r, Math.min(WORLD.h - ent.r, ent.y));
  }

  drawGround(ctx, cam) {
    const cx0 = Math.max(0, Math.floor(cam.x / CHUNK_PX));
    const cy0 = Math.max(0, Math.floor(cam.y / CHUNK_PX));
    const cx1 = Math.min(CHUNKS_X - 1, Math.floor((cam.x + cam.w) / CHUNK_PX));
    const cy1 = Math.min(CHUNKS_X - 1, Math.floor((cam.y + cam.h) / CHUNK_PX));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        ctx.drawImage(this.chunkAt(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX);
      }
    }
    // The world edge: a dark band that falls away, rather than a stroked debug bounds box.
    const edge = 26;
    ctx.fillStyle = 'rgba(10, 22, 16, 0.55)';
    ctx.fillRect(-edge, -edge, WORLD.w + edge * 2, edge);
    ctx.fillRect(-edge, WORLD.h, WORLD.w + edge * 2, edge);
    ctx.fillRect(-edge, 0, edge, WORLD.h);
    ctx.fillRect(WORLD.w, 0, edge, WORLD.h);
    ctx.fillStyle = 'rgba(10, 22, 16, 0.3)';
    ctx.fillRect(0, 0, WORLD.w, 6);
    ctx.fillRect(0, WORLD.h - 6, WORLD.w, 6);
    ctx.fillRect(0, 0, 6, WORLD.h);
    ctx.fillRect(WORLD.w - 6, 0, 6, WORLD.h);
  }

  visibleProps(cam) {
    const margin = 48;
    return this.props.filter(p =>
      p.x > cam.x - margin && p.x < cam.x + cam.w + margin &&
      p.y > cam.y - margin && p.y < cam.y + cam.h + margin * 2);
  }

  drawProp(ctx, p) {
    const x = Math.round(p.x - p.img.width / 2);
    // Baked pixel shadow, offset toward the light instead of an anti-aliased ellipse centred
    // under the sprite — it is the only thing giving the field a consistent light direction.
    ctx.drawImage(p.shadow, x + 2, Math.round(p.y) - p.shadow.height + 2);
    if (p.flip) {
      ctx.save();
      ctx.translate(Math.round(p.x), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(p.img, Math.round(-p.img.width / 2), Math.round(p.y - p.img.height + 1));
      ctx.restore();
      return;
    }
    ctx.drawImage(p.img, x, Math.round(p.y - p.img.height + 1));
  }
}

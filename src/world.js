// Input, RNG, spatial hashing and the map (ground tiles + props with colliders).
import { buildGrassTiles, buildProps } from './sprites.js';

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

export class World {
  constructor(seed) {
    const rng = mulberry32(seed);
    this.tiles = buildGrassTiles(rng);
    const art = buildProps();
    this.props = [];
    this.propHash = new SpatialHash(64);
    const cx = WORLD.w / 2;
    const cy = WORLD.h / 2;
    for (let i = 0; i < 160; i++) {
      const roll = rng();
      const kind = roll < 0.35 ? 'rock' : roll < 0.6 ? 'tree' : 'bush';
      const x = 40 + rng() * (WORLD.w - 80);
      const y = 40 + rng() * (WORLD.h - 80);
      if (Math.hypot(x - cx, y - cy) < 90) continue;
      const prop = { kind, x, y, ...art[kind] };
      this.props.push(prop);
      this.propHash.insert(prop);
    }
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
    const T = WORLD.tile;
    const tx0 = Math.max(0, Math.floor(cam.x / T));
    const ty0 = Math.max(0, Math.floor(cam.y / T));
    const tx1 = Math.min(WORLD.w / T - 1, Math.floor((cam.x + cam.w) / T));
    const ty1 = Math.min(WORLD.h / T - 1, Math.floor((cam.y + cam.h) / T));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const v = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % this.tiles.length;
        ctx.drawImage(this.tiles[v], tx * T, ty * T);
      }
    }
    ctx.strokeStyle = '#2b4f2a';
    ctx.lineWidth = 4;
    ctx.strokeRect(-2, -2, WORLD.w + 4, WORLD.h + 4);
  }

  visibleProps(cam) {
    const margin = 48;
    return this.props.filter(p =>
      p.x > cam.x - margin && p.x < cam.x + cam.w + margin &&
      p.y > cam.y - margin && p.y < cam.y + cam.h + margin * 2);
  }

  drawProp(ctx, p) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(Math.round(p.x), Math.round(p.y), p.img.width * 0.35, 2 + p.img.width * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(p.img, Math.round(p.x - p.img.width / 2), Math.round(p.y - p.img.height + 1));
  }
}

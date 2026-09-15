import { ARENA } from './config.js';

// Architectural art for the 1920×1080 projector arena is cached once; only small lights animate.
let backdrop;
const C = {
  space: '#091522', shadow: '#0c1a2a', deep: '#15283d', rim: '#1e344b',
  wall: '#2c435c', steel: '#415e7d', floor: '#364e67', floorLight: '#3f5974',
  floorShade: '#2d4258', lane: '#435a72', laneLight: '#526a84', line: '#63768b',
  glow: '#89b6e6', glowDark: '#40668f', glowDim: '#406184', pale: '#c5d8ec',
  amber: '#f08f79', amberDark: '#9c5849', ember: '#de8774',
};
const DIGITS = ['111101101101111', '010110010010111', '111001111100111',
  '111001111001111', '101101111001001', '111100111001111', '111100111101111',
  '111001010010010', '111101111101111', '111101111001111'];

// Fixed seed so the sky is identical on every load.
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const STARS = (() => {
  const rand = seeded(20260915);
  return Array.from({ length: 110 }, () => [Math.round(rand() * 1910), Math.round(8 + rand() * 300), rand() < 0.2 ? 3 : rand() < 0.6 ? 2 : 1]);
})();

export function createArenaBackdrop() {
  if (backdrop) return backdrop;
  const { width: W, height: H } = ARENA;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rand = seeded(915);
  const rect = (x, y, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };
  const polygon = (points, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  };
  const panel = (x, y, w, h, fill, step = 8) => {
    rect(x + step, y, w - 2 * step, h, fill);
    rect(x, y + step, w, h - 2 * step, fill);
  };
  // A pixel disc: one span per 2px row.
  const disc = (cx, cy, r, fill) => {
    for (let dy = -r; dy < r; dy += 2) {
      const half = Math.round(Math.sqrt(r * r - (dy + 1) * (dy + 1)));
      rect(cx - half, cy + dy, half * 2, 2, fill);
    }
  };
  const light = (x, y, w = 24, warm = false) => {
    rect(x - 3, y - 3, w + 6, 9, C.shadow);
    rect(x - 1, y - 1, w + 2, 6, warm ? C.amberDark : C.glowDim);
    rect(x, y, w, 3, warm ? C.amber : C.glow);
    rect(x + 2, y, Math.max(2, w - 4), 1, warm ? '#ffcfc4' : C.pale);
  };
  const bolt = (x, y) => {
    rect(x, y, 4, 4, C.shadow);
    rect(x, y, 3, 2, C.line);
  };
  const number = (value, cx, y) => {
    const text = String(value).padStart(2, '0');
    const x = Math.round(cx - (text.length * 8 - 2) / 2);
    [...text].forEach((char, i) => {
      [...DIGITS[Number(char)]].forEach((bit, pixel) => {
        if (bit === '1') rect(x + i * 8 + pixel % 3 * 2, y + Math.floor(pixel / 3) * 2, 2, 2, '#919daa');
      });
    });
  };
  // Stepped rooftops across the whole width, from a seeded run of block widths.
  const skyline = (base, low, high, fill) => {
    const points = [[0, H]];
    let x = 0;
    while (x < W) {
      const y = Math.round(base - (low + rand() * (high - low)));
      points.push([x, y], [x + 60 + Math.round(rand() * 110), y]);
      x = points.at(-1)[0];
    }
    points.push([W, H]);
    polygon(points, fill);
  };

  // Deep space above the deck, seen through the observation dome.
  rect(0, 0, W, H, C.space);
  rect(0, 58, W, 300, '#0c1b2c');
  for (const [x, y, size] of STARS) rect(x, y, size, size, size > 2 ? '#8ba2bb' : size > 1 ? '#5c7690' : '#47607a');
  disc(1470, 132, 34, '#1d3551');
  disc(1462, 124, 26, '#27466a');
  rect(1446, 112, 10, 4, '#3a608a');
  rect(1418, 138, 104, 3, '#3f5f82');
  rect(1424, 141, 92, 1, '#1d3551');
  rect(412, 72, 2, 12, C.glowDim);
  rect(407, 77, 12, 2, C.glowDim);
  skyline(330, 40, 120, '#193451');
  skyline(360, 20, 70, '#112841');
  rect(0, 356, W, 14, C.shadow);

  // Observatories either side of the boss: blue telemetry left, amber communications right.
  const tower = (x, mirrored) => {
    const oy = 64;
    const accent = mirrored ? C.amber : C.glow;
    panel(x + 6, 168 + oy, 138, 125, C.shadow, 12);
    panel(x, 155 + oy, 136, 123, C.deep, 12);
    panel(x + 4, 151 + oy, 128, 108, C.wall, 10);
    rect(x + 12, 153 + oy, 112, 3, '#687d93');
    rect(x + 6, 166 + oy, 4, 78, '#415973');
    rect(x + 126, 166 + oy, 4, 78, '#15293f');
    panel(x + 18, 131 + oy, 100, 44, C.steel, 8);
    panel(x + 24, 131 + oy, 88, 34, C.wall, 6);
    rect(x + 30, 133 + oy, 76, 3, '#788696');
    for (let xx = 33; xx <= 97; xx += 8) rect(x + xx, 143 + oy, 4, 13, C.deep);
    panel(x + 24, 178 + oy, 88, 46, C.shadow, 4);
    rect(x + 29, 182 + oy, 78, 33, '#112840');
    if (mirrored) {
      for (const [i, height] of [8, 14, 10, 21, 26, 19, 12, 7].entries()) {
        rect(x + 38 + i * 8, 210 + oy - height, 4, height, i % 3 === 0 ? accent : '#79574f');
      }
    } else {
      rect(x + 35, 190 + oy, 32, 3, accent);
      rect(x + 35, 198 + oy, 23, 2, '#47688c');
      rect(x + 35, 205 + oy, 40, 2, '#47688c');
      panel(x + 83, 190 + oy, 13, 13, '#3d5a78', 3);
      rect(x + 87, 194 + oy, 5, 5, accent);
    }
    rect(x + 30, 216 + oy, 76, 2, C.steel);
    for (const yy of [233, 239, 245]) rect(x + 21, yy + oy, 46, 3, C.deep);
    rect(x + 96, 233 + oy, 10, 10, C.deep);
    rect(x + 98, 235 + oy, 6, 6, accent);
    light(x + 44, 271 + oy, 48, mirrored);
    const antennaX = x + (mirrored ? 103 : 29);
    rect(antennaX - 4, 120 + oy, 12, 13, C.deep);
    rect(antennaX, 96 + oy, 4, 36, C.steel);
    rect(antennaX - 2, 95 + oy, 8, 5, C.ember);
    rect(antennaX, 95 + oy, 4, 2, '#ffbbac');
  };
  tower(170, false);
  tower(1614, true);
  for (const x of [470, 1440]) {
    rect(x, 236, 8, 124, C.deep);
    rect(x + 2, 240, 2, 116, C.steel);
    rect(x - 10, 230, 28, 8, C.wall);
    rect(x - 8, 230, 24, 2, '#687d93');
  }

  // The boss reactor: warm light stays inside its one platform.
  const bx = 600, by = 50;
  panel(bx + 222, by + 112, 276, 184, C.shadow, 24);
  panel(bx + 230, by + 100, 260, 185, C.rim, 22);
  panel(bx + 238, by + 102, 244, 167, '#404c59', 18);
  panel(bx + 244, by + 110, 232, 151, '#2d3e50', 16);
  rect(bx + 260, by + 103, 200, 3, '#9f817a');
  rect(bx + 254, by + 119, 212, 3, '#675551');
  panel(bx + 269, by + 128, 182, 112, '#1c2d3f', 16);
  panel(bx + 280, by + 137, 160, 97, '#5a4540', 14);
  panel(bx + 284, by + 141, 152, 88, '#263545', 12);
  polygon([[bx + 298, by + 187], [bx + 317, by + 175], [bx + 403, by + 175], [bx + 422, by + 187], [bx + 422, by + 231],
    [bx + 403, by + 243], [bx + 317, by + 243], [bx + 298, by + 231]], '#8a5549');
  polygon([[bx + 304, by + 190], [bx + 320, by + 180], [bx + 400, by + 180], [bx + 416, by + 190], [bx + 416, by + 228],
    [bx + 400, by + 238], [bx + 320, by + 238], [bx + 304, by + 228]], '#42474c');
  rect(bx + 321, by + 238, 78, 3, C.amber);
  panel(bx + 254, by + 241, 212, 30, C.wall, 8);
  rect(bx + 263, by + 244, 194, 3, '#808890');
  rect(bx + 264, by + 263, 192, 6, C.deep);
  light(bx + 286, by + 261, 148, true);
  for (const x of [bx + 239, bx + 470]) {
    panel(x, by + 127, 11, 110, C.shadow, 3);
    rect(x + 3, by + 136, 5, 26, C.amber);
    rect(x + 3, by + 171, 5, 20, C.amberDark);
    rect(x + 3, by + 200, 5, 26, '#794a40');
  }
  for (const x of [bx + 262, bx + 451]) { bolt(x, by + 121); bolt(x, by + 247); }
  // Stage steps down to the deck.
  rect(bx + 256, by + 277, 208, 12, '#2d3d4f');
  rect(bx + 260, by + 277, 200, 2, '#75818d');
  rect(bx + 244, by + 289, 232, 14, '#3b4e63');
  rect(bx + 248, by + 289, 224, 2, '#787f86');
  rect(bx + 228, by + 303, 264, 18, C.lane);
  rect(bx + 232, by + 303, 256, 2, '#78838f');
  rect(bx + 212, by + 321, 296, 22, C.laneLight);
  rect(bx + 216, by + 321, 288, 2, '#8792a0');

  // One continuous deck holds every bank.
  const top = ARENA.deckTop;
  polygon([[14, top + 30], [66, top - 14], [W - 66, top - 14], [W - 14, top + 30], [W - 14, H], [14, H]], '#07131f');
  polygon([[22, top + 34], [72, top - 6], [W - 72, top - 6], [W - 22, top + 34], [W - 22, H], [22, H]], C.rim);
  polygon([[36, top + 38], [80, top + 6], [W - 80, top + 6], [W - 36, top + 38], [W - 36, H], [36, H]], C.floor);
  rect(40, top + 8, W - 80, 3, C.line);
  // Sparse deterministic plating keeps the floor from reading flat.
  for (let row = 0; row * 53 + top + 12 < H; row++) {
    for (let col = 0; col * 53 + 44 < W - 44; col++) {
      const x = 44 + col * 53, y = top + 12 + row * 53;
      if (ARENA.aisles.some(([a0, a1]) => x + 51 > a0 && x < a1)) continue;
      rect(x, y, 51, 51, (row + col) % 3 === 0 ? '#385069' : '#354d66');
      rect(x + 1, y, 48, 1, '#425870');
      if ((row * 7 + col * 3) % 9 === 0) {
        rect(x + 13, y + 17, 7, 2, '#435970');
        rect(x + 21, y + 18, 3, 1, '#435970');
      }
    }
  }
  for (const x of [22, W - 38]) {
    rect(x, top + 40, 16, H - top - 40, C.deep);
    rect(x + 2, top + 40, 2, H - top - 40, C.steel);
    rect(x + 7, top + 50, 3, H - top - 60, C.glowDim);
    for (let y = top + 52; y < H - 12; y += 70) {
      rect(x + 3, y, 11, 12, C.rim);
      rect(x + 4, y, 9, 2, C.line);
      rect(x + 5, y + 4, 6, 3, C.shadow);
    }
  }

  // Aisles lead the eye (and the shots from the back) up to the boss.
  for (const [a0, a1] of ARENA.aisles) {
    const w = a1 - a0;
    rect(a0, top + 4, w, H - top - 4, C.shadow);
    rect(a0 + 4, top + 4, w - 8, H - top - 4, C.lane);
    rect(a0 + 6, top + 10, 2, H - top - 10, C.laneLight);
    rect(a1 - 8, top + 10, 2, H - top - 10, '#354b62');
    for (let y = top + 22; y < H; y += 70) {
      rect(a0 + 12, y, w - 24, 65, (y - top) % 140 < 70 ? '#49637e' : '#455c74');
      rect(a0 + 14, y, w - 28, 2, '#536981');
      rect(a0 + 14, y + 64, w - 28, 1, '#324a64');
    }
    for (let y = top + 90; y < H - 20; y += 140) {
      const cx = (a0 + a1) / 2;
      polygon([[cx - 12, y + 6], [cx, y - 4], [cx + 12, y + 6], [cx + 12, y + 11], [cx, y + 2], [cx - 12, y + 11]], '#667b91');
      rect(a0 - 2, y - 8, 2, 26, C.glowDim);
      rect(a1, y - 8, 2, 26, C.glowDim);
    }
  }

  // One raised bank per row and section; collars use exactly the live turret anchors.
  ARENA.rows.forEach((y, row) => {
    for (const [x0, x1] of ARENA.banks) {
      const x = x0 + 4, w = x1 - x0 - 8, t = y - 62, h = 108;
      panel(x, t, w, h, C.shadow, 10);
      panel(x + 2, t, w - 4, h - 8, C.steel, 8);
      panel(x + 4, t + 4, w - 8, h - 16, '#46607b', 7);
      panel(x + 7, t + 8, w - 14, h - 24, row % 2 ? '#3c536c' : '#405974', 6);
      rect(x + 12, t + 4, w - 24, 2, '#718091');
      rect(x + 10, t + 18, w - 20, 3, C.floorShade);
      rect(x + 11, t + 22, w - 22, 1, '#465b72');
      rect(x + 12, y + 44, w - 24, 3, '#253a51');
      for (const inset of [13, w - 17]) bolt(x + inset, t + 9);
      for (let c = 1; c < 6; c++) {
        const dx = x0 + c * ARENA.pitch;
        rect(dx - 1, t + 26, 2, 60, '#2f4760');
        rect(dx + 1, t + 26, 1, 60, '#4b5f74');
      }
      light(x + w / 2 - 23, t + 2, 46);
    }
  });
  for (const [index, [x, y]] of ARENA.slots.entries()) {
    polygon([[x - 33, y - 7], [x - 22, y - 19], [x + 22, y - 19], [x + 33, y - 7],
      [x + 33, y + 9], [x + 22, y + 21], [x - 22, y + 21], [x - 33, y + 9]], C.shadow);
    polygon([[x - 31, y - 6], [x - 20, y - 16], [x + 20, y - 16], [x + 31, y - 6],
      [x + 31, y + 7], [x + 20, y + 17], [x - 20, y + 17], [x - 31, y + 7]], C.steel);
    polygon([[x - 27, y - 5], [x - 17, y - 13], [x + 17, y - 13], [x + 27, y - 5],
      [x + 27, y + 5], [x + 17, y + 13], [x - 17, y + 13], [x - 27, y + 5]], C.deep);
    rect(x - 15, y + 15, 30, 2, C.glowDark);
    rect(x - 31, y - 3, 3, 6, C.glowDark);
    rect(x + 28, y - 3, 3, 6, C.glowDark);
    rect(x - 18, y - 16, 36, 2, '#78889a');
    number(index + 1, x, y + 26);
  }
  rect(22, H - 8, W - 44, 8, C.deep);
  rect(40, H - 8, W - 80, 2, '#294059');
  backdrop = canvas;
  return backdrop;
}

// Time is in seconds. Render underneath characters, in map px.
// Reduced motion retains the backdrop's static architectural lights only.
export function drawArenaAmbience(ctx, time, { reducedMotion = false } = {}) {
  if (reducedMotion) return;
  const { width: W, height: H, deckTop: top } = ARENA;
  const t = Number.isFinite(time) ? time : 0;
  ctx.save();
  ctx.fillStyle = C.glow;
  const run = H - top - 60;
  for (let i = 0; i < 6; i++) {
    const y = top + 50 + ((t * 18 + i * 151) % run);
    ctx.globalAlpha = 0.12 + 0.1 * Math.sin(t * 0.75 + i);
    ctx.fillRect(29, Math.floor(y), 3, 14);
    ctx.fillRect(W - 31, Math.floor(H - 10 - (y - top - 50)), 3, 14);
  }
  STARS.forEach(([x, y, size], i) => {
    if (i % 9) return;
    ctx.globalAlpha = 0.15 + Math.max(0, Math.sin(t * 0.6 + i * 1.9)) * 0.45;
    ctx.fillRect(x, y, size + 1, size + 1);
  });
  // Chevrons in the aisles pulse toward the boss, back row first.
  for (const [a0, a1] of ARENA.aisles) {
    const cx = (a0 + a1) / 2;
    for (let y = top + 90, k = 0; y < H - 20; y += 140, k++) {
      ctx.globalAlpha = 0.25 * Math.max(0, Math.sin(t * 2.4 + k * 0.9));
      ctx.fillRect(cx - 10, y + 2, 20, 4);
    }
  }
  ctx.globalAlpha = 0.12 + Math.sin(t * 0.8) * 0.08;
  ctx.fillStyle = C.amber;
  ctx.fillRect(888, 315, 144, 2);
  ctx.restore();
}

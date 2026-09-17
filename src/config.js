// Character art and arena layout shared by the server, the projector, the phones and the sandbox.
// views = frame order of a 360° turnaround strip.
export const SPRITES = {
  hero: { url: 'assets/source/hero-360.svg', views: ['down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'] },
  // 7×3 grid PNG (168px cells, drawn 1:1): row 1 idle, row 2 taking a hit, row 3 breathing fire.
  // Cleaned from a generated sheet whose "transparent" background was a painted checkerboard.
  boss: {
    url: 'assets/source/boss-smoke.png',
    cols: 7, rows: 3, size: 168,
    pivot: { x: 0.5, y: 1 },
    anims: {
      idle: { frames: [0, 1, 2, 3, 4, 5, 6], fps: 8 },
      hurt: { frames: [7, 8, 9, 10, 11, 12, 13], fps: 14, loop: false },
      attack: { frames: [14, 15, 16, 17, 18, 19, 20], fps: 12, loop: false },
    },
  },
  // 4×3 grid PNG (362×373 cells, bases aligned): row 1 idle, row 2 charging, row 3 firing upward.
  // Cleaned from turret-topdown-raw.png, whose "transparent" background was a painted checkerboard.
  turret: {
    url: 'assets/source/turret.png',
    // Same layout without the fox, used for turrets nobody has joined (cleaned from turret-empty-raw.png).
    emptyUrl: 'assets/source/turret-empty.png',
    cols: 4, rows: 3, size: 92,
    pivot: { x: 0.5, y: 0.96 },
    anims: {
      idle: { frames: [0, 1, 2, 3], fps: 5 },
      aim: { frames: [4, 5, 6, 7], fps: 10, loop: false },
      fire: { frames: [8, 9, 10, 11], fps: 12, loop: false },
    },
    // Cannon tip in the upright art, as a fraction of the frame.
    muzzle: { x: 0.505, y: 0.23 },
    // The part that swivels toward the boss: everything above the water tank, i.e. the tube plus the
    // spray in the firing frames (measured on the 362×373 cells). hingeX/cutY is the pivot on the tank.
    barrel: { hingeX: 0.505, cutY: 0.362, tipY: 0.19, spray: [0.326, 0.674], tube: [0.326, 0.674] },
  },
};

// Landscape arena for the 1920×1080 projector (map px = stage px). The boss hovers over its reactor
// at the top; the hall's turrets sit below in three banks of rows facing it, like seats facing a stage.
const ROWS = [470, 582, 694, 806, 918, 1030];
const BANK_LEFT = [48, 684, 1320];
const PER_BANK = 6;
const PITCH = 92;

export const ARENA = {
  width: 1920,
  height: 1080,
  rows: ROWS,
  pitch: PITCH,
  banks: BANK_LEFT.map(x => [x, x + PER_BANK * PITCH]),
  aisles: [[600, 684], [1236, 1320]],
  // Server turret i = slot i: numbered left to right, starting with the row nearest the boss.
  slots: ROWS.flatMap(y => BANK_LEFT.flatMap(x => Array.from({ length: PER_BANK }, (_, c) => [x + PITCH / 2 + c * PITCH, y]))),
  ringWidth: 62,
  deckTop: 392,
  boss: { x: 960, feetY: 318, height: 200, flight: { radiusX: 250, radiusY: 22, period: 16 } },
  // Players who arrive after every turret is taken still shoot, from the foot of the two aisles.
  hallLaunchers: [[642, 1080], [1278, 1080]],
};

// Seats fill from the middle of the front rows outward, so even a small hall crowds the boss.
const seatRank = ([x, y]) => Math.hypot((x - ARENA.boss.x) / 1.4, y - 360);
export const SEAT_ORDER = ARENA.slots.map((_, i) => i).sort((a, b) => seatRank(ARENA.slots[a]) - seatRank(ARENA.slots[b]));

// Answer tiles, shared by phones and the projector. Colour plus shape, as in Kahoot, so a phone tile
// matches its option on the big screen at a glance and without relying on colour alone.
export const ANSWERS = [
  { letter: 'A', shape: 'triangle', color: '#E5303F', ledge: '#8C1220' },
  { letter: 'B', shape: 'diamond', color: '#1C66BB', ledge: '#0C3A70' },
  { letter: 'C', shape: 'circle', color: '#C28100', ledge: '#6F4A00' },
  { letter: 'D', shape: 'square', color: '#1F9D55', ledge: '#0D5A2E' },
];

export const SHAPE_PATHS = {
  triangle: 'M12 2.5 22.5 20.5h-21Z',
  diamond: 'M12 1.5 22.5 12 12 22.5 1.5 12Z',
  circle: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z',
  square: 'M3 3h18v18H3Z',
};

export const shapeSvg = shape => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SHAPE_PATHS[shape]}"/></svg>`;

// Power-ups every player gets once per game. Effects are applied by the server.
export const ITEMS = {
  hint: { name: 'Buddy thông thái', icon: 'assets/source/items/buddy-thong-thai.png', effect: 'Loại 2 đáp án sai' },
  shield: { name: 'Khiên Research Lab', icon: 'assets/source/items/khien-research-lab.png', effect: 'Đỡ 1 lần sai, giữ combo' },
  boost: { name: 'Súng giọt tự tin', icon: 'assets/source/items/sung-giot-tu-tin.png', effect: 'Câu đúng kế tiếp x2 điểm, x2 đạn' },
};

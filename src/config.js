// Character art shared by the quiz, the host screen and the sandbox.
// views = frame order of a 360° turnaround strip.
export const SPRITES = {
  hero: { url: 'assets/source/hero-360.svg', views: ['down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'] },
  boss: { url: 'assets/source/boss-angry.svg', name: 'idle', fps: 8 },
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

// Space arena map (map pixels). Measured on space-arena-empty.png.
export const ARENA = {
  url: 'assets/source/map/space-arena-empty.png',
  width: 1672,
  height: 941,
  // The 30 painted neon rings, back row first, left to right: [x, y]. Server turret i = slot i.
  slots: [
    [310, 325], [515, 325], [725, 325], [950, 325], [1155, 325], [1360, 325],
    [250, 425], [475, 425], [710, 425], [965, 425], [1195, 425], [1425, 425],
    [180, 540], [435, 540], [695, 540], [975, 540], [1235, 540], [1495, 540],
    [110, 670], [395, 670], [680, 670], [990, 670], [1275, 670], [1560, 670],
    [250, 790], [480, 790], [710, 790], [960, 790], [1210, 790], [1435, 790],
  ],
  // Ring width at a given floor y (perspective): ~95px on the back row, ~150px on row 4.
  ringWidth: { y0: 325, w0: 95, perPx: 0.16, min: 80, max: 175 },
  // Walkable floor: a trapezoid, narrower at the back.
  floor: { top: 275, bottom: 845, topX: [205, 1465], bottomX: [45, 1625] },
  // The boss painted on its platform; the animated boss sprite is drawn over it.
  boss: { x: 842, feetY: 190, height: 150 },
};

// Power-ups every player gets once per game. Effects are applied by the server.
export const ITEMS = {
  hint: { name: 'Buddy thông thái', icon: 'assets/source/items/buddy-thong-thai.svg', effect: 'Loại 2 đáp án sai' },
  shield: { name: 'Khiên Research Lab', icon: 'assets/source/items/khien-research-lab.svg', effect: 'Đỡ 1 lần sai, giữ combo' },
  boost: { name: 'Súng giọt tự tin', icon: 'assets/source/items/sung-giot-tu-tin.svg', effect: 'Câu đúng kế tiếp x2 điểm' },
};

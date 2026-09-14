// Character art shared by the quiz, the host screen and the sandbox.
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

// Portrait space arena (map pixels). Shared by the backdrop and live entities.
export const ARENA = {
  legacyUrl: 'assets/source/map/space-arena-empty.png',
  width: 720,
  height: 1160,
  // Five banks of six turrets flank a clear central walkway. Server turret i = slot i.
  slots: [
    [85, 410], [170, 410], [255, 410], [465, 410], [550, 410], [635, 410],
    [85, 550], [170, 550], [255, 550], [465, 550], [550, 550], [635, 550],
    [85, 690], [170, 690], [255, 690], [465, 690], [550, 690], [635, 690],
    [85, 830], [170, 830], [255, 830], [465, 830], [550, 830], [635, 830],
    [85, 970], [170, 970], [255, 970], [465, 970], [550, 970], [635, 970],
  ],
  ringWidth: { y0: 410, w0: 58, perPx: 0, min: 58, max: 58 },
  floor: { top: 300, bottom: 1080, topX: [42, 678], bottomX: [42, 678] },
  boss: { x: 360, feetY: 265, height: 145 * 1.3, flight: { radiusX: 92, radiusY: 20, period: 16 } },
  spawn: { x: 360, y: 1050 },
};

// Power-ups every player gets once per game. Effects are applied by the server.
export const ITEMS = {
  hint: { name: 'Buddy thông thái', icon: 'assets/source/items/buddy-thong-thai.svg', effect: 'Loại 2 đáp án sai' },
  shield: { name: 'Khiên Research Lab', icon: 'assets/source/items/khien-research-lab.svg', effect: 'Đỡ 1 lần sai, giữ combo' },
  boost: { name: 'Súng giọt tự tin', icon: 'assets/source/items/sung-giot-tu-tin.svg', effect: 'Câu đúng kế tiếp x2 điểm' },
};

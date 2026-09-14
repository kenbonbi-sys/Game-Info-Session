import { ARENA } from './config.js';

// Architectural art is cached once; only the small environmental lights animate.
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

export function createArenaBackdrop() {
  if (backdrop) return backdrop;
  const canvas = document.createElement('canvas');
  canvas.width = ARENA.width;
  canvas.height = ARENA.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
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
  const number = (value, x, y) => {
    [...String(value).padStart(2, '0')].forEach((char, i) => {
      [...DIGITS[Number(char)]].forEach((bit, pixel) => {
        if (bit === '1') rect(x + i * 8 + pixel % 3 * 2, y + Math.floor(pixel / 3) * 2, 2, 2, '#919daa');
      });
    });
  };

  // Distant stepped atmosphere through the observation window.
  rect(0, 0, ARENA.width, ARENA.height, C.space);
  rect(0, 46, ARENA.width, 214, '#0c1b2c');
  const stars = [[30, 30, 2], [84, 78, 2], [144, 28, 3], [192, 106, 2],
    [224, 48, 2], [286, 26, 2], [350, 46, 2], [408, 20, 2], [472, 52, 2],
    [530, 18, 2], [610, 56, 3], [686, 30, 2], [44, 142, 2], [17, 220, 3],
    [704, 194, 3], [657, 125, 2], [190, 62, 1], [487, 84, 1], [624, 24, 1]];
  for (const [x, y, size] of stars) rect(x, y, size, size, size > 2 ? '#8ba2bb' : '#47607a');
  rect(108, 40, 2, 10, C.glowDim);
  rect(104, 44, 10, 2, C.glowDim);
  polygon([[0, 223], [52, 223], [52, 211], [108, 211], [108, 201], [184, 201],
    [184, 193], [278, 193], [278, 189], [410, 189], [410, 195], [504, 195],
    [504, 205], [594, 205], [594, 217], [666, 217], [666, 232], [720, 232],
    [720, 283], [0, 283]], '#193451');
  polygon([[0, 235], [62, 235], [62, 223], [124, 223], [124, 214], [216, 214],
    [216, 207], [312, 207], [312, 205], [402, 205], [402, 212], [514, 212],
    [514, 224], [624, 224], [624, 238], [720, 238], [720, 287], [0, 287]], '#112841');
  panel(558, 71, 46, 42, '#2a4868', 10);
  panel(558, 71, 34, 34, '#6b829b', 8);
  panel(568, 77, 32, 31, '#2a4868', 8);
  rect(560, 84, 4, 12, '#96a5b6');
  rect(0, 268, 720, 12, C.shadow);
  rect(14, 262, 188, 4, C.steel);
  rect(518, 262, 188, 4, C.steel);
  for (const x of [18, 196, 520, 698]) {
    rect(x, 196, 6, 79, C.deep);
    rect(x, 198, 2, 56, C.steel);
  }

  // One continuous deck silhouette preserves the reference's vertical path.
  polygon([[20, 306], [72, 260], [648, 260], [700, 306], [700, 1130],
    [674, 1144], [46, 1144], [20, 1130]], '#07131f');
  polygon([[28, 308], [76, 269], [644, 269], [692, 308], [692, 1118],
    [672, 1131], [48, 1131], [28, 1118]], C.rim);
  polygon([[40, 309], [80, 282], [640, 282], [680, 309], [680, 1108], [40, 1108]], C.floor);
  rect(44, 310, 632, 782, C.floor);
  rect(44, 309, 632, 3, C.line);
  // Sparse deterministic pixels create material without noisy live textures.
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 12; col++) {
      const x = 46 + col * 53, y = 313 + row * 53;
      if (x > 280 && x < 420) continue;
      rect(x, y, 51, 51, (row + col) % 3 === 0 ? '#385069' : '#354d66');
      rect(x + 1, y, 48, 1, '#425870');
      if ((row * 7 + col * 3) % 9 === 0) {
        rect(x + 13, y + 17, 7, 2, '#435970');
        rect(x + 21, y + 18, 3, 1, '#435970');
      }
    }
  }
  for (const x of [26, 678]) {
    rect(x, 322, 16, 765, C.deep);
    rect(x + 2, 322, 2, 765, C.steel);
    rect(x + 7, 332, 3, 738, C.glowDim);
    for (let y = 334; y < 1080; y += 70) {
      rect(x + 3, y, 11, 12, C.rim);
      rect(x + 4, y, 9, 2, C.line);
      rect(x + 5, y + 4, 6, 3, C.shadow);
    }
  }

  // Light center plates, fine guide strips and threshold arrows orient players.
  rect(294, 296, 132, 796, C.shadow);
  rect(298, 296, 124, 796, C.lane);
  rect(300, 302, 2, 782, C.laneLight);
  rect(418, 302, 2, 782, '#354b62');
  for (let row = 0; row < 11; row++) {
    const y = 318 + row * 70;
    rect(306, y, 108, 65, row % 2 ? '#49637e' : '#455c74');
    rect(308, y, 104, 2, '#536981');
    rect(308, y + 64, 104, 1, '#324a64');
    for (const x of [305, 412]) rect(x, y + 56, 3, 3, '#728090');
  }
  for (let y = 477; y < 1060; y += 140) {
    polygon([[350, y + 4], [360, y - 3], [370, y + 4], [370, y + 8],
      [360, y + 1], [350, y + 8]], '#667b91');
    rect(292, y - 6, 2, 23, C.glowDim);
    rect(426, y - 6, 2, 23, C.glowDim);
  }

  // Five banks, shallow front faces and service channels ground the hardware.
  const rows = [...new Set(ARENA.slots.map(([, y]) => y))];
  rows.forEach((y, row) => {
    for (const x of [48, 432]) {
      panel(x, y - 80, 240, 121, C.shadow, 10);
      panel(x + 2, y - 80, 236, 111, C.steel, 8);
      panel(x + 4, y - 76, 232, 103, '#46607b', 7);
      panel(x + 7, y - 72, 226, 94, row % 2 ? '#3c536c' : '#405974', 6);
      rect(x + 12, y - 76, 216, 2, '#718091');
      rect(x + 10, y - 60, 220, 3, C.floorShade);
      rect(x + 11, y - 56, 218, 1, '#465b72');
      rect(x + 12, y + 23, 216, 5, '#253a51');
      rect(x + 10, y + 31, 220, 4, C.rim);
      for (const inset of [17, 223]) bolt(x + inset, y - 71);
      for (const inset of [72, 157]) {
        rect(x + inset, y - 49, 2, 57, '#2f4760');
        rect(x + inset + 3, y - 49, 1, 57, '#4b5f74');
      }
      light(x + 97, y + 29, 46);
      rect(x + 23, y + 30, 31, 3, '#445b73');
      rect(x + 185, y + 30, 31, 3, '#445b73');
      rect(x + 4, y + 65, 232, 2, '#283f58');
      rect(x + 4, y + 68, 232, 1, '#4c627a');
      for (const inset of [22, 202]) {
        rect(x + inset, y + 49, 12, 3, '#687684');
        rect(x + inset + 3, y + 53, 9, 2, '#45596e');
      }
    }
    for (const x of [26, 682]) {
      panel(x - 2, y - 42, 16, 49, C.shadow, 3);
      rect(x, y - 37, 12, 37, C.wall);
      rect(x + 3, y - 32, 6, 23, C.glowDim);
      rect(x + 4, y - 29, 4, 15, C.glowDark);
    }
  });
  // Engraved collars use exactly the same anchors as the live turret bases.
  for (const [index, [x, y]] of ARENA.slots.entries()) {
    polygon([[x - 31, y - 7], [x - 21, y - 18], [x + 21, y - 18], [x + 31, y - 7],
      [x + 31, y + 9], [x + 21, y + 20], [x - 21, y + 20], [x - 31, y + 9]], C.shadow);
    polygon([[x - 29, y - 6], [x - 19, y - 15], [x + 19, y - 15], [x + 29, y - 6],
      [x + 29, y + 7], [x + 19, y + 16], [x - 19, y + 16], [x - 29, y + 7]], C.steel);
    polygon([[x - 25, y - 5], [x - 16, y - 12], [x + 16, y - 12], [x + 25, y - 5],
      [x + 25, y + 5], [x + 16, y + 12], [x - 16, y + 12], [x - 25, y + 5]], C.deep);
    rect(x - 14, y + 14, 28, 2, C.glowDark);
    rect(x - 29, y - 3, 3, 6, C.glowDark);
    rect(x + 26, y - 3, 3, 6, C.glowDark);
    rect(x - 17, y - 15, 34, 2, '#78889a');
    number(index + 1, x - 7, y + 46);
  }

  // Side observatories: mint telemetry left, amber communications right.
  const tower = (x, mirrored) => {
    const accent = mirrored ? C.amber : C.glow;
    panel(x + 6, 168, 138, 125, C.shadow, 12);
    panel(x, 155, 136, 123, C.deep, 12);
    panel(x + 4, 151, 128, 108, C.wall, 10);
    rect(x + 12, 153, 112, 3, '#687d93');
    rect(x + 6, 166, 4, 78, '#415973');
    rect(x + 126, 166, 4, 78, '#15293f');
    panel(x + 18, 131, 100, 44, C.steel, 8);
    panel(x + 24, 131, 88, 34, C.wall, 6);
    rect(x + 30, 133, 76, 3, '#788696');
    for (let xx = 33; xx <= 97; xx += 8) rect(x + xx, 143, 4, 13, C.deep);
    panel(x + 24, 178, 88, 46, C.shadow, 4);
    rect(x + 29, 182, 78, 33, '#112840');
    rect(x + 31, 184, 74, 1, mirrored ? '#5f4b46' : '#2e4a67');
    if (mirrored) {
      for (const [i, height] of [8, 14, 10, 21, 26, 19, 12, 7].entries()) {
        rect(x + 38 + i * 8, 210 - height, 4, height, i % 3 === 0 ? accent : '#79574f');
      }
    } else {
      rect(x + 35, 190, 32, 3, accent);
      rect(x + 35, 198, 23, 2, '#47688c');
      rect(x + 35, 205, 40, 2, '#47688c');
      panel(x + 83, 190, 13, 13, '#3d5a78', 3);
      rect(x + 87, 194, 5, 5, accent);
    }
    rect(x + 30, 216, 76, 2, C.steel);
    for (const yy of [233, 239, 245]) rect(x + 21, yy, 46, 3, C.deep);
    rect(x + 96, 233, 10, 10, C.deep);
    rect(x + 98, 235, 6, 6, accent);
    light(x + 44, 271, 48, mirrored);
    const antennaX = x + (mirrored ? 103 : 29);
    rect(antennaX - 4, 120, 12, 13, C.deep);
    rect(antennaX, 96, 4, 36, C.steel);
    rect(antennaX - 2, 95, 8, 5, C.ember);
    rect(antennaX, 95, 4, 2, '#ffbbac');
  };
  tower(50, false);
  tower(534, true);

  // Warm reactor lighting is contained inside the single boss platform.
  panel(222, 112, 276, 184, C.shadow, 24);
  panel(230, 100, 260, 185, C.rim, 22);
  panel(238, 102, 244, 167, '#404c59', 18);
  panel(244, 110, 232, 151, '#2d3e50', 16);
  rect(260, 103, 200, 3, '#9f817a');
  rect(254, 119, 212, 3, '#675551');
  panel(269, 128, 182, 112, '#1c2d3f', 16);
  panel(280, 137, 160, 97, '#5a4540', 14);
  panel(284, 141, 152, 88, '#263545', 12);
  polygon([[298, 187], [317, 175], [403, 175], [422, 187], [422, 231],
    [403, 243], [317, 243], [298, 231]], '#8a5549');
  polygon([[304, 190], [320, 180], [400, 180], [416, 190], [416, 228],
    [400, 238], [320, 238], [304, 228]], '#42474c');
  rect(321, 238, 78, 3, C.amber);
  panel(254, 241, 212, 30, C.wall, 8);
  rect(263, 244, 194, 3, '#808890');
  rect(264, 263, 192, 6, C.deep);
  light(286, 261, 148, true);
  rect(276, 277, 168, 10, '#2d3d4f');
  rect(280, 277, 160, 2, '#75818d');
  rect(284, 287, 152, 10, '#3b4e63');
  rect(288, 287, 144, 2, '#787f86');
  rect(296, 297, 128, 9, C.lane);
  rect(300, 297, 120, 2, '#78838f');
  for (const x of [239, 470]) {
    panel(x, 127, 11, 110, C.shadow, 3);
    rect(x + 3, 136, 5, 26, C.amber);
    rect(x + 3, 171, 5, 20, C.amberDark);
    rect(x + 3, 200, 5, 26, '#794a40');
  }
  for (const x of [262, 451]) { bolt(x, 121); bolt(x, 247); }

  // Cargo stays at the edges; the center airlock remains open for arrival.
  panel(48, 1050, 166, 52, C.deep, 6);
  panel(506, 1050, 166, 52, C.deep, 6);
  for (const [i, x] of [64, 124, 522, 582].entries()) {
    panel(x + 4, 1048, 46, 45, C.shadow, 4);
    panel(x, 1038, 46, 43, i === 1 ? '#515a64' : C.wall, 4);
    rect(x + 4, 1040, 38, 3, i === 1 ? '#70859c' : '#667b91');
    rect(x + 3, 1046, 2, 29, '#506881');
    rect(x + 38, 1046, 4, 31, C.deep);
    rect(x + 18, 1046, 10, 31, C.deep);
    rect(x + 20, 1046, 6, 9, i === 1 ? C.amberDark : C.glowDark);
    rect(x + 20, 1068, 6, 4, '#838f9c');
    bolt(x + 7, 1067);
  }
  rect(40, 1094, 256, 8, C.deep);
  rect(424, 1094, 256, 8, C.deep);
  rect(49, 1094, 224, 2, C.steel);
  rect(447, 1094, 224, 2, C.steel);
  panel(276, 1084, 168, 48, C.shadow, 8);
  panel(284, 1084, 152, 37, C.wall, 6);
  rect(296, 1088, 128, 3, C.line);
  rect(300, 1097, 120, 2, C.deep);
  light(313, 1111, 94);
  for (const x of [251, 447]) {
    rect(x, 1105, 18, 11, C.amberDark);
    polygon([[x, 1105], [x + 6, 1105], [x + 12, 1116], [x + 6, 1116]], C.deep);
  }
  rect(48, 1126, 624, 8, C.deep);
  rect(64, 1132, 592, 2, '#294059');
  rect(92, 1144, 536, 3, '#11253a');
  backdrop = canvas;
  return backdrop;
}

// Time is in seconds. Render underneath characters, in the map transform.
// Reduced motion retains the backdrop's static architectural lights only.
export function drawArenaAmbience(ctx, time, { reducedMotion = false } = {}) {
  if (reducedMotion) return;
  ctx.save();
  const t = Number.isFinite(time) ? time : 0;
  ctx.fillStyle = C.glow;
  for (let i = 0; i < 5; i++) {
    const y = 348 + ((t * 11 + i * 151) % 722);
    ctx.globalAlpha = 0.12 + 0.1 * Math.sin(t * 0.75 + i);
    ctx.fillRect(33, Math.floor(y), 3, 12);
    ctx.fillRect(685, Math.floor(1070 - (y - 348)), 3, 12);
  }
  for (const [i, x, y] of [[0, 84, 78], [1, 286, 26], [2, 610, 56], [3, 472, 52]]) {
    ctx.globalAlpha = 0.18 + Math.max(0, Math.sin(t * 0.6 + i * 1.9)) * 0.3;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 0.12 + Math.sin(t * 0.8) * 0.08;
  ctx.fillStyle = C.amber;
  ctx.fillRect(288, 265, 144, 2);
  ctx.restore();
}

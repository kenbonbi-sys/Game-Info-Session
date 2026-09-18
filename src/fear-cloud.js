// Đám mây nỗi sợ trên máy chiếu, và đoạn phim biến nó thành Quái Vật.
//
// Đây là chỗ con boss được sinh ra. Hội trường gõ điều mình sợ, chữ mọc dần trên màn chiếu; MC bấm
// một nút, cả đám chữ bị hút vào một xoáy khói đen, ba nỗi sợ nhiều người gõ nhất hiện lên thật to
// rồi cũng bị nuốt, và Quái Vật bước ra từ đống khói đó. Tới cuối buổi, thứ cả phòng bắn không còn
// là một con quái vật vô danh nữa.
//
// Vẽ trên cùng hệ toạ độ 1920×1080 với đấu trường, để hai cảnh khớp nhau khi cắt qua lại.
import { SPRITES, ARENA } from './config.js';
import { loadGridSheet } from './sprites.js';

const W = ARENA.width;
const H = ARENA.height;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = k => 1 - (1 - k) ** 3;
const easeIn = k => k * k * k;
const easeInOut = k => k * k * (3 - 2 * k);
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

// Mốc thời gian của đoạn phim, tính bằng giây kể từ lúc MC bấm. Tổng phải khớp STORM_SECONDS
// trong server.js — server dùng nó để tự chuyển sang 'done'.
const T = {
  suck: 2.4,        // chữ trong đám mây bị hút vào tâm
  word: [2.9, 3.7, 4.5],
  crush: 6.5,       // ba nỗi sợ lớn bị nuốt nốt
  flash: 7.5,
  born: 7.6,        // Quái Vật bước ra từ khói
  line: 8.7,        // "TA LÀ NỖI SỢ CỦA CÁC NGƯƠI!"
  laugh: 11.3,
  fly: 13.0,
  end: 15,
};
const LINE = 'TA LÀ NỖI SỢ CỦA CÁC NGƯƠI!';
const LAUGH = 'HA HA HA HA!';

// Đoạn đọng lại sau đoạn phim. Quái Vật bay đi, màn chiếu tối hẳn một lúc — rồi nó hiện lại
// trong bóng tối, lần này không phải để doạ mà để đặt câu hỏi cho cả buổi. Cảnh này đứng yên
// cho tới khi MC bấm; nó tuyệt đối không được tự nhảy về phòng chờ của game, vì phòng chờ đã
// là đấu trường và mấy chục ụ súng — nhìn thấy trước là hỏng cả đoạn cuối buổi.
const O = {
  dark: 1.0,      // tối hẳn: khoảng lặng cho hội trường kịp thở
  eyes: 1.2,      // hai đốm mắt nhen lên trong bóng tối
  boss: 2.0,      // Quái Vật hiện dần ra từ đúng chỗ hai đốm mắt
  ask: 3.2,       // câu hỏi của cả buổi
  tease: 4.4,
};
const ASK = 'TA NÊN LÀM GÌ ĐỂ CHIẾN ĐẤU VỚI NỖI SỢ ĐÂY?';
const TEASE = 'Hãy cùng đón xem nhé!';

const CENTER = { x: W / 2, y: H / 2 - 20 };
const MAX_DRAWN = 110;            // chữ nhỏ hơn nữa thì ngồi cuối hội trường cũng không đọc nổi
const SIZE_MIN = 26;
const SIZE_MAX = 112;
const PAD = 7;
const INK = '#0a1420';
// Chữ ít người gõ thì lạnh và mờ; càng nhiều người gõ càng nóng — nhìn là biết nỗi sợ nào chung.
const TONES = ['#8ea9c4', '#a8c2dc', '#cfe0f2', '#ffd5cb', '#ff9d7a', '#FF5D38'];

let canvas = null;
let ctx = null;
let scale = 1;
let bossSheet = null;
const words = new Map();          // chữ → { text, count, x, y, size, tx, ty, tsize, tone, born }
let storm = null;
let outro = null;
let time = 0;

const font = size => `800 ${Math.round(size)}px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif`;

export function initFearCloud(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  document.fonts?.ready.then(() => {
    relayout();
  });
  return loadGridSheet(SPRITES.boss.url, SPRITES.boss)
    .then(sheet => { bossSheet = sheet; })
    .catch(err => { console.warn(err); });
}

// renderScale = pixel thật trên mỗi pixel sân khấu, giống resizeArena.
export function resizeFearCloud(renderScale) {
  const s = clamp(renderScale, 0.5, 2);
  if (!canvas || (canvas.width === Math.round(W * s) && Math.abs(s - scale) < 0.01)) return;
  scale = s;
  canvas.width = Math.round(W * s);
  canvas.height = Math.round(H * s);
  relayout();
}

// ---- Xếp chữ ----------------------------------------------------------------------

// Xoắn ốc từ tâm ra, dẹt theo chiều ngang cho hợp màn 16:9; chữ nào không còn chỗ thì thôi,
// thà thiếu một chữ nhỏ còn hơn đè lên chữ khác.
function place(w, h, boxes) {
  for (let i = 12; i < 3600; i++) {
    const a = i * 0.28;
    const r = a * 3.1;
    const x = CENTER.x + Math.cos(a) * r * 1.85;
    const y = CENTER.y + Math.sin(a) * r * 0.78;
    const box = { x: x - w / 2 - PAD, y: y - h / 2 - PAD, w: w + PAD * 2, h: h + PAD * 2 };
    if (box.x < 48 || box.y < 96 || box.x + box.w > W - 48 || box.y + box.h > H - 120) continue;
    if (boxes.some(o => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h)) continue;
    boxes.push(box);
    return { x, y };
  }
  return null;
}

function relayout() {
  if (!ctx || !words.size) return;
  const list = [...words.values()].sort((a, b) => b.count - a.count).slice(0, MAX_DRAWN);
  const max = list[0].count;
  const min = list[list.length - 1].count;
  // Hội trường càng gõ nhiều thì chữ càng phải nhỏ lại, không thì tràn ra ngoài màn chiếu.
  const density = clamp(1.15 - list.length / 150, 0.46, 1);
  const boxes = [];
  for (const w of words.values()) w.placed = false;
  for (const w of list) {
    const f = max === min ? 1 : (w.count - min) / (max - min);
    const size = Math.round((SIZE_MIN + (SIZE_MAX - SIZE_MIN) * f ** 0.62) * density);
    ctx.font = font(size);
    const spot = place(ctx.measureText(w.text).width, size * 1.04, boxes);
    if (!spot) continue;
    w.placed = true;
    w.tsize = size;
    w.tx = spot.x;
    w.ty = spot.y;
    w.tone = TONES[Math.min(TONES.length - 1, Math.round(f ** 0.7 * (TONES.length - 1)))];
    // Chữ mới nhú lên ngay chỗ của nó rồi phình ra, không bay ngang qua màn hình.
    if (w.x === undefined) Object.assign(w, { x: spot.x, y: spot.y, size: 0, born: time });
  }
}

export function setFearWords(list) {
  if (!ctx) return;
  const seen = new Set();
  for (const [text, count] of list ?? []) {
    seen.add(text);
    const w = words.get(text);
    if (w) w.count = count;
    else words.set(text, { text, count, tone: TONES[0] });
  }
  for (const text of [...words.keys()]) if (!seen.has(text)) words.delete(text);
  relayout();
}

// Đoạn phim chạy xong thì bỏ hẳn đi. Không bỏ thì lần sau MC mở lại bàn phím, canvas vẫn đứng ở
// khung cuối của cơn bão thay vì vẽ lại đám mây chữ.
export function endStorm() {
  storm = null;
  outro = null;
}

// elapsed: như startStorm — máy chiếu mở muộn hay vừa reload vẫn vào đúng khúc.
export function startOutro(elapsed = 0) {
  storm = null;
  outro = {
    e: Math.max(0, elapsed),
    puffs: Array.from({ length: 14 }, () => ({ a: rand(0, TAU), r: rand(50, 190), size: rand(70, 150), speed: rand(0.5, 1.6), tone: rand(0, 1) })),
  };
}

// ---- Đoạn phim triệu hồi ------------------------------------------------------------

// elapsed: đã chạy được bao lâu tính theo đồng hồ server, để màn chiếu mở muộn hoặc vừa reload
// vẫn nhảy vào đúng khúc thay vì chiếu lại từ đầu.
export function startStorm(top, elapsed = 0) {
  outro = null;
  storm = {
    e: Math.max(0, elapsed),
    top: (top ?? []).slice(0, 3).map((w, i) => ({
      text: w.text,
      count: w.count,
      seat: { x: CENTER.x, y: 325 + i * 195 },
    })),
    // Mỗi cuộn khói quay quanh tâm một vận tốc khác nhau: cả khối không bao giờ trông như một bánh xe.
    puffs: Array.from({ length: 34 }, () => ({
      a: rand(0, TAU), r: rand(40, 250), size: rand(65, 155), speed: rand(0.55, 1.9),
      wobble: rand(0.4, 1.5), tone: rand(0, 1),
    })),
    embers: Array.from({ length: 44 }, () => ({ a: rand(0, TAU), r: rand(150, 440), speed: rand(0.6, 1.6), size: rand(3, 7) })),
  };
}


// ---- Vẽ -----------------------------------------------------------------------------

function text(str, x, y, size, fill, { alpha = 1, angle = 0, outline = 5 } = {}) {
  if (alpha <= 0.004 || size < 1) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineWidth = outline;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.strokeText(str, 0, 0);
  }
  ctx.fillStyle = fill;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// Khói đen trên nền đen thì không ai thấy gì. Cuộn khói ở đây là xám xanh sáng hơn nền, viền ngoài
// mới tối lại — nhìn từ cuối hội trường vẫn ra hình khối đang cuộn.
function puff(x, y, r, hot, alpha) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, hot ? `rgba(122, 86, 92, ${0.95 * alpha})` : `rgba(96, 108, 134, ${0.92 * alpha})`);
  g.addColorStop(0.48, `rgba(58, 66, 86, ${0.6 * alpha})`);
  g.addColorStop(1, 'rgba(14, 17, 26, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

// Các vòng quỹ đạo mảnh giữ hình khối cho đám khói. Hạt vuông nối cảnh với pixel art của boss.
function orbit(e, radius, alpha, squeeze = 1) {
  if (alpha <= 0.004) return;
  const motion = REDUCED_MOTION.matches ? 0 : 1;
  ctx.save();
  ctx.translate(CENTER.x, CENTER.y);
  ctx.scale(1, 0.72);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const r = (radius + i * 40) * squeeze;
    const turn = e * (i % 2 ? -0.16 : 0.12) * motion + i * 1.9;
    ctx.strokeStyle = `rgba(255, 157, 122, ${alpha * (0.38 - i * 0.08)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, turn, turn + Math.PI * 1.35);
    ctx.stroke();
    ctx.strokeStyle = `rgba(151, 184, 208, ${alpha * 0.1})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function atmosphere(e, strength = 1) {
  const motion = REDUCED_MOTION.matches ? 0 : 1;
  const glow = ctx.createRadialGradient(CENTER.x, CENTER.y, 30, CENTER.x, CENTER.y, 780);
  glow.addColorStop(0, `rgba(62, 64, 83, ${0.26 * strength})`);
  glow.addColorStop(0.55, `rgba(29, 46, 66, ${0.13 * strength})`);
  glow.addColorStop(1, 'rgba(8, 15, 24, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = 95 + ((i * 347.7) % (W - 190));
    const y = 120 + ((i * 179.3 + e * (4 + i % 5) * motion) % (H - 270));
    ctx.fillStyle = `rgba(169, 191, 208, ${(0.07 + (i % 4) * 0.018) * strength})`;
    ctx.fillRect(Math.round(x), Math.round(y), i % 3 ? 2 : 3, i % 3 ? 2 : 3);
  }
}

function letterbox(amount = 1) {
  const h = Math.round(64 * clamp(amount, 0, 1));
  ctx.fillStyle = '#03070d';
  ctx.fillRect(0, 0, W, h);
  ctx.fillRect(0, H - h, W, h);
  ctx.fillStyle = `rgba(255, 157, 122, ${0.15 * amount})`;
  ctx.fillRect(0, h, W, 1);
  ctx.fillRect(0, H - h, W, 1);
}

function bossLight(alpha, e) {
  if (alpha <= 0.004) return;
  const glow = ctx.createRadialGradient(CENTER.x, CENTER.y - 10, 30, CENTER.x, CENTER.y, 470);
  glow.addColorStop(0, `rgba(255, 125, 75, ${0.21 * alpha})`);
  glow.addColorStop(0.55, `rgba(135, 68, 48, ${0.13 * alpha})`);
  glow.addColorStop(1, 'rgba(80, 38, 30, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(CENTER.x, CENTER.y + 310);
  ctx.scale(1, 0.16);
  const floor = ctx.createRadialGradient(0, 0, 50, 0, 0, 460);
  floor.addColorStop(0, `rgba(255, 124, 76, ${0.23 * alpha})`);
  floor.addColorStop(0.5, `rgba(226, 92, 52, ${0.1 * alpha})`);
  floor.addColorStop(1, 'rgba(255, 93, 56, 0)');
  ctx.fillStyle = floor;
  ctx.fillRect(-480, -480, 960, 960);
  ctx.strokeStyle = `rgba(255, 158, 111, ${0.27 * alpha})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 315 + Math.sin(e * 0.8) * (REDUCED_MOTION.matches ? 0 : 5), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Khối khói: dày lên theo `mass` (0 → 1) và co lại theo `squeeze`.
function drawVortex(e, mass, squeeze, spin) {
  if (mass <= 0) return;
  // Quầng đỏ âm ỉ bên trong: cái xoáy phải trông như đang nóng lên, không phải một cục mây.
  const glow = ctx.createRadialGradient(CENTER.x, CENTER.y, 0, CENTER.x, CENTER.y, 430 * squeeze);
  glow.addColorStop(0, `rgba(255, 96, 40, ${0.34 * mass})`);
  glow.addColorStop(0.45, `rgba(150, 40, 20, ${0.16 * mass})`);
  glow.addColorStop(1, 'rgba(90, 20, 10, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  orbit(e, 340, mass, squeeze);
  for (const p of storm.puffs) {
    const a = p.a + spin * p.speed;
    const r = (p.r + Math.sin(spin * p.wobble + p.a) * 18) * squeeze;
    const x = CENTER.x + Math.cos(a) * r * 1.35;
    const y = CENTER.y + Math.sin(a) * r * 0.82;
    puff(x, y, p.size * (0.55 + mass * 0.8) * squeeze, p.tone > 0.62, mass * 0.46);
  }
  for (const p of storm.embers) {
    const a = p.a + spin * p.speed * 1.5;
    const r = p.r * squeeze;
    ctx.globalAlpha = mass * (0.35 + 0.3 * Math.sin(spin * 2 + p.a));
    ctx.fillStyle = p.size > 5 ? '#ffb387' : '#c87659';
    ctx.fillRect(
      Math.round(CENTER.x + Math.cos(a) * r * 1.3 - p.size / 2),
      Math.round(CENTER.y + Math.sin(a) * r * 0.8 - p.size / 2),
      p.size, p.size,
    );
  }
  ctx.globalAlpha = 1;
}

function drawBoss(height, alpha, { x = CENTER.x, y = CENTER.y, frame = 0, shake = 0 } = {}) {
  if (!bossSheet || alpha <= 0.01) return;
  const { frames, pivot, headroom } = bossSheet;
  const f = frames[frame % frames.length];
  const k = height / headroom;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x + shake, y);
  ctx.drawImage(bossSheet.image, f.x, f.y, f.w, f.h, -pivot.x * k, -pivot.y * k + height * 0.5, f.w * k, f.h * k);
  ctx.restore();
}

// Bong bóng thoại kiểu pixel: viền mực, góc bậc thang, bóng đổ cứng.
function bubble(str, x, y, size = 40, alpha = 1) {
  size = fitSize(str, size, W - 420);
  ctx.font = font(size);
  const w = Math.ceil(ctx.measureText(str).width) + 76;
  const h = size + 44;
  const bx = clamp(Math.round(x - w / 2), 24, W - w - 24);
  const by = Math.round(y - h);
  const step = (sx, sy, sw, sh, s) => {
    ctx.fillRect(sx + s, sy, sw - 2 * s, sh);
    ctx.fillRect(sx, sy + s, sw, sh - 2 * s);
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#050a11';
  step(bx + 7, by + 7, w, h, 12);
  ctx.fillStyle = '#a85b43';
  step(bx, by, w, h, 12);
  ctx.fillStyle = '#10141d';
  step(bx + 2, by + 2, w - 4, h - 4, 10);
  ctx.fillStyle = '#ff9d7a';
  ctx.fillRect(bx + 24, by, 62, 3);
  ctx.fillRect(bx + w - 86, by + h - 3, 62, 3);
  ctx.fillStyle = '#a85b43';
  ctx.fillRect(bx + w / 2 - 14, by + h, 22, 7);
  ctx.fillRect(bx + w / 2 - 8, by + h + 7, 12, 7);
  ctx.restore();
  text(str, bx + w / 2, by + h / 2, size, '#ffe9dc', { outline: 0, alpha });
}

function drawCloud() {
  atmosphere(time, 0.75);
  orbit(time, 390, 0.18);
  for (const w of words.values()) {
    if (!w.placed || w.size < 1) continue;
    text(w.text, w.x, w.y, w.size, w.tone, { alpha: clamp((time - w.born) / 0.45, 0, 1) });
  }
}

// Mỗi chữ xoắn vào tâm theo đúng góc nó đang đứng, nên cả đám mây cùng cuộn vào một chỗ.
function drawSuckedCloud(e) {
  const k = easeInOut(clamp((e - 0.25) / (T.suck - 0.25), 0, 1));
  const motion = REDUCED_MOTION.matches ? 0 : 1;
  for (const w of words.values()) {
    if (!w.placed) continue;
    const dx = w.x - CENTER.x;
    const dy = w.y - CENTER.y;
    const a = Math.atan2(dy, dx) + k * 2.6 * motion;
    const r = Math.hypot(dx, dy) * (1 - k * motion);
    text(w.text, CENTER.x + Math.cos(a) * r, CENTER.y + Math.sin(a) * r, w.size * (1 - k * 0.72 * motion), w.tone, {
      alpha: 1 - k ** 2,
      angle: k * 0.75 * motion,
    });
  }
}

function fitSize(str, size, maxWidth) {
  ctx.font = font(size);
  const w = ctx.measureText(str).width;
  return w <= maxWidth ? size : size * (maxWidth / w);
}

function drawTopWords(e) {
  // Gọi tên khoảnh khắc: đây là ba điều cả hội trường sợ nhất, không phải ba chữ ngẫu nhiên.
  const caption = clamp((e - T.word[0] + 0.2) / 0.5, 0, 1) * clamp((T.crush - e) / 0.6, 0, 1);
  if (caption > 0.01) {
    const count = storm.top.length;
    text(`${count} NỖI SỢ LỚN NHẤT CỦA CẢ HỘI TRƯỜNG`, CENTER.x, 163, 31, '#d6ab95', { alpha: caption, outline: 0 });
    ctx.fillStyle = `rgba(255, 157, 122, ${caption * 0.55})`;
    ctx.fillRect(CENTER.x - 30, 204, 60, 3);
  }
  storm.top.forEach((w, i) => {
    const at = T.word[i];
    if (e < at) return;
    const fly = clamp((e - at) / 0.65, 0, 1);
    const k = easeOut(fly);
    const motion = REDUCED_MOTION.matches ? 0 : 1;
    const gone = clamp((e - T.crush - i * 0.08) / 0.68, 0, 1);
    const pull = easeIn(gone) * motion;
    const x = w.seat.x;
    const y = w.seat.y + (CENTER.y - w.seat.y) * pull + (1 - k) * 32 * motion;
    const alpha = k * (1 - gone ** 2);
    // Mỗi câu có hẳn một hàng rộng; giữ yên đủ lâu để cả hội trường kịp đọc.
    const size = fitSize(w.text, i === 0 ? 91 : 80, 1280) * (1 - pull * 0.82);
    const detailAlpha = alpha * (1 - clamp(gone * 4, 0, 1));
    text(`0${i + 1}`, x, y - 75, 22, '#ff9d7a', { alpha: detailAlpha, outline: 0 });
    text(w.text, x, y, size, i === 0 ? '#ffb38d' : '#fff0e5', { alpha, outline: 6 });
    if (w.count > 0) {
      text(`${w.count} người cùng nỗi sợ`, x, y + 67, 25, '#b9c0cc', { alpha: detailAlpha, outline: 4 });
    }
  });
}

function drawStorm(e) {
  const motion = REDUCED_MOTION.matches ? 0 : 1;
  const spin = e * 0.65 * motion;
  ctx.fillStyle = `rgba(4, 8, 14, ${0.3 + clamp(e / 1.4, 0, 1) * 0.66})`;
  ctx.fillRect(0, 0, W, H);
  atmosphere(e, 1 - clamp((e - T.fly) / 1.2, 0, 1));

  if (e < T.suck + 0.3) drawSuckedCloud(e);
  // Sau khi Quái Vật hiện ra, khói loãng bớt nhưng không tan hẳn — nó vẫn đang bốc lên từ đó.
  const named = clamp((e - T.word[0] + 0.5) / 0.5, 0, 1) * (1 - clamp((e - T.crush) / 0.65, 0, 1));
  const mass = clamp(e / 1.5, 0, 1) * (1 - named * 0.55) * (e > T.born ? clamp(1 - (e - T.born) / 1.4, 0.2, 1) : 1);
  const squeeze = e < T.crush ? 1 : clamp(1 - easeInOut(clamp((e - T.crush) / (T.flash - T.crush), 0, 1)) * 0.82, 0.18, 1);
  drawVortex(e, mass, squeeze, spin);
  if (e < T.crush + 0.9) drawTopWords(e);
  if (e < T.word[0]) {
    const caption = clamp((e - 0.35) / 0.5, 0, 1) * clamp((T.word[0] - e) / 0.45, 0, 1);
    text('NHỮNG NỖI SỢ ĐANG HỘI TỤ…', CENTER.x, 890, 30, '#d8b29e', { alpha: caption, outline: 0 });
  }

  // Ánh sáng bật ra từ tâm, thay vì phủ trắng toàn bộ màn chiếu.
  if (e >= T.flash - 0.22 && e < T.flash + 0.7) {
    const burst = clamp(1 - Math.abs(e - T.flash) / 0.5, 0, 1) * (motion ? 1 : 0.28);
    const radius = 240 + easeOut(clamp((e - T.flash + 0.22) / 0.92, 0, 1)) * 640;
    const flash = ctx.createRadialGradient(CENTER.x, CENTER.y, 0, CENTER.x, CENTER.y, radius);
    flash.addColorStop(0, `rgba(255, 241, 211, ${burst * 0.88})`);
    flash.addColorStop(0.18, `rgba(255, 177, 108, ${burst * 0.6})`);
    flash.addColorStop(1, 'rgba(255, 115, 55, 0)');
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, W, H);
    if (motion) {
      ctx.strokeStyle = `rgba(255, 189, 139, ${burst * 0.7})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(CENTER.x, CENTER.y, radius * 0.78, radius * 0.55, 0, 0, TAU);
      ctx.stroke();
    }
  }

  if (e >= T.born) {
    const grow = clamp((e - T.born) / 1.1, 0, 1);
    const flying = clamp((e - T.fly) / (T.end - T.fly), 0, 1);
    const laughing = e >= T.laugh && e < T.fly;
    const depart = easeIn(flying) * motion;
    const shake = laughing ? Math.sin(e * 20) * 4 * motion : 0;
    const height = (535 + easeOut(grow) * 65 * motion) * (1 - depart * 0.48);
    const frame = motion ? (laughing ? 14 + (Math.floor(e * 7) % 7) : Math.floor(e * 6) % 7) : 0;
    bossLight(grow * (1 - flying), e);
    drawBoss(height, Math.min(1, grow * 1.6) * (1 - easeIn(flying)), {
      x: CENTER.x + depart * 1080,
      y: CENTER.y + 30 + (1 - easeOut(grow)) * 80 * motion - Math.sin(e * 1.6) * 7 * motion - depart * 480,
      frame,
      shake,
    });
    if (e >= T.line && e < T.laugh) bubble(LINE, CENTER.x, 202, 50, clamp((e - T.line) / 0.3, 0, 1));
    else if (laughing) bubble(LAUGH, CENTER.x, 202, 58, clamp((e - T.laugh) / 0.2, 0, 1));
    const titleAlpha = clamp((e - T.born - 0.5) / 0.7, 0, 1) * (1 - clamp((e - T.fly) / 0.3, 0, 1));
    text('QUÁI VẬT NỖI SỢ', CENTER.x, 928, 36, '#d99c7f', { alpha: titleAlpha, outline: 0 });
  }
  letterbox(easeOut(clamp(e / 0.8, 0, 1)));
  const blackout = clamp((e - T.end + 0.6) / 0.6, 0, 1);
  if (blackout) {
    ctx.fillStyle = `rgba(4, 7, 12, ${blackout})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawOutro(e) {
  const motion = REDUCED_MOTION.matches ? 0 : 1;
  ctx.fillStyle = '#04070c';
  ctx.fillRect(0, 0, W, H);

  const bossIn = clamp((e - O.boss) / 1.2, 0, 1);
  if (bossIn) atmosphere(e, bossIn * 0.6);
  // Hai đốm mắt trong bóng tối, tắt dần khi cả hình đã rõ: có thứ gì đó vẫn ở đây.
  const eyes = clamp((e - O.eyes) / 0.55, 0, 1) * (1 - bossIn);
  if (eyes > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = eyes * (0.6 + 0.4 * Math.sin(e * 3.2 * motion));
    for (const dx of [-52, 52]) {
      const g = ctx.createRadialGradient(CENTER.x + dx, CENTER.y - 140, 0, CENTER.x + dx, CENTER.y - 140, 70);
      g.addColorStop(0, '#ffc7a4');
      g.addColorStop(0.3, '#ff5d38');
      g.addColorStop(1, 'rgba(255, 93, 56, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(CENTER.x + dx - 76, CENTER.y - 216, 152, 152);
    }
    ctx.restore();
  }

  if (bossIn > 0) {
    bossLight(bossIn * 0.68, e);
    // Khói vẫn bốc dưới chân: nó bước ra từ đó, không phải dán lên một nền đen.
    ctx.save();
    ctx.globalAlpha = bossIn * 0.34;
    for (const p of outro.puffs) {
      const a = p.a + e * 0.3 * p.speed * motion;
      puff(CENTER.x + Math.cos(a) * p.r * 1.7, CENTER.y + 230 + Math.sin(a) * p.r * 0.2, p.size, p.tone > 0.7, 0.42);
    }
    ctx.restore();
    const rise = (1 - easeOut(bossIn)) * 60 * motion;
    drawBoss(530 + easeOut(bossIn) * 45 * motion, bossIn, {
      y: CENTER.y + 30 + rise - Math.sin(e * 1.4 * motion) * 12,
      frame: motion ? Math.floor(e * 6) % 7 : 0,
    });
  }

  // Câu hỏi ở trên, lời hẹn ở dưới, con boss đứng giữa: một tấm poster đứng yên chờ MC nói tiếp.
  const ask = clamp((e - O.ask) / 0.7, 0, 1);
  if (ask > 0.01) {
    const size = fitSize(ASK, 68, W - 320);
    text(ASK, CENTER.x, 174 - (1 - easeOut(ask)) * 26 * motion, size, '#fff0e5', { alpha: ask, outline: 8 });
  }
  const tease = clamp((e - O.tease) / 0.7, 0, 1);
  if (tease > 0.01) {
    text(TEASE, CENTER.x, H - 142 + (1 - easeOut(tease)) * 22 * motion, 47, '#ffb38d', { alpha: tease, outline: 6 });
  }
  letterbox(bossIn);
}

// ---- Vòng vẽ -------------------------------------------------------------------------

// filmElapsed: đồng hồ của server cho đoạn phim đang chạy (cơn bão, hoặc đoạn đọng lại sau nó).
export function fearFrame(dt, filmElapsed = null) {
  if (!ctx) return;
  time += dt;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Chữ trôi về chỗ mới thay vì nhảy cóc mỗi lần có người gõ thêm.
  const ease = REDUCED_MOTION.matches ? 1 : 1 - Math.exp(-dt * 7);
  for (const w of words.values()) {
    if (!w.placed) continue;
    w.x += (w.tx - w.x) * ease;
    w.y += (w.ty - w.y) * ease;
    w.size += (w.tsize - w.size) * ease;
  }

  if (filmElapsed !== null) {
    if (storm) storm.e = filmElapsed;
    if (outro) outro.e = filmElapsed;
  }
  if (outro) drawOutro(outro.e);
  else if (storm) drawStorm(storm.e);
  else drawCloud();
}

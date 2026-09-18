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
let fontReady = false;
const words = new Map();          // chữ → { text, count, x, y, size, tx, ty, tsize, tone, born }
let storm = null;
let outro = null;
let time = 0;

const font = size => `800 ${Math.round(size)}px "MoMo Trusts Display", "MoMo Trusts Sans", sans-serif`;

export function initFearCloud(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  document.fonts?.ready.then(() => {
    fontReady = true;
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
      from: [{ x: -520, y: H * 0.34 }, { x: W + 520, y: H * 0.52 }, { x: W / 2, y: H + 420 }][i],
      seat: [{ x: CENTER.x - 470, y: CENTER.y - 170 }, { x: CENTER.x + 470, y: CENTER.y - 40 }, { x: CENTER.x, y: CENTER.y + 250 }][i],
    })),
    // Mỗi cuộn khói quay quanh tâm một vận tốc khác nhau: cả khối không bao giờ trông như một bánh xe.
    puffs: Array.from({ length: 52 }, () => ({
      a: rand(0, TAU), r: rand(30, 300), size: rand(70, 210), speed: rand(0.55, 1.9),
      wobble: rand(0.4, 1.5), tone: rand(0, 1),
    })),
    embers: Array.from({ length: 28 }, () => ({ a: rand(0, TAU), r: rand(60, 260), speed: rand(1.4, 3.4), size: rand(3, 8) })),
    started: false,
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
  for (const p of storm.puffs) {
    const a = p.a + spin * p.speed;
    const r = (p.r + Math.sin(e * p.wobble + p.a) * 26) * squeeze;
    const x = CENTER.x + Math.cos(a) * r * 1.35;
    const y = CENTER.y + Math.sin(a) * r * 0.82;
    puff(x, y, p.size * (0.55 + mass * 0.8) * squeeze, p.tone > 0.62, mass);
  }
  for (const p of storm.embers) {
    const a = p.a + spin * p.speed * 1.5;
    const r = p.r * squeeze;
    ctx.globalAlpha = mass * (0.5 + 0.5 * Math.sin(e * 6 + p.a));
    ctx.fillStyle = '#ff6a35';
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
function bubble(str, x, y, size = 40) {
  ctx.font = font(size);
  const w = Math.ceil(ctx.measureText(str).width) + 58;
  const h = size + 40;
  const bx = clamp(Math.round(x - w / 2), 24, W - w - 24);
  const by = Math.round(y - h);
  const step = (sx, sy, sw, sh, s) => {
    ctx.fillRect(sx + s, sy, sw - 2 * s, sh);
    ctx.fillRect(sx, sy + s, sw, sh - 2 * s);
  };
  ctx.fillStyle = '#0a0f18';
  step(bx + 7, by + 7, w, h, 12);
  ctx.fillStyle = '#1b1020';
  step(bx, by, w, h, 12);
  ctx.fillStyle = '#FF5D38';
  step(bx + 4, by + 4, w - 8, h - 8, 10);
  ctx.fillStyle = '#1b1020';
  step(bx + 9, by + 9, w - 18, h - 18, 8);
  ctx.fillRect(bx + w / 2 - 14, by + h, 22, 7);
  ctx.fillRect(bx + w / 2 - 8, by + h + 7, 12, 7);
  text(str, bx + w / 2, by + h / 2, size, '#ffd5cb', { outline: 0 });
}

function drawCloud() {
  for (const w of words.values()) {
    if (!w.placed || w.size < 1) continue;
    text(w.text, w.x, w.y, w.size, w.tone, { alpha: clamp((time - w.born) / 0.45, 0, 1) });
  }
}

// Mỗi chữ xoắn vào tâm theo đúng góc nó đang đứng, nên cả đám mây cùng cuộn vào một chỗ.
function drawSuckedCloud(e) {
  const k = easeIn(clamp(e / T.suck, 0, 1));
  for (const w of words.values()) {
    if (!w.placed) continue;
    const dx = w.x - CENTER.x;
    const dy = w.y - CENTER.y;
    const a = Math.atan2(dy, dx) + k * 5.2;
    const r = Math.hypot(dx, dy) * (1 - k);
    text(w.text, CENTER.x + Math.cos(a) * r, CENTER.y + Math.sin(a) * r, w.size * (1 - k * 0.72), w.tone, {
      alpha: 1 - k ** 2,
      angle: k * 3.4,
    });
  }
}

function fitSize(str, size, maxWidth) {
  ctx.font = font(size);
  const w = ctx.measureText(str).width;
  return w <= maxWidth ? size : Math.max(34, size * (maxWidth / w));
}

function drawTopWords(e) {
  // Gọi tên khoảnh khắc: đây là ba điều cả hội trường sợ nhất, không phải ba chữ ngẫu nhiên.
  const caption = clamp((e - T.word[0] + 0.2) / 0.5, 0, 1) * clamp((T.crush - e) / 0.6, 0, 1);
  if (caption > 0.01) {
    text('3 NỖI SỢ LỚN NHẤT CỦA CẢ HỘI TRƯỜNG', CENTER.x, 128, 40, '#ffd5cb', { alpha: caption, outline: 7 });
  }
  storm.top.forEach((w, i) => {
    const at = T.word[i];
    if (e < at) return;
    const fly = clamp((e - at) / 0.75, 0, 1);
    const k = easeOut(fly);
    // Sau khi đáp xuống thì rung tại chỗ, rồi tới lượt bị hút nốt vào xoáy.
    const gone = clamp((e - T.crush) / 0.85, 0, 1);
    const seatX = w.seat.x + (gone ? (CENTER.x - w.seat.x) * easeIn(gone) : 0);
    const seatY = w.seat.y + (gone ? (CENTER.y - w.seat.y) * easeIn(gone) : 0);
    const shake = fly >= 1 && !gone ? Math.sin(e * 24 + i) * 5 : 0;
    const y = w.from.y + (seatY - w.from.y) * k;
    // Nỗi sợ của hội trường là câu, không phải một từ: co chữ lại và kéo vào trong cho vừa màn
    // chiếu, chứ không để "Sợ người dùng nói dối" cụt mất chữ cuối.
    const size = fitSize(w.text, (96 + Math.sin(e * 5 + i) * 5) * (1 - gone * 0.75), 780);
    ctx.font = font(size);
    const half = ctx.measureText(w.text).width / 2;
    const x = clamp(w.from.x + (seatX - w.from.x) * k + shake, half + 40, W - half - 40);
    // Số người đã gõ đúng chữ này, đọc được từ cuối phòng: "12 người cùng sợ điều này".
    if (w.count > 1 && fly >= 1 && !gone) {
      text(`${w.count} người`, x, y + size * 0.82, 30, '#ffd5cb', { alpha: 0.9, outline: 6 });
    }
    text(w.text, x, y, size, '#FF5D38', { alpha: 1 - gone ** 2, outline: 9 });
  });
}

function drawStorm(e) {
  const motion = REDUCED_MOTION.matches ? 0.25 : 1;
  const spin = e * 1.5 * motion;
  ctx.fillStyle = `rgba(4, 8, 14, ${clamp(e / 1.4, 0, 1) * 0.72})`;
  ctx.fillRect(0, 0, W, H);

  if (e < T.suck + 0.3) drawSuckedCloud(e);
  // Sau khi Quái Vật hiện ra, khói loãng bớt nhưng không tan hẳn — nó vẫn đang bốc lên từ đó.
  const mass = clamp(e / 1.5, 0, 1) * (e > T.born ? clamp(1 - (e - T.born) / 2.4, 0.42, 1) : 1);
  const squeeze = e < T.crush ? 1 : clamp(1 - (e - T.crush) / (T.flash - T.crush) * 0.72, 0.28, 1);
  drawVortex(e, mass, squeeze, spin);
  if (e < T.crush + 0.9) drawTopWords(e);

  // Chớp trắng: khoảnh khắc đống khói nén lại thành hình.
  if (e >= T.flash - 0.18 && e < T.flash + 0.4) {
    ctx.globalAlpha = clamp(1 - Math.abs(e - T.flash) / 0.3, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (e >= T.born) {
    const grow = clamp((e - T.born) / 0.9, 0, 1);
    const flying = clamp((e - T.fly) / (T.end - T.fly), 0, 1);
    const laughing = e >= T.laugh && e < T.fly;
    // Cười thì rung; bay đi thì vọt lên chéo phải, nhỏ dần.
    const shake = laughing ? Math.sin(e * 28) * 9 * motion : 0;
    const height = (470 + easeOut(grow) * 170) * (1 - flying * 0.55);
    const frame = laughing ? 14 + (Math.floor(e * 9) % 7) : Math.floor(e * 7) % 7;
    drawBoss(height, Math.min(1, grow * 1.6) * (1 - flying), {
      x: CENTER.x + flying * 980,
      y: CENTER.y - 20 - Math.sin(e * 1.6) * 12 * motion - flying * 420,
      frame,
      shake,
    });
    if (e >= T.line && e < T.laugh) bubble(LINE, CENTER.x, CENTER.y - 320, 52);
    else if (laughing) bubble(LAUGH, CENTER.x + 60, CENTER.y - 320 - Math.sin(e * 14) * 10, 64);
  }
}

function drawOutro(e) {
  const motion = REDUCED_MOTION.matches ? 0.25 : 1;
  ctx.fillStyle = '#04070c';
  ctx.fillRect(0, 0, W, H);

  const bossIn = clamp((e - O.boss) / 1.2, 0, 1);
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
    // Khói vẫn bốc dưới chân: nó bước ra từ đó, không phải dán lên một nền đen.
    ctx.save();
    ctx.globalAlpha = bossIn * 0.34;
    for (const p of outro.puffs) {
      const a = p.a + e * 0.3 * p.speed * motion;
      puff(CENTER.x + Math.cos(a) * p.r * 1.7, CENTER.y + 230 + Math.sin(a) * p.r * 0.2, p.size, p.tone > 0.7, 0.42);
    }
    ctx.restore();
    const rise = (1 - easeOut(bossIn)) * 60;
    drawBoss(530 + easeOut(bossIn) * 70, bossIn, {
      y: CENTER.y + 30 + rise - Math.sin(e * 1.4 * motion) * 12,
      frame: Math.floor(e * 6) % 7,
    });
  }

  // Câu hỏi ở trên, lời hẹn ở dưới, con boss đứng giữa: một tấm poster đứng yên chờ MC nói tiếp.
  const ask = clamp((e - O.ask) / 0.7, 0, 1);
  if (ask > 0.01) {
    const size = fitSize(ASK, 78, W - 260);
    text(ASK, CENTER.x, 186 - (1 - easeOut(ask)) * 26, size, '#ffffff', { alpha: ask, outline: 10 });
  }
  const tease = clamp((e - O.tease) / 0.7, 0, 1);
  if (tease > 0.01) {
    text(TEASE, CENTER.x, H - 122 + (1 - easeOut(tease)) * 22, 52, '#FF5D38', { alpha: tease, outline: 9 });
  }
}

// ---- Vòng vẽ -------------------------------------------------------------------------

// filmElapsed: đồng hồ của server cho đoạn phim đang chạy (cơn bão, hoặc đoạn đọng lại sau nó).
export function fearFrame(dt, filmElapsed = null) {
  if (!ctx) return;
  time += dt;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Chữ trôi về chỗ mới thay vì nhảy cóc mỗi lần có người gõ thêm.
  const ease = 1 - Math.exp(-dt * 7);
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

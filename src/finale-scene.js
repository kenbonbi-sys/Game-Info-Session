// The bottle gets its own stage. Every position is a function of server elapsed
// time, so a reconnect or a dropped frame lands on the same cinematic beat.
import { drawBottle } from './bottle.js';
import { FINALE } from './finale-config.js';

const W = 1920, H = 1080, TAU = Math.PI * 2;
const clamp = v => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
const out = v => 1 - (1 - clamp(v)) ** 3;
const HERO = { x: 760, y: 490, width: 315, height: 490 };
export const FINALE_BOSS = Object.freeze({ x: 1400, feetY: 795, height: 530 });
export const FINALE_TARGET = Object.freeze({ x: FINALE_BOSS.x, y: FINALE_BOSS.feetY - FINALE_BOSS.height * 0.55 });

export function finaleCamera(t, reducedMotion = false) {
  const p = reducedMotion ? 0 : ease((t - FINALE.impactAt) / .85);
  return { x: mix(W / 2, FINALE_TARGET.x, p), y: H / 2, zoom: 1 + p * .1 };
}

export function finaleBeat(t) {
  if (t < FINALE.throwAt) return { name: 'ready', label: 'SỨC MẠNH CỦA CẢ HỘI TRƯỜNG', title: 'BÌNH ĐẦY RỒI!', sub: 'Tất cả lượt tap. Trong một cú ném.' };
  if (t < FINALE.impactAt) return { name: 'throw', label: 'CÙNG NHAU', title: 'NÉM!', sub: 'Gửi nỗi sợ một cú thật đã.' };
  if (t < FINALE.defeatAt) return { name: 'impact', label: 'MỘT CÚ NÉM · CẢ HỘI TRƯỜNG', title: 'TRÚNG RỒI!', sub: 'Nỗi sợ đang tan biến…' };
  return { name: 'defeated', label: 'CHÚNG TA ĐÃ LÀM ĐƯỢC', title: 'NỖI SỢ ĐÃ BỊ ĐÁNH BẠI!', sub: 'Sức mạnh đến từ tất cả chúng ta.' };
}

// Used by both the bottle and its trail. Wind-up ends exactly where flight begins.
export function finaleBottlePose(t, from, reducedMotion = false) {
  if (t < FINALE.liftAt) {
    const p = out(t / FINALE.liftAt);
    return { x: mix(from.x, HERO.x, p), y: mix(from.y, HERO.y, p), width: mix(from.width, HERO.width, p), height: mix(from.height, HERO.height, p), rotation: 0 };
  }
  const anticipation = ease((t - (FINALE.throwAt - .5)) / .5);
  const launch = { x: HERO.x - 90, y: HERO.y + 50, width: HERO.width * .9, height: HERO.height * .9 };
  if (t < FINALE.throwAt) {
    const float = reducedMotion ? 0 : Math.sin((t - FINALE.liftAt) * Math.PI / (FINALE.throwAt - FINALE.liftAt)) * 9;
    return { x: mix(HERO.x, launch.x, anticipation), y: mix(HERO.y, launch.y, anticipation) - float,
      width: mix(HERO.width, launch.width, anticipation), height: mix(HERO.height, launch.height, anticipation), rotation: -.22 * anticipation };
  }
  const p = clamp((t - FINALE.throwAt) / (FINALE.impactAt - FINALE.throwAt));
  // Quick launch, a readable hang near the apex, then acceleration into the hit.
  const q = p + Math.sin(p * TAU) * .075;
  return { x: mix(launch.x, FINALE_TARGET.x, q), y: mix(launch.y, FINALE_TARGET.y, q) - Math.sin(q * Math.PI) * (reducedMotion ? 80 : 220),
    width: mix(launch.width, 120, q), height: mix(launch.height, 187, q), rotation: -.22 + q * (reducedMotion ? .8 : TAU + 1.1) };
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

function glow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color); g.addColorStop(1, '#09172700');
  ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function drawFinaleBackdrop(ctx, t, from, reducedMotion = false) {
  ctx.save();
  ctx.fillStyle = '#06121cf5'; ctx.fillRect(-W, -H, W * 3, H * 3);
  const transfer = ease((t - FINALE.throwAt) / (FINALE.impactAt - FINALE.throwAt));
  const x = mix(HERO.x, FINALE_TARGET.x, transfer);
  const defeated = ease((t - FINALE.defeatAt) / 1.3);
  const focusX = x;
  glow(ctx, focusX, 480, 740, defeated > .1 ? '#76572a55' : '#17678050');
  // Two soft shafts and a floor pool make the bottle feel physically on stage.
  const shaft = ctx.createLinearGradient(0, 90, 0, 850);
  shaft.addColorStop(0, '#a6f0ff05'); shaft.addColorStop(.75, '#75dfff17'); shaft.addColorStop(1, '#75dfff00');
  ctx.fillStyle = shaft;
  ctx.beginPath(); ctx.moveTo(focusX - 65, 70); ctx.lineTo(focusX + 65, 70);
  ctx.lineTo(focusX + 330, 840); ctx.lineTo(focusX - 330, 840); ctx.closePath(); ctx.fill();
  ellipse(ctx, focusX, 811, 290, 24, '#75dfff0b');
  ctx.strokeStyle = '#8fdbf22b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(focusX, 811, 290, 24, 0, 0, TAU); ctx.stroke();
  // Restrained pixel dust in the depth of field, kept away from the subtitle band.
  for (let i = 0; i < 42; i++) {
    const drift = reducedMotion ? 0 : t * (9 + i % 5 * 3);
    const px = 120 + (i * 173.3) % 1680;
    const py = 130 + ((i * 97.7 - drift) % 650 + 650) % 650;
    ctx.globalAlpha = .12 + (i % 4) * .065;
    ctx.fillStyle = i % 5 ? '#92dfe9' : '#ffd89b';
    ctx.fillRect(px, py, i % 3 ? 2 : 4, i % 3 ? 2 : 4);
  }
  ctx.globalAlpha = 1;
  if (t < FINALE.throwAt) {
    const pose = finaleBottlePose(t, from, reducedMotion);
    glow(ctx, pose.x, pose.y, 290, '#67def42a');
    const reveal = ease(t / .65);
    ctx.save(); ctx.translate(pose.x, pose.y);
    ctx.rotate(reducedMotion ? 0 : t * .12);
    ctx.strokeStyle = '#9ceaff'; ctx.lineWidth = 2;
    ctx.globalAlpha = reveal * .34;
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 274, Math.sin(a) * 274);
      ctx.lineTo(Math.cos(a) * (i % 3 ? 284 : 305), Math.sin(a) * (i % 3 ? 284 : 305)); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawFinaleAction(ctx, t, from, reducedMotion = false) {
  ctx.save();
  if (t < FINALE.impactAt) {
    const pose = finaleBottlePose(t, from, reducedMotion);
    const flying = t >= FINALE.throwAt;
    if (flying && !reducedMotion) {
      // A tapered water ribbon describes the arc, with discrete droplets at its edge.
      for (let i = 22; i >= 1; i--) {
        const past = Math.max(FINALE.throwAt, t - i * .017);
        const p = finaleBottlePose(past, from, reducedMotion);
        ctx.globalAlpha = (1 - i / 23) * .35;
        ellipse(ctx, p.x, p.y + 12, 5 + (23 - i) * 1.5, 4 + (23 - i) * .58, '#b5f6ff');
        if (i % 3 === 0) ellipse(ctx, p.x - 12, p.y + 42 + i, 4, 7, '#6fd7f0');
      }
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = '#6de0f5'; ctx.shadowBlur = flying ? 24 : 42;
    drawBottle(ctx, pose.x - pose.width / 2, pose.y - pose.height / 2, pose.width, pose.height, 1, pose.rotation);
    ctx.shadowBlur = 0;
    if (!flying) {
      // A small completion seal holds long enough to be read before the throw.
      ctx.globalAlpha = ease((t - .35) / .5) * (1 - ease((t - FINALE.throwAt + .45) / .3));
      ctx.font = '800 24px "MoMo Trusts Display", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#bdf6ff'; ctx.fillText('100%  ·  SẴN SÀNG', pose.x, 792);
    }
  }
  ctx.globalAlpha = 1;
  const since = t - FINALE.impactAt;
  if (since >= 0) {
    const { x, y } = FINALE_TARGET;
    // One luminous impact, with no repeated full-screen flashing.
    const flash = (1 - clamp(since / .42)) * (reducedMotion ? .18 : .65);
    glow(ctx, x, y, 540, `rgba(185, 245, 255, ${flash})`);
    for (let ring = 0; ring < (reducedMotion ? 0 : 3); ring++) {
      const p = clamp((since - ring * .12) / 1.05);
      if (p <= 0 || p >= 1) continue;
      ctx.globalAlpha = (1 - p) ** 2 * .85;
      ctx.strokeStyle = ring === 1 ? '#58d5f0' : '#dcfcff'; ctx.lineWidth = (1 - p) * 16 + 1;
      ctx.beginPath(); ctx.ellipse(x, y, 50 + out(p) * 390, 40 + out(p) * 255, -.16, 0, TAU); ctx.stroke();
    }
    // Deterministic droplets remain visible when the screen reconnects mid-splash.
    for (let i = 0; i < (reducedMotion ? 0 : 54); i++) {
      const life = 1.15 + (i % 7) * .13;
      const p = since / life;
      if (p >= 1) continue;
      const a = i * 2.399963;
      const speed = 125 + i % 8 * 37;
      const dx = Math.cos(a) * speed * since;
      const dy = Math.sin(a) * speed * since + since * since * 100;
      ctx.globalAlpha = (1 - p) * .9;
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(a + Math.PI / 2);
      ellipse(ctx, 0, 0, 3 + i % 4, 7 + i % 7, i % 3 ? '#9deaff' : '#efffff'); ctx.restore();
    }
    if (since < 1.45) {
      const p = since / 1.45;
      ctx.globalAlpha = 1 - ease((p - .55) / .45);
      drawBottle(ctx, x + 36 + (reducedMotion ? 0 : p * 180), y - 80 + (reducedMotion ? 0 : -Math.sin(p * Math.PI) * 95 + p * p * 420), 108, 168, 0, reducedMotion ? .6 : 1.5 + p * 4);
    }
    if (t >= FINALE.defeatAt && !reducedMotion) {
      const end = t - FINALE.defeatAt;
      for (let i = 0; i < 32; i++) {
        const p = clamp(end / (1.4 + i % 5 * .16));
        ctx.globalAlpha = Math.sin(p * Math.PI) * .7;
        const a = i * 2.399963;
        const radius = out(p) * (140 + i % 8 * 30);
        const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius - end * 50;
        ctx.fillStyle = i % 3 ? '#b6eefa' : '#ffdb9d'; ctx.fillRect(px, py, 5, 5);
      }
    }
  }
  ctx.restore();
}

export function drawFinaleFrame(ctx, t) {
  ctx.save();
  const fade = ease(t / .5);
  ctx.fillStyle = '#030b13';
  ctx.fillRect(0, 0, W, 68 * fade); ctx.fillRect(0, H - 68 * fade, W, 68 * fade);
  ctx.globalAlpha = .35 * fade; ctx.fillStyle = '#a3dfe9';
  ctx.fillRect(80, 67, W - 160, 1); ctx.fillRect(80, H - 68, W - 160, 1);
  ctx.restore();
}

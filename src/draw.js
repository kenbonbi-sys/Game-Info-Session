// Canvas helpers shared by the swarm modules. Everything here draws on the same low-res
// pixel grid as the world, so coordinates are world px and text is 8px by default.

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const chance = p => Math.random() < p;

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A round-ish dot that still lands on whole pixels, so it reads as pixel art and not as a blur.
export function pixelDot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
  ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
}

export function drawText(ctx, text, x, y, color, size = 8) {
  ctx.font = `600 ${size}px "Pixelify Sans", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#150d1c';
  ctx.strokeText(text, Math.round(x), Math.round(y));
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

export function shadow(ctx, x, y, rx, ry, alpha = 0.25) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawHpBar(ctx, x, y, w, ratio, color = '#ff4d4d') {
  ctx.fillStyle = '#150d1c';
  ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 5);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(0, Math.round(w * ratio)), 3);
}

export function ring(ctx, x, y, r, color, width = 1, squash = 0.8) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), Math.max(1, r), Math.max(1, r * squash), 0, 0, Math.PI * 2);
  ctx.stroke();
}

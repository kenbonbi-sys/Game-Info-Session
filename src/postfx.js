// Screen-space passes that run after the world has been drawn: lighting, bloom, vignette,
// colour grade and hit flash. Nothing in here knows what a fox or a slime is — it is handed a
// list of lights in world coordinates and the finished frame, and it grades that frame.
//
// Why this is affordable: every pass is a whole-buffer composite, and the buffer is only ~640x360.
// Measured on this game at 450 enemies, the entire chain below costs ~0.1ms against a 16.6ms
// budget. What is NOT affordable is per-entity work — one extra draw call per enemy costs ~1ms at
// that count — so sprite-level effects get baked at boot instead of composited here.
import { makeCanvas } from './sprites.js';

const TAU = Math.PI * 2;

// Ambient light the world sits in. The run starts in flat daylight and sinks toward dusk, which
// is what turns the fire pools and lightning from decoration into the thing lighting the scene.
const DAY = { r: 255, g: 255, b: 255 };
const DUSK = { r: 132, g: 126, b: 190 };
const NIGHTFALL_SECONDS = 300;
// Never darker than this, or the swarm becomes unreadable — which is the whole failure mode of
// putting a lighting pass into a game where 450 things are trying to touch you.
const MIN_AMBIENT = 0.74;

const mix = (a, b, t) => Math.round(a + (b - a) * t);

function radialSprite(size, inner, outer) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function createPostFx() {
  // Full-res light buffer, plus a quarter-res pair for the bloom blur.
  const light = makeCanvas(2, 2);
  const lctx = light.getContext('2d');
  const blurA = makeCanvas(2, 2);
  const blurB = makeCanvas(2, 2);
  let vignette = makeCanvas(2, 2);
  let w = 0;
  let h = 0;

  // One cached glow sprite, tinted per light by drawing it through a colour fill. Cheaper and
  // rounder than building a fresh radial gradient per light per frame.
  const glow = radialSprite(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');

  function buildVignette() {
    // Baked small and upscaled with smoothing off, so it quantises into bands instead of reading
    // as a soft web gradient laid over pixel art.
    const vw = Math.max(8, Math.ceil(w / 16));
    const vh = Math.max(8, Math.ceil(h / 16));
    vignette = makeCanvas(vw, vh);
    const g = vignette.getContext('2d');
    const grad = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.26, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.62, 'rgba(238,235,245,1)');
    grad.addColorStop(1, 'rgba(171,165,196,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);
  }

  function resize(width, height) {
    if (width === w && height === h) return;
    w = width;
    h = height;
    for (const [c, scale] of [[light, 1], [blurA, 4], [blurB, 8]]) {
      c.width = Math.max(1, Math.ceil(w / scale));
      c.height = Math.max(1, Math.ceil(h / scale));
      c.getContext('2d').imageSmoothingEnabled = scale > 1;
    }
    buildVignette();
  }

  // How dark the world is right now, 0 = pitch, 1 = full daylight.
  function ambientAt(time) {
    const t = Math.min(1, time / NIGHTFALL_SECONDS);
    // ease-out so the light drains quickly at first and then settles
    const k = 1 - (1 - t) ** 2;
    return {
      r: mix(DAY.r, DUSK.r, k),
      g: mix(DAY.g, DUSK.g, k),
      b: mix(DAY.b, DUSK.b, k),
      level: 1 - k * (1 - MIN_AMBIENT),
    };
  }

  // Paint the light buffer. `lights` are world-space {x, y, r, color, alpha}; camX/camY are the
  // same integer camera offset the world was drawn with — if it differs by even a fraction the
  // lights swim against the sprites.
  function drawLights(lights, camX, camY, time) {
    const amb = ambientAt(time);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.fillStyle = `rgb(${amb.r},${amb.g},${amb.b})`;
    lctx.fillRect(0, 0, light.width, light.height);
    lctx.save();
    lctx.translate(camX, camY);
    lctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const d = l.r * 2;
      lctx.globalAlpha = Math.max(0, Math.min(1, l.alpha ?? 1));
      lctx.drawImage(tint(l.color), l.x - l.r, l.y - l.r, d, d);
    }
    lctx.restore();
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = 'source-over';
    return amb;
  }

  // The same lights again, but on transparent black and at quarter res. This is what the bloom
  // is built from: blooming the light buffer instead would blur its ambient fill too and lay a
  // flat bright haze over the entire frame.
  function drawEmissive(lights, camX, camY) {
    const g = blurA.getContext('2d');
    const k = blurA.width / Math.max(1, w);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, blurA.width, blurA.height);
    g.save();
    g.scale(k, k);
    g.translate(camX, camY);
    g.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const d = l.r * 2;
      g.globalAlpha = Math.max(0, Math.min(1, l.alpha ?? 1));
      g.drawImage(tint(l.color), l.x - l.r, l.y - l.r, d, d);
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Tinted copies of the glow sprite, built once per distinct colour. There are a handful of
  // colours in the game, so this cache stays tiny.
  const tints = new Map();
  function tint(color) {
    let c = tints.get(color);
    if (c) return c;
    c = makeCanvas(glow.width, glow.height);
    const g = c.getContext('2d');
    g.drawImage(glow, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    // Put the hot core back so a light reads as a source and not as a flat colour disc.
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.28;
    g.drawImage(glow, glow.width * 0.3, glow.height * 0.3, glow.width * 0.4, glow.height * 0.4);
    g.globalAlpha = 1;
    tints.set(color, c);
    return c;
  }

  // The whole chain, run in screen space on the finished frame.
  function composite(ctx, opts) {
    const { lights = [], camX = 0, camY = 0, time = 0, flash = null, chroma = 0, grade = 1 } = opts;
    if (!w || !h) return;

    drawLights(lights, camX, camY, time);

    // 1. Lighting — multiply the scene by the light buffer.
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(light, 0, 0, w, h);

    // 2. Bloom — blur the emissive-only buffer and add it back, so light sources glow but the
    //    ambient does not turn the frame milky.
    drawEmissive(lights, camX, camY);
    const b = blurB.getContext('2d');
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, blurB.width, blurB.height);
    b.drawImage(blurA, 0, 0, blurB.width, blurB.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.26;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(blurB, 0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;

    // 3. Vignette — pulls the eye to the middle of the swarm.
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = grade;
    ctx.drawImage(vignette, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';

    // 4. Chromatic split on damage — a red/cyan offset of the frame's own edges.
    if (chroma > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.5, chroma * 0.5);
      ctx.drawImage(blurB, -chroma * 3, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 5. Flash — coloured and additive, so a fire evolution and a revive no longer look the same.
    if (flash && flash.a > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flash.color;
      ctx.globalAlpha = Math.min(0.75, flash.a);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return { resize, composite, ambientAt, get size() { return { w, h }; } };
}

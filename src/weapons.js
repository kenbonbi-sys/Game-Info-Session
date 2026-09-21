// Every weapon the fox can carry: when it fires, what it spawns, and how that thing is drawn.
// Weapons never reach into the loop directly — they go through the context object G that main.js
// builds (G.hit, G.burst, G.near, G.enemies, …), so the loop owns kills, XP and particles.
import { WEAPONS } from './entities.js';
import { pixelDot, ring, rand } from './draw.js';

const TAU = Math.PI * 2;

// Enemies whose hit circle overlaps a circle in world space.
function inCircle(G, x, y, r) {
  const out = [];
  for (const e of G.hash.query(x, y + 20, r + 40)) {
    if (e.hp <= 0) continue;
    const dx = e.x - x;
    const dy = e.y - e.hitY - y;
    if (dx * dx + dy * dy <= (r + e.hitR) ** 2) out.push(e);
  }
  return out;
}

function splash(G, x, y, r, dmg, color = '#ffb347') {
  for (const e of inCircle(G, x, y, r)) {
    const dx = e.x - x;
    const dy = e.y - e.hitY - y;
    const l = Math.hypot(dx, dy) || 1;
    G.hit(e, dmg, dx / l, dy / l, 60);
  }
  G.burst(x, y, 14, color, 90);
  G.ripples.push({ x, y, r, life: 0.28, max: 0.28, color });
}

// ---- Firing ----------------------------------------------------------------
// One entry per weapon key. Each owns its cooldown in player.cd and pushes into G.

const FIRE = {
  foxfire(dt, s, G) {
    const P = G.player;
    P.cd.foxfire -= dt;
    if (P.cd.foxfire > 0) return;
    const targets = G.near(P.x, P.y, s.range, s.count);
    if (!targets.length) return;
    P.cd.foxfire = s.cooldown;
    const sx = P.x;
    const sy = P.y - P.hitY;
    for (let i = 0; i < s.count; i++) {
      const t = targets[i % targets.length];
      // Extra fireballs beyond the number of visible targets fan out instead of stacking.
      const spread = i >= targets.length ? (i - targets.length + 1) * 0.3 * (i % 2 ? 1 : -1) : 0;
      const a = Math.atan2(t.y - t.hitY - sy, t.x - sx) + spread;
      G.shots.push({
        kind: 'fire', x: sx, y: sy, r: 3, life: 1.5, hit: new Set(),
        vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.dmg, pierce: s.pierce, blast: s.blast,
      });
    }
  },

  frost(dt, s, G) {
    const P = G.player;
    P.cd.frost -= dt;
    if (P.cd.frost > 0) return;
    const [target] = G.near(P.x, P.y, s.range, 1);
    if (!target) return;
    P.cd.frost = s.cooldown;
    const sx = P.x;
    const sy = P.y - P.hitY;
    const base = Math.atan2(target.y - target.hitY - sy, target.x - sx);
    for (let i = 0; i < s.count; i++) {
      const a = base + (i - (s.count - 1) / 2) * (s.spread / Math.max(1, s.count - 1)) * 2;
      G.shots.push({
        kind: 'frost', x: sx, y: sy, r: 2, life: 1.2, hit: new Set(),
        vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.dmg, pierce: s.pierce, slow: s.slow, slowFor: s.slowFor, shatter: s.shatter,
      });
    }
  },

  talisman(dt, s, G) {
    const P = G.player;
    P.cd.talisman -= dt;
    if (P.cd.talisman > 0) return;
    P.cd.talisman = s.cooldown;
    const [target] = G.near(P.x, P.y, 300, 1);
    const base = target ? Math.atan2(target.y - target.hitY - (P.y - P.hitY), target.x - P.x) : (P.facing > 0 ? 0 : Math.PI);
    for (let i = 0; i < s.count; i++) {
      const a = base + (i * TAU) / s.count;
      G.shots.push({
        kind: 'talisman', x: P.x, y: P.y - P.hitY, r: 4, life: s.life, max: s.life, hit: new Set(),
        vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.dmg, reach: s.reach, seek: s.seek, spin: rand(6, 9), angle: 0, clearAt: 0.45,
      });
    }
  },

  lantern(dt, s, G) {
    const P = G.player;
    P.cd.lantern -= dt;
    if (P.cd.lantern > 0) return;
    P.cd.lantern = s.cooldown;
    for (let i = 0; i < s.pools; i++) {
      const a = Math.random() * TAU;
      const d = rand(18, 70);
      G.zones.push({
        x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d * 0.7,
        r: s.radius, dmg: s.dmg, tick: s.tick, t: 0, life: s.life, max: s.life, burst: s.burst,
      });
    }
  },

  bolt(dt, s, G) {
    const P = G.player;
    P.cd.bolt -= dt;
    if (P.cd.bolt > 0) return;
    const targets = G.near(P.x, P.y, s.range, 40);
    if (!targets.length) return;
    P.cd.bolt = s.cooldown;
    // Strikes scatter over the crowd instead of all landing on the closest slime.
    for (let i = 0; i < s.strikes; i++) {
      const e = targets[(Math.random() * targets.length) | 0];
      strike(G, e.x, e.y - e.hitY, s, 0);
    }
  },

  claw(dt, s, G) {
    const P = G.player;
    P.cd.claw -= dt;
    if (P.cd.claw > 0) return;
    P.cd.claw = s.cooldown;
    const facing = P.facing > 0 ? 0 : Math.PI;
    for (let sweep = 0; sweep < s.sweeps; sweep++) {
      for (let side = 0; side < s.sides; side++) {
        const a = facing + side * Math.PI + (sweep - (s.sweeps - 1) / 2) * 0.5;
        G.claws.push({ x: P.x, y: P.y - P.hitY, a, reach: s.reach, arc: s.arc, life: 0.22, max: 0.22 });
        for (const e of inCircle(G, P.x, P.y - P.hitY, s.reach)) {
          const dx = e.x - P.x;
          const dy = (e.y - e.hitY - (P.y - P.hitY)) * 1.6;
          // The arc is measured wide-and-flat so a top-down slash still feels like a swipe.
          let diff = Math.abs(Math.atan2(dy, dx) - a) % TAU;
          if (diff > Math.PI) diff = TAU - diff;
          if (diff > s.arc) continue;
          const l = Math.hypot(dx, dy) || 1;
          G.hit(e, s.dmg, dx / l, dy / l, s.knock);
        }
      }
    }
  },
};

// Lightning: an instant column on one enemy, which may arc on to its neighbours.
function strike(G, x, y, s, depth, seen = new Set()) {
  G.bolts.push({ x, y, r: s.radius, life: 0.22, max: 0.22 });
  G.shakeBy(1.5);
  for (const e of inCircle(G, x, y, s.radius)) {
    if (seen.has(e)) continue;
    seen.add(e);
    G.hit(e, s.dmg, 0, -1, 60, { crit: s.alwaysCrit });
  }
  if (depth >= s.chain) return;
  for (const next of G.near(x, y, 90, 3)) {
    if (seen.has(next)) continue;
    strike(G, next.x, next.y - next.hitY, s, depth + 1, seen);
    break;
  }
}

// ---- Per-frame weapons -----------------------------------------------------
// Orbs, the tail spin and the aura live on the fox instead of spawning entities.

function tickOrbs(dt, s, G) {
  const P = G.player;
  P.orbAngle += dt * s.spin;
  P.orbs.length = 0;
  const perRing = Math.ceil(s.count / s.rings);
  for (let i = 0; i < s.count; i++) {
    const ringIndex = Math.floor(i / perRing);
    const dir = ringIndex % 2 === 0 ? 1 : -1;
    const radius = s.radius * (ringIndex === 0 ? 1 : 0.62);
    const a = P.orbAngle * dir + ((i % perRing) * TAU) / perRing;
    const ox = P.x + Math.cos(a) * radius;
    const oy = P.y - P.hitY + Math.sin(a) * radius * 0.8;
    P.orbs.push({ x: ox, y: oy, big: ringIndex === 0 });
    for (const e of inCircle(G, ox, oy, 5)) {
      if (e.orbCd > 0) continue;
      e.orbCd = s.tick;
      const dx = e.x - ox;
      const dy = e.y - e.hitY - oy;
      const l = Math.hypot(dx, dy) || 1;
      G.hit(e, s.dmg, dx / l, dy / l, 80);
    }
  }
}

function tickSpin(dt, s, G) {
  const P = G.player;
  P.cd.spin -= dt;
  if (P.cd.spin > 0) return;
  P.cd.spin = s.cooldown;
  P.spinFx = 0.3;
  P.spinRadius = s.radius;
  for (let pulse = 0; pulse < s.pulses; pulse++) {
    const radius = s.radius * (pulse === 0 ? 1 : 1.25);
    for (const e of inCircle(G, P.x, P.y - P.hitY / 2, radius)) {
      const dx = e.x - P.x;
      const dy = e.y - P.y;
      const l = Math.hypot(dx, dy) || 1;
      G.hit(e, s.dmg, dx / l, dy / l, s.knock);
      if (s.stun) e.stun = Math.max(e.stun, s.stun);
    }
  }
}

function tickAura(dt, s, G) {
  const P = G.player;
  P.auraRadius = s.radius;
  P.auraFx = (P.auraFx + dt) % 1;
  P.cd.aura -= dt;
  if (P.cd.aura > 0) return;
  P.cd.aura = s.tick;
  let touched = 0;
  for (const e of inCircle(G, P.x, P.y - P.hitY / 2, s.radius)) {
    if (e.auraCd > 0) continue;
    e.auraCd = s.tick * 0.9;
    const dx = e.x - P.x;
    const dy = e.y - P.y;
    const l = Math.hypot(dx, dy) || 1;
    G.hit(e, s.dmg, dx / l, dy / l, s.knock);
    touched++;
  }
  if (touched && s.drain) {
    const healed = P.heal(s.drain);
    if (healed) G.texts.push({ x: P.x, y: P.y - P.hitY * 2 - 10, text: `+${healed}`, life: 0.6, color: '#7dffb0' });
  }
}

export function updateWeapons(dt, G) {
  const P = G.player;
  P.orbs.length = 0;
  P.auraRadius = 0;
  for (const [key, level] of Object.entries(P.weapons)) {
    const def = WEAPONS[key];
    if (!def || level <= 0) continue;
    const s = def.stats(level, G.m, !!P.evolved[key]);
    if (key === 'orbs') tickOrbs(dt, s, G);
    else if (key === 'spin') tickSpin(dt, s, G);
    else if (key === 'aura') tickAura(dt, s, G);
    else FIRE[key]?.(dt, s, G);
  }
  P.spinFx = Math.max(0, P.spinFx - dt);
  updateShots(dt, G);
  updateZones(dt, G);
}

// ---- Things already in the air ---------------------------------------------

function onShotHit(G, p, e) {
  const l = Math.hypot(p.vx, p.vy) || 1;
  G.hit(e, p.dmg, p.vx / l, p.vy / l, p.kind === 'frost' ? 50 : 90);
  if (p.slow) {
    e.slow = Math.max(e.slow, p.slowFor);
    e.slowMul = Math.min(e.slowMul, p.slow);
  }
  if (p.blast) splash(G, p.x, p.y, p.blast, p.dmg * 0.7, '#ff8a3b');
  if (p.shatter) {
    for (let i = 0; i < p.shatter; i++) {
      const a = Math.atan2(p.vy, p.vx) + rand(-1.2, 1.2);
      G.shots.push({
        kind: 'frost', x: p.x, y: p.y, r: 1, life: 0.5, hit: new Set([e]),
        vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
        dmg: p.dmg * 0.6, pierce: 0, slow: p.slow, slowFor: p.slowFor * 0.6, shatter: 0,
      });
    }
  }
  G.burst(p.x, p.y, 4, p.kind === 'frost' ? '#bfe9ff' : '#ffb347');
}

function updateShots(dt, G) {
  const P = G.player;
  for (const p of G.shots) {
    if (p.kind === 'talisman') {
      const t = 1 - p.life / p.max;
      // Out on the way, hauled back on the way in — the arc is the pull, not a scripted path.
      const pull = (t - 0.4) * 2 * (p.reach / 90);
      const dx = P.x - p.x;
      const dy = P.y - P.hitY - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d) * pull * 120 * dt;
      p.vy += (dy / d) * pull * 120 * dt;
      if (p.seek) {
        const [target] = G.near(p.x, p.y, p.seek, 1);
        if (target) {
          const tx = target.x - p.x;
          const ty = target.y - target.hitY - p.y;
          const tl = Math.hypot(tx, ty) || 1;
          p.vx += (tx / tl) * 200 * dt;
          p.vy += (ty / tl) * 200 * dt;
        }
      }
      p.angle += p.spin * dt;
      p.clearAt -= dt;
      if (p.clearAt <= 0) {
        p.clearAt = 0.45;
        p.hit.clear();
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.kind !== 'talisman' && G.particles.length < G.maxParticles && Math.random() < 0.7) {
      const cold = p.kind === 'frost';
      G.particles.push({
        x: p.x, y: p.y, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.3, max: 0.3, size: 1,
        color: cold ? (Math.random() < 0.5 ? '#bfe9ff' : '#6ec6ff') : (Math.random() < 0.5 ? '#ffb347' : '#ff6a2b'),
      });
    }
    for (const e of inCircle(G, p.x, p.y, p.r)) {
      if (p.hit.has(e)) continue;
      p.hit.add(e);
      onShotHit(G, p, e);
      if (p.kind === 'talisman') continue;
      if (p.pierce-- <= 0) {
        p.life = 0;
        break;
      }
    }
  }
  G.compact(G.shots, p => p.life > 0);
}

function updateZones(dt, G) {
  for (const z of G.zones) {
    z.life -= dt;
    z.t -= dt;
    if (z.t <= 0) {
      z.t = z.tick;
      for (const e of inCircle(G, z.x, z.y, z.r)) {
        if (e.zoneCd > 0) continue;
        e.zoneCd = z.tick * 0.9;
        G.hit(e, z.dmg, 0, -1, 10);
      }
    }
    if (G.particles.length < G.maxParticles && Math.random() < 0.5) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * z.r;
      G.particles.push({
        x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d * 0.6,
        vx: rand(-4, 4), vy: rand(-16, -6), life: 0.5, max: 0.5, size: 1,
        color: Math.random() < 0.5 ? '#ff9f4a' : '#ffd23f',
      });
    }
    if (z.life <= 0 && z.burst) splash(G, z.x, z.y, z.r * 1.4, z.burst, '#ff6a2b');
  }
  G.compact(G.zones, z => z.life > 0);
}

// ---- Drawing ---------------------------------------------------------------

// Ground-level effects, drawn under everything that walks.
export function drawGroundFx(ctx, G) {
  for (const z of G.zones) {
    const fade = Math.min(1, z.life / 0.6);
    ctx.globalAlpha = 0.28 * fade;
    ctx.fillStyle = '#ff6a2b';
    ctx.beginPath();
    ctx.ellipse(Math.round(z.x), Math.round(z.y), z.r, z.r * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.6 * fade;
    ring(ctx, z.x, z.y, z.r, '#ffd23f', 1, 0.62);
    ctx.globalAlpha = 1;
  }
  const P = G.player;
  if (P.auraRadius > 0) {
    const pulse = 0.85 + Math.sin(P.auraFx * TAU) * 0.15;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.ellipse(Math.round(P.x), Math.round(P.y - P.hitY / 2), P.auraRadius * pulse, P.auraRadius * pulse * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ring(ctx, P.x, P.y - P.hitY / 2, P.auraRadius * pulse, '#fff3c4', 1);
    ctx.globalAlpha = 1;
  }
  if (P.spinFx > 0) {
    const t = P.spinFx / 0.3;
    ctx.globalAlpha = 1;
    ring(ctx, P.x, P.y - P.hitY / 2, P.spinRadius * (1 - t * 0.5), `rgba(255, 190, 110, ${t})`, 2);
  }
}

// Effects over the crowd: orbs, shots, slashes, lightning, particles, damage numbers.
export function drawWeaponFx(ctx, G) {
  for (const c of G.claws) {
    const t = c.life / c.max;
    ctx.globalAlpha = t;
    ctx.strokeStyle = '#fff3e0';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const r = c.reach * (0.55 + i * 0.22) * (1.15 - t * 0.15);
      ctx.beginPath();
      ctx.ellipse(Math.round(c.x), Math.round(c.y), r, r * 0.62, 0, c.a - c.arc, c.a + c.arc);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  for (const b of G.bolts) {
    const t = b.life / b.max;
    ctx.globalAlpha = t;
    ctx.fillStyle = '#fdf6a0';
    // A jagged column dropping onto the strike point.
    let x = b.x;
    for (let y = b.y - 90; y < b.y; y += 6) {
      x += rand(-3, 3);
      ctx.fillRect(Math.round(x), Math.round(y), 2, 6);
    }
    ctx.globalAlpha = t * 0.8;
    ring(ctx, b.x, b.y, b.r * (1.4 - t * 0.4), '#fdf6a0', 2, 0.6);
    ctx.globalAlpha = 1;
  }

  for (const r of G.ripples) {
    const t = r.life / r.max;
    ctx.globalAlpha = t;
    ring(ctx, r.x, r.y, r.r * (1.5 - t * 0.5), r.color, 2, 0.7);
    ctx.globalAlpha = 1;
  }

  for (const o of G.player.orbs) {
    const x = Math.round(o.x);
    const y = Math.round(o.y);
    ctx.globalAlpha = 0.35;
    pixelDot(ctx, x, y, o.big ? 4 : 3, '#b06cff');
    ctx.globalAlpha = 1;
    pixelDot(ctx, x, y, o.big ? 2 : 1, '#d9b8ff');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 1);
  }

  for (const p of G.shots) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (p.kind === 'talisman') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#f5e6c8';
      ctx.fillRect(-3, -4, 6, 8);
      ctx.fillStyle = '#c62f3a';
      ctx.fillRect(-1, -3, 2, 6);
      ctx.restore();
      continue;
    }
    const cold = p.kind === 'frost';
    ctx.globalAlpha = 0.35;
    pixelDot(ctx, x, y, 4, cold ? '#6ec6ff' : '#ff6a2b');
    ctx.globalAlpha = 1;
    pixelDot(ctx, x, y, 2, cold ? '#bfe9ff' : '#ffb347');
    pixelDot(ctx, x, y, 1, cold ? '#ffffff' : '#fff1c1');
  }
}

export function updateWeaponFx(dt, G) {
  for (const c of G.claws) c.life -= dt;
  G.compact(G.claws, c => c.life > 0);
  for (const b of G.bolts) b.life -= dt;
  G.compact(G.bolts, b => b.life > 0);
  for (const r of G.ripples) r.life -= dt;
  G.compact(G.ripples, r => r.life > 0);
}

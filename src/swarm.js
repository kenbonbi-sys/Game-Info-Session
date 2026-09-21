// The other side of the fight: what walks in, how each kind of thing behaves, what it leaves
// behind. The director owns the clock — which enemies the wave sends and which set pieces fire.
import { ENEMY_TYPES, Enemy } from './entities.js';
import { drawHpBar, drawText, pixelDot, rand, pick, chance, shadow } from './draw.js';

const TAU = Math.PI * 2;

// ---- Waves -----------------------------------------------------------------
// rate = enemies per second before the clock ramp. The last row keeps running forever.

export const WAVES = [
  // The first 90 seconds only send things slower than the fox, so a moving player is safe and
  // can build. Anything that can actually catch you arrives as a set piece first.
  { at: 0, rate: 1.2, pool: ['green'] },
  { at: 25, rate: 2.0, pool: ['green', 'green', 'purple'] },
  { at: 55, rate: 2.6, pool: ['green', 'purple', 'purple'] },
  { at: 90, rate: 3.0, pool: ['purple', 'bat', 'toad', 'green'] },
  { at: 130, rate: 3.4, pool: ['purple', 'bandit', 'toad', 'bat'] },
  { at: 175, rate: 3.8, pool: ['purple', 'blue', 'bandit', 'archer', 'puff'] },
  { at: 225, rate: 4.2, pool: ['blue', 'wisp', 'boar', 'bandit', 'archer', 'puff'] },
  { at: 285, rate: 4.6, pool: ['blue', 'wisp', 'boar', 'archer', 'puff', 'bat'] },
  { at: 350, rate: 5.0, pool: ['blue', 'wisp', 'boar', 'archer', 'bandit', 'puff', 'purple'] },
  { at: 430, rate: 5.6, pool: ['blue', 'wisp', 'boar', 'archer', 'bandit', 'puff', 'brute'] },
];

// Set pieces on a fixed clock. Once the list runs out the late rotation repeats every 45s.
export const EVENTS = [
  { at: 55, kind: 'ring', type: 'bat', count: 12, note: '🦇 Bầy dơi kéo tới!' },
  { at: 80, kind: 'gang', note: '🔫 Băng cướp phục kích!' },
  { at: 95, kind: 'mule', note: '💰 Cướp áp tải ôm rương — chặn nó lại!' },
  { at: 118, kind: 'line', type: 'puff', count: 12, note: '🍄 Một hàng nấm nổ' },
  { at: 140, kind: 'single', type: 'brute', note: '💀 Cướp Đầu Gấu!' },
  { at: 165, kind: 'ring', type: 'wisp', count: 14, note: '👻 Bóng ma vây quanh!' },
  { at: 190, kind: 'boss', note: '⚠ QUÁI KHÓI xuất hiện!' },
  { at: 215, kind: 'gang', big: true, note: '🔫 Cả băng cướp kéo tới!' },
  { at: 245, kind: 'mule', note: '💰 Lại một chuyến áp tải!' },
  { at: 270, kind: 'single', type: 'brute', count: 2, note: '💀 Hai Đầu Gấu!' },
  { at: 300, kind: 'captain', note: '👑 ĐẦU LĨNH CƯỚP ra mặt!' },
];

const LATE_ROTATION = [
  { kind: 'gang', big: true, note: '🔫 Băng cướp lại kéo tới!' },
  { kind: 'ring', type: 'bat', count: 34, note: '🦇 Bầy dơi dày đặc!' },
  { kind: 'single', type: 'brute', count: 3, note: '💀 Ba Đầu Gấu!' },
  { kind: 'mule', note: '💰 Cướp áp tải!' },
  { kind: 'boss', note: '⚠ QUÁI KHÓI!' },
  { kind: 'ring', type: 'wisp', count: 22, note: '👻 Bóng ma vây quanh!' },
  { kind: 'captain', note: '👑 ĐẦU LĨNH CƯỚP!' },
];

export function waveAt(t) {
  let out = WAVES[0];
  for (const w of WAVES) if (t >= w.at) out = w;
  return out;
}

// ---- Spawning --------------------------------------------------------------

function offscreen(G, angle = Math.random() * TAU, pad = 30) {
  const { cam, player: P, bounds } = G;
  const d = Math.hypot(cam.w, cam.h) / 2 + pad;
  return {
    x: Math.max(12, Math.min(bounds.w - 12, P.x + Math.cos(angle) * d)),
    y: Math.max(12, Math.min(bounds.h - 12, P.y + Math.sin(angle) * d)),
  };
}

export function spawnEnemy(G, type, x, y) {
  if (G.enemies.length >= G.maxEnemies) return null;
  const e = new Enemy(type, x, y, G.hpMul());
  G.enemies.push(e);
  return e;
}

// Not a closed ring: the arc leaves a third of the circle open, so being surrounded is always
// something the player can run out of instead of a sentence.
function spawnRing(G, type, count) {
  const turn = Math.random() * TAU;
  const arc = TAU * (2 / 3);
  for (let i = 0; i < count; i++) {
    const p = offscreen(G, turn + (i / Math.max(1, count - 1) - 0.5) * arc, 16);
    spawnEnemy(G, type, p.x, p.y);
  }
}

function spawnLine(G, type, count) {
  const a = Math.random() * TAU;
  const p = offscreen(G, a);
  const px = -Math.sin(a);
  const py = Math.cos(a);
  for (let i = 0; i < count; i++) {
    const off = (i - count / 2) * 18;
    spawnEnemy(G, type, p.x + px * off, p.y + py * off);
  }
}

function spawnCluster(G, roster) {
  const p = offscreen(G, Math.random() * TAU, 20);
  for (const [type, count] of roster) {
    for (let i = 0; i < count; i++) spawnEnemy(G, type, p.x + rand(-40, 40), p.y + rand(-34, 34));
  }
}

function runEvent(G, ev) {
  if (ev.note) G.toast(ev.note);
  switch (ev.kind) {
    case 'ring': return spawnRing(G, ev.type, ev.count);
    case 'line': return spawnLine(G, ev.type, ev.count);
    case 'gang': return spawnCluster(G, ev.big
      ? [['bandit', 9], ['archer', 5], ['brute', 1]]
      : [['bandit', 5], ['archer', 2]]);
    case 'mule': {
      const p = offscreen(G, Math.random() * TAU, 10);
      return spawnEnemy(G, 'mule', p.x, p.y);
    }
    case 'captain': {
      const p = offscreen(G, Math.random() * TAU, 10);
      spawnEnemy(G, 'captain', p.x, p.y);
      return spawnCluster(G, [['bandit', 4], ['archer', 2]]);
    }
    case 'boss': {
      const p = offscreen(G, Math.random() * TAU, 10);
      return spawnEnemy(G, 'boss', p.x, p.y);
    }
    default: {
      for (let i = 0; i < (ev.count ?? 1); i++) {
        const p = offscreen(G, Math.random() * TAU, 10);
        spawnEnemy(G, ev.type, p.x, p.y);
      }
    }
  }
}

// Trickle spawns from the current wave, plus any set piece whose clock has come round.
export function runDirector(dt, G) {
  const t = G.state.time;
  const wave = waveAt(t);
  G.wave = WAVES.indexOf(wave) + 1;
  G.spawnTimer += dt * wave.rate * (1 + t / 260);
  const cap = Math.min(G.maxEnemies, 70 + t * 2.6);
  while (G.spawnTimer >= 1) {
    G.spawnTimer -= 1;
    if (G.enemies.length >= cap) continue;
    const type = pick(wave.pool);
    // Most spawns trickle in alone; now and then a knot of them walks in together.
    const group = t > 20 && chance(0.16) ? 5 : 1;
    const p = offscreen(G);
    for (let i = 0; i < group; i++) spawnEnemy(G, type, p.x + rand(-16, 16), p.y + rand(-16, 16));
  }

  while (G.nextEvent < EVENTS.length && t >= EVENTS[G.nextEvent].at) runEvent(G, EVENTS[G.nextEvent++]);
  if (G.nextEvent >= EVENTS.length) {
    G.lateTimer -= dt;
    if (G.lateTimer <= 0) {
      G.lateTimer = 45;
      runEvent(G, LATE_ROTATION[G.lateIndex++ % LATE_ROTATION.length]);
    }
  }
}

// ---- Enemy shots -----------------------------------------------------------

function fireFoeShot(G, e, angle) {
  const s = e.shot;
  G.foeShots.push({
    x: e.x, y: e.y - e.hitY, r: s.r, dmg: s.dmg, life: s.life, color: s.color,
    vx: Math.cos(angle) * s.speed, vy: Math.sin(angle) * s.speed,
  });
}

export function updateFoeShots(dt, G) {
  const P = G.player;
  for (const p of G.foeShots) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    const dx = P.x - p.x;
    const dy = P.y - P.hitY - p.y;
    if (dx * dx + dy * dy < (p.r + 7) ** 2) {
      p.life = 0;
      G.hurtPlayer(p.dmg, p.x, p.y);
    }
  }
  G.compact(G.foeShots, p => p.life > 0);
}

// ---- Behaviour -------------------------------------------------------------

export function updateEnemies(dt, G) {
  const P = G.player;
  const knockDecay = Math.exp(-dt * 8);
  // Anything that falls two screens behind is forgotten, and its slot goes back to the director.
  // Without this the map silently fills with slimes nobody will ever see and the swarm walls the
  // player in instead of chasing them.
  const cull = Math.hypot(G.cam.w, G.cam.h) * 1.15;
  G.hash.clear();
  for (const e of G.enemies) G.hash.insert(e);

  for (const e of G.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    e.orbCd = Math.max(0, e.orbCd - dt);
    e.auraCd = Math.max(0, e.auraCd - dt);
    e.zoneCd = Math.max(0, e.zoneCd - dt);
    e.talCd = Math.max(0, e.talCd - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.slow = Math.max(0, e.slow - dt);
    if (e.slow === 0) e.slowMul = 1;
    e.timer -= dt;

    const dx = P.x - e.x;
    const dy = P.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > cull && !e.boss && !e.elite && e.ai !== 'flee') {
      e.hp = 0;
      e.escaped = true;
      continue;
    }
    const nx = dx / d;
    const ny = dy / d;
    const mul = e.stun > 0 ? 0 : e.slowMul;
    const speed = e.baseSpeed * mul;
    e.phase += dt * e.fps * (mul || 0.25);

    let vx = nx * speed;
    let vy = ny * speed;

    switch (e.ai) {
      case 'weave': {
        // Bats never fly straight at you, which is what makes a cloud of them hard to read.
        e.seed += dt * 3.4;
        const wob = Math.sin(e.seed) * 0.85;
        vx = (nx - ny * wob) * speed;
        vy = (ny + nx * wob) * speed;
        break;
      }
      case 'ghost': {
        e.seed += dt * 1.6;
        vx = nx * speed * (0.85 + Math.sin(e.seed) * 0.25);
        vy = ny * speed * (0.85 + Math.cos(e.seed * 0.8) * 0.25);
        break;
      }
      case 'charger': {
        const c = e.charge;
        if (e.state === 'walk') {
          if (d < c.range && e.timer <= 0) {
            e.state = 'wind';
            e.timer = c.wind;
          }
        } else if (e.state === 'wind') {
          // Rocks backwards first: the tell that a charge is coming.
          vx = -nx * speed * 0.35;
          vy = -ny * speed * 0.35;
          if (e.timer <= 0) {
            e.state = 'dash';
            e.timer = c.dash;
            e.dvx = nx * e.baseSpeed * c.power;
            e.dvy = ny * e.baseSpeed * c.power;
            G.burst(e.x, e.y - 3, 7, e.color, 70);
          }
        } else if (e.state === 'dash') {
          vx = e.dvx * (mul || 0.2);
          vy = e.dvy * (mul || 0.2);
          if (e.timer <= 0) {
            e.state = 'rest';
            e.timer = c.rest;
          }
        } else {
          vx = 0;
          vy = 0;
          if (e.timer <= 0) {
            e.state = 'walk';
            e.timer = 1;
          }
        }
        break;
      }
      case 'ranged': {
        const want = e.shot.range;
        // Kites: closes to its range, backs off when the fox walks into its face.
        const drift = d > want * 1.1 ? 1 : d < want * 0.62 ? -0.9 : 0;
        vx = nx * speed * drift;
        vy = ny * speed * drift;
        e.shotCd -= dt * (mul || 0.2);
        if (e.shotCd <= 0 && d < want * 1.35) {
          e.shotCd = e.shot.rate;
          e.state = 'shoot';
          e.timer = 0.25;
          fireFoeShot(G, e, Math.atan2(P.y - P.hitY - (e.y - e.hitY), P.x - e.x));
        } else if (e.state === 'shoot' && e.timer <= 0) {
          e.state = 'walk';
        }
        break;
      }
      case 'flee': {
        vx = -nx * speed;
        vy = -ny * speed;
        e.life -= dt;
        if (e.life <= 0) {
          e.hp = 0;
          e.escaped = true;
          G.toast('💨 Cướp áp tải ôm rương chạy mất!');
        }
        break;
      }
      case 'captain': {
        e.shotCd -= dt * (mul || 0.2);
        if (e.shotCd <= 0) {
          e.shotCd = e.shot.rate;
          e.state = 'shoot';
          e.timer = 0.4;
          e.seed += 0.4;
          for (let i = 0; i < e.shot.volley; i++) fireFoeShot(G, e, e.seed + (i * TAU) / e.shot.volley);
        } else if (e.state === 'shoot' && e.timer <= 0) {
          e.state = 'walk';
        }
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = e.summon.every;
          for (let i = 0; i < e.summon.count; i++) {
            const a = (i * TAU) / e.summon.count + Math.random();
            spawnEnemy(G, e.summon.type, e.x + Math.cos(a) * 42, e.y + Math.sin(a) * 32);
          }
          G.toast('👑 Đầu lĩnh gọi thêm quân!');
        }
        break;
      }
      default:
        break;
    }

    // Crowd separation, so a swarm spreads into a wall instead of stacking on one pixel.
    let sx = 0;
    let sy = 0;
    for (const o of G.hash.query(e.x, e.y, e.r + 20)) {
      if (o === e) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const min = e.r + o.r;
      const d2 = ox * ox + oy * oy;
      if (d2 >= min * min || d2 < 1e-4) continue;
      const l = Math.sqrt(d2);
      sx += (ox / l) * (min - l);
      sy += (oy / l) * (min - l);
    }

    e.x += (vx + e.kx) * dt + sx * 0.5;
    e.y += (vy + e.ky) * dt + sy * 0.5;
    e.kx *= knockDecay;
    e.ky *= knockDecay;
    if (!e.ghost) G.world.collide(e);
    else {
      e.x = Math.max(e.r, Math.min(G.bounds.w - e.r, e.x));
      e.y = Math.max(e.r, Math.min(G.bounds.h - e.r, e.y));
    }

    if (e.dmg > 0 && d < e.r + P.r + 2) {
      G.hurtPlayer(e.state === 'dash' ? e.dmg * 1.4 : e.dmg, e.x, e.y - e.hitY);
    }
  }
}

// ---- Death and loot --------------------------------------------------------

const DROPS = {
  heart: { color: '#ff6b6b', r: 5 },
  coin: { color: '#ffd23f', r: 4 },
  magnet: { color: '#5ad1ff', r: 5 },
  bomb: { color: '#c9d1e0', r: 5 },
  chest: { color: '#ffd23f', r: 7 },
};

function drop(G, kind, x, y, value = 0) {
  G.drops.push({ kind, x, y, value, r: DROPS[kind].r, vx: rand(-20, 20), vy: rand(-20, 20), pull: false, taken: false, bob: Math.random() * TAU });
}

// Called by the loop the moment an enemy's hp hits 0.
export function onEnemyDeath(e, G) {
  if (e.escaped) return;
  if (e.explode) {
    G.ripples.push({ x: e.x, y: e.y - e.hitY, r: e.explode.r, life: 0.3, max: 0.3, color: '#ff9f4a' });
    G.burst(e.x, e.y - e.hitY, 20, '#ff9f4a', 110);
    for (const o of G.hash.query(e.x, e.y, e.explode.r + 40)) {
      if (o === e || o.hp <= 0) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const l = Math.hypot(dx, dy) || 1;
      if (l < e.explode.r + o.r) G.hit(o, e.explode.dmg, dx / l, dy / l, 120);
    }
    const px = G.player.x - e.x;
    const py = G.player.y - e.y;
    if (Math.hypot(px, py) < e.explode.r + G.player.r) G.hurtPlayer(e.explode.dmg, e.x, e.y - e.hitY);
    G.shakeBy(3);
  }

  const luck = G.m.drop;
  if (e.chest) {
    drop(G, 'chest', e.x, e.y - 2, e.chest);
  } else {
    if (e.gold > 0 && chance(0.55 * luck)) drop(G, 'coin', e.x + rand(-4, 4), e.y - 2, e.gold);
    if (chance((e.elite ? 0.5 : 0.03) * luck)) drop(G, 'heart', e.x + rand(-4, 4), e.y - 2, 35);
    if (chance((e.elite ? 0.3 : 0.008) * luck)) drop(G, 'magnet', e.x + rand(-4, 4), e.y - 2);
    if (chance((e.elite ? 0.3 : 0.006) * luck)) drop(G, 'bomb', e.x + rand(-4, 4), e.y - 2);
  }
  if (e.boss) G.toast(`☠ Hạ được ${e.name}!`);
}

export function updateDrops(dt, G) {
  const P = G.player;
  const damp = Math.exp(-dt * 6);
  const reach = P.pickup * 0.85;
  for (const g of G.drops) {
    const dx = P.x - g.x;
    const dy = P.y - P.hitY / 2 - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < reach) g.pull = true;
    if (g.pull) {
      const step = Math.min(d, 220 * dt);
      g.x += (dx / d) * step;
      g.y += (dy / d) * step;
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= damp;
    g.vy *= damp;
    g.bob += dt * 5;
    if (d < 9) {
      g.taken = true;
      collect(G, g);
    }
  }
  G.compact(G.drops, g => !g.taken);
}

function collect(G, g) {
  const P = G.player;
  switch (g.kind) {
    case 'coin':
      P.gold += g.value;
      G.texts.push({ x: g.x, y: g.y - 8, text: `+${g.value}💰`, life: 0.7, color: '#ffd23f' });
      break;
    case 'heart': {
      const healed = P.heal(g.value);
      G.texts.push({ x: g.x, y: g.y - 8, text: `+${healed || 0}`, life: 0.8, color: '#7dffb0' });
      break;
    }
    case 'magnet':
      for (const gem of G.gems) gem.pull = true;
      for (const d of G.drops) d.pull = true;
      G.toast('🧲 Hút sạch ngọc!');
      break;
    case 'bomb': {
      let hits = 0;
      for (const e of G.enemies) {
        if (e.hp <= 0 || !G.onScreen(e, 40)) continue;
        const dx = e.x - P.x;
        const dy = e.y - P.y;
        const l = Math.hypot(dx, dy) || 1;
        G.hit(e, 180 + 30 * G.state.time / 60, dx / l, dy / l, 320);
        hits++;
      }
      G.shakeBy(7);
      G.flashScreen(0.35);
      G.toast(`💣 Nổ tung ${hits} con quái!`);
      break;
    }
    case 'chest':
      G.pendingChests.push(g.value);
      break;
    default:
      break;
  }
  G.burst(g.x, g.y, 10, DROPS[g.kind].color, 60);
}

// ---- Drawing ---------------------------------------------------------------

export function drawEnemy(ctx, e, G) {
  const sheet = G.bossSheet;
  if (e.type === 'boss' && sheet) {
    const { frames, anims, pivot, headroom } = sheet;
    const f = frames[anims.idle.frames[Math.floor(e.phase) % anims.idle.frames.length]];
    shadow(ctx, e.x, e.y, 24, 5);
    ctx.drawImage(e.flash > 0 ? sheet.flashImage : sheet.image, f.x, f.y, f.w, f.h,
      Math.round(e.x - pivot.x), Math.round(e.y - pivot.y), f.w, f.h);
    drawHpBar(ctx, e.x, e.y - headroom - 8, 48, e.hp / e.maxHp);
    drawText(ctx, e.name, e.x, e.y - headroom - 10, '#ff6b6b');
    return;
  }

  const art = G.art[e.art] ?? G.art.slimeGreen;
  const s = e.scale;
  const frame = Math.floor(e.phase) % art.frames.length;
  // A charge wind-up shakes in place; that shake is the whole warning the player gets.
  const jitter = e.state === 'wind' ? Math.round(rand(-2, 2)) : 0;
  const x = Math.round(e.x - 8 * s) + jitter;
  const hover = e.fly ? Math.round(Math.sin(e.phase * 0.5) * 2) - 5 : 0;
  const y = Math.round(e.y - 15 * s) + hover;

  shadow(ctx, e.x, e.y, 5 * s, 1.8 * s, e.fly ? 0.18 : 0.25);
  if (e.ghost) ctx.globalAlpha = 0.72;
  const image = e.flash > 0 || e.state === 'wind' ? art.flash[frame] : art.frames[frame];
  ctx.drawImage(image, x, y, 16 * s, 16 * s);
  if (e.slow > 0) {
    ctx.globalAlpha = 0.4;
    ctx.drawImage(art.frost[frame], x, y, 16 * s, 16 * s);
  }
  ctx.globalAlpha = 1;

  if (e.elite) {
    const top = e.y - 15 * s + hover - 4;
    drawHpBar(ctx, e.x, top, Math.round(20 * s), e.hp / e.maxHp, e.boss ? '#ff4d4d' : '#ff9f4a');
    drawText(ctx, e.name, e.x, top - 3, e.boss ? '#ff6b6b' : '#ffd23f');
  }
}

export function drawFoeShots(ctx, G) {
  for (const p of G.foeShots) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    ctx.globalAlpha = 0.35;
    pixelDot(ctx, x, y, p.r + 2, p.color);
    ctx.globalAlpha = 1;
    pixelDot(ctx, x, y, p.r, p.color);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 1);
  }
}

export function drawDrops(ctx, G) {
  for (const g of G.drops) {
    if (!G.onScreen(g, 16)) continue;
    const img = G.pickupArt[g.kind];
    const y = Math.round(g.y + Math.sin(g.bob) * 1.5);
    const x = Math.round(g.x);
    shadow(ctx, g.x, g.y + img.height / 2, img.width * 0.4, 2, 0.18);
    ctx.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
    if (g.kind === 'chest') drawText(ctx, 'RƯƠNG', g.x, y - img.height / 2 - 2, '#ffd23f');
  }
}

// Game loop: spawning, combat, rendering, HUD and menus.
import { buildFoxSheet, buildSlimeArt, loadAsepriteSheet, loadSvgStrip, sheetToAsepriteJson, makeCanvas } from './sprites.js';
import { Input, World, SpatialHash, WORLD } from './world.js';
import { Player, Enemy, UPGRADES, applyUpgrade, rollChoices, weaponStats } from './entities.js';
import { SPRITES } from './config.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const cam = { x: 0, y: 0, w: 0, h: 0 };
const enemyHash = new SpatialHash(24);
const state = { mode: 'loading', time: 0, kills: 0, debug: false, shake: 0, choices: [] };
const rand = (a, b) => a + Math.random() * (b - a);
const MAX_ENEMIES = 450;
const MAX_PARTICLES = 900;
const MAX_GEMS = 400;

let foxSheet, bossSheet, slimeArt, world, player;
let enemies = [], projectiles = [], gems = [], particles = [], texts = [], ghosts = [];
let spawnTimer = 0, bossTimer = 0, pendingLevelUps = 0;

function resize() {
  const scale = Math.max(2, Math.round(Math.min(innerWidth / 640, innerHeight / 360)));
  canvas.width = Math.ceil(innerWidth / scale);
  canvas.height = Math.ceil(innerHeight / scale);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
  ctx.imageSmoothingEnabled = false;
  cam.w = canvas.width;
  cam.h = canvas.height;
}

function compact(arr, keep) {
  let n = 0;
  for (const item of arr) if (keep(item)) arr[n++] = item;
  arr.length = n;
}

function fmtTime(sec) {
  const t = Math.floor(sec);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function newGame() {
  world = new World((Math.random() * 1e9) | 0);
  player = new Player(foxSheet, WORLD.w / 2, WORLD.h / 2);
  player.onDash = () => burst(player.x, player.y - 4, 10, '#fff3e0', 50);
  enemies = []; projectiles = []; gems = []; particles = []; texts = []; ghosts = [];
  Object.assign(state, { mode: 'play', time: 0, kills: 0, shake: 0, choices: [] });
  spawnTimer = 0;
  bossTimer = 60;
  pendingLevelUps = 0;
  cam.x = player.x - cam.w / 2;
  cam.y = player.y - cam.h / 2;
  hideModal();
  renderSlots();
}

// ---- Simulation --------------------------------------------------------------

function update(dt) {
  state.time += dt;
  player.update(dt, Input.axis(), Input.hit('Space'), world);
  spawn(dt);
  updateEnemies(dt);
  updateWeapons(dt);
  updateProjectiles(dt);
  compact(enemies, e => e.hp > 0);
  updateGems(dt);
  updateFx(dt);
  if (player.dead) gameOver();
  else if (pendingLevelUps > 0) openLevelUp();
}

function offscreenPoint() {
  const a = Math.random() * Math.PI * 2;
  const d = Math.hypot(cam.w, cam.h) / 2 + 20;
  return {
    x: Math.max(10, Math.min(WORLD.w - 10, player.x + Math.cos(a) * d)),
    y: Math.max(10, Math.min(WORLD.h - 10, player.y + Math.sin(a) * d)),
  };
}

function spawn(dt) {
  const t = state.time;
  spawnTimer += dt * (0.8 + t * 0.04);
  const cap = Math.min(MAX_ENEMIES, 60 + t * 3);
  const hpMul = 1 + t / 150;
  while (spawnTimer >= 1) {
    spawnTimer -= 1;
    if (enemies.length >= cap) continue;
    const type = t > 40 && Math.random() < Math.min(0.5, (t - 40) / 120) ? 'purple' : 'green';
    const group = t > 20 && Math.random() < 0.15 ? 6 : 1;
    const p = offscreenPoint();
    for (let i = 0; i < group; i++) enemies.push(new Enemy(type, p.x + rand(-15, 15), p.y + rand(-15, 15), hpMul));
  }
  bossTimer -= dt;
  if (bossTimer <= 0) {
    bossTimer = 45;
    spawnBoss();
  }
}

function spawnBoss() {
  const p = offscreenPoint();
  enemies.push(new Enemy('boss', p.x, p.y, 1 + state.time / 150));
  toast('⚠ BOSS xuất hiện!');
}

function updateEnemies(dt) {
  enemyHash.clear();
  for (const e of enemies) enemyHash.insert(e);
  const knockDecay = Math.exp(-dt * 8);
  for (const e of enemies) {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let sx = 0, sy = 0;
    for (const o of enemyHash.query(e.x, e.y, e.r + 20)) {
      if (o === e) continue;
      const ox = e.x - o.x, oy = e.y - o.y;
      const min = e.r + o.r;
      const d2 = ox * ox + oy * oy;
      if (d2 >= min * min || d2 < 1e-4) continue;
      const l = Math.sqrt(d2);
      sx += (ox / l) * (min - l);
      sy += (oy / l) * (min - l);
    }
    e.x += ((dx / d) * e.speed + e.kx) * dt + sx * 0.5;
    e.y += ((dy / d) * e.speed + e.ky) * dt + sy * 0.5;
    e.kx *= knockDecay;
    e.ky *= knockDecay;
    world.collide(e);
    e.flash = Math.max(0, e.flash - dt);
    e.orbCd = Math.max(0, e.orbCd - dt);
    e.phase += dt * e.fps;
    if (d < e.r + player.r && player.damage(e.dmg)) {
      texts.push({ x: player.x, y: player.y - player.hitY * 2 - 6, text: `-${e.dmg}`, life: 0.7, color: '#ff6b6b' });
      burst(player.x, player.y - player.hitY, 8, '#ff6b6b');
      state.shake = 3;
    }
  }
}

function nearestEnemies(x, y, range, count) {
  return enemyHash.query(x, y, range)
    .filter(e => e.hp > 0)
    .map(e => ({ e, d: (e.x - x) ** 2 + (e.y - y) ** 2 }))
    .filter(o => o.d < range * range)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map(o => o.e);
}

function hitEnemy(e, dmg, nx, ny, knock) {
  if (e.hp <= 0) return;
  const crit = Math.random() < 0.1;
  const amount = Math.round(crit ? dmg * 2 : dmg);
  e.hp -= amount;
  e.flash = 0.1;
  e.kx += (nx * knock) / e.mass;
  e.ky += (ny * knock) / e.mass;
  texts.push({ x: e.x + rand(-4, 4), y: e.y - e.hitY * 2 - 4, text: String(amount), life: 0.6, color: crit ? '#ffd23f' : '#ffffff' });
  if (e.hp <= 0) {
    state.kills++;
    if (gems.length < MAX_GEMS) {
      gems.push({ x: e.x, y: e.y - 3, value: e.xp, vx: rand(-25, 25), vy: rand(-25, 25), pull: false, taken: false });
    } else {
      gems[Math.floor(Math.random() * gems.length)].value += e.xp;
    }
    burst(e.x, e.y - e.hitY, 6 + 4 * Math.min(e.mass, 5), e.color);
  }
}

function updateWeapons(dt) {
  const w = weaponStats(player);

  if (w.foxfire) {
    player.cd.foxfire -= dt;
    if (player.cd.foxfire <= 0) {
      const targets = nearestEnemies(player.x, player.y, 260, w.foxfire.count);
      if (targets.length) {
        player.cd.foxfire = w.foxfire.cooldown;
        const sx = player.x, sy = player.y - player.hitY;
        for (let i = 0; i < w.foxfire.count; i++) {
          const t = targets[i % targets.length];
          const spread = i >= targets.length ? (i - targets.length + 1) * 0.3 : 0;
          const a = Math.atan2(t.y - t.hitY - sy, t.x - sx) + spread;
          projectiles.push({
            x: sx, y: sy, r: 3, life: 1.4, hit: new Set(),
            vx: Math.cos(a) * w.foxfire.speed, vy: Math.sin(a) * w.foxfire.speed,
            dmg: w.foxfire.dmg, pierce: w.foxfire.pierce,
          });
        }
      }
    }
  }

  player.orbs = [];
  if (w.orbs) {
    player.orbAngle += dt * w.orbs.spin;
    for (let i = 0; i < w.orbs.count; i++) {
      const a = player.orbAngle + (i * Math.PI * 2) / w.orbs.count;
      const ox = player.x + Math.cos(a) * w.orbs.radius;
      const oy = player.y - player.hitY + Math.sin(a) * w.orbs.radius * 0.8;
      player.orbs.push({ x: ox, y: oy });
      for (const e of enemyHash.query(ox, oy + 20, 50)) {
        if (e.hp <= 0 || e.orbCd > 0) continue;
        const dx = e.x - ox, dy = e.y - e.hitY - oy;
        if (dx * dx + dy * dy > (e.hitR + 4) ** 2) continue;
        const l = Math.hypot(dx, dy) || 1;
        e.orbCd = 0.35;
        hitEnemy(e, w.orbs.dmg, dx / l, dy / l, 80);
      }
    }
  }

  if (w.spin) {
    player.cd.spin -= dt;
    if (player.cd.spin <= 0) {
      player.cd.spin = w.spin.cooldown;
      player.spinFx = 0.3;
      player.spinRadius = w.spin.radius;
      for (const e of enemyHash.query(player.x, player.y, w.spin.radius + 12)) {
        const dx = e.x - player.x, dy = e.y - player.y;
        const l = Math.hypot(dx, dy) || 1;
        if (l < w.spin.radius + e.r) hitEnemy(e, w.spin.dmg, dx / l, dy / l, 170);
      }
    }
  }
  player.spinFx = Math.max(0, player.spinFx - dt);
}

function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (particles.length < MAX_PARTICLES && Math.random() < 0.7) {
      particles.push({ x: p.x, y: p.y, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.3, max: 0.3, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2b', size: 1 });
    }
    for (const e of enemyHash.query(p.x, p.y + 20, 50)) {
      if (e.hp <= 0 || p.hit.has(e)) continue;
      const dx = e.x - p.x, dy = e.y - e.hitY - p.y;
      if (dx * dx + dy * dy > (e.hitR + p.r) ** 2) continue;
      p.hit.add(e);
      const l = Math.hypot(p.vx, p.vy);
      hitEnemy(e, p.dmg, p.vx / l, p.vy / l, 90);
      burst(p.x, p.y, 4, '#ffb347');
      if (p.pierce-- <= 0) {
        p.life = 0;
        break;
      }
    }
  }
  compact(projectiles, p => p.life > 0);
}

function updateGems(dt) {
  const damp = Math.exp(-dt * 6);
  for (const g of gems) {
    const dx = player.x - g.x, dy = player.y - player.hitY / 2 - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < player.pickup) g.pull = true;
    if (g.pull) {
      const step = Math.min(d, 240 * dt);
      g.x += (dx / d) * step;
      g.y += (dy / d) * step;
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= damp;
    g.vy *= damp;
    if (d < 6) {
      g.taken = true;
      pendingLevelUps += player.gainXp(g.value);
    }
  }
  compact(gems, g => !g.taken);
}

function burst(x, y, n, color, speed = 40) {
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed);
    const life = rand(0.25, 0.5);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Math.random() < 0.3 ? 2 : 1 });
  }
}

function updateFx(dt) {
  const damp = Math.exp(-dt * 4);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= damp;
    p.vy *= damp;
    p.life -= dt;
  }
  compact(particles, p => p.life > 0);
  for (const t of texts) {
    t.y -= 18 * dt;
    t.life -= dt;
  }
  compact(texts, t => t.life > 0);
  for (const g of ghosts) g.life -= dt;
  compact(ghosts, g => g.life > 0);
  if (player.dashing) ghosts.push({ x: player.x, y: player.y, flip: player.facing < 0, frame: player.anim.frameIndex, life: 0.18 });
  state.shake = Math.max(0, state.shake - dt * 20);
}

// ---- Rendering ---------------------------------------------------------------

const inView = (o, m) => o.x > cam.x - m && o.x < cam.x + cam.w + m && o.y > cam.y - m && o.y < cam.y + cam.h + m * 2;

function pixelDot(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
  ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
}

function drawText(text, x, y, color, size = 8) {
  ctx.font = `600 ${size}px "Pixelify Sans", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#150d1c';
  ctx.strokeText(text, Math.round(x), Math.round(y));
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

function shadow(x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHpBar(x, y, w, ratio) {
  ctx.fillStyle = '#150d1c';
  ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 5);
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(0, Math.round(w * ratio)), 3);
}

function drawEnemy(e) {
  if (e.type === 'boss' && bossSheet) {
    const { frames, anims, pivot, headroom } = bossSheet;
    const f = frames[anims.idle.frames[Math.floor(e.phase) % anims.idle.frames.length]];
    shadow(e.x, e.y, 24, 5);
    ctx.drawImage(e.flash > 0 ? bossSheet.flashImage : bossSheet.image, f.x, f.y, f.w, f.h,
      Math.round(e.x - pivot.x), Math.round(e.y - pivot.y), f.w, f.h);
    drawHpBar(e.x, e.y - headroom - 8, 48, e.hp / e.maxHp);
    drawText('BOSS', e.x, e.y - headroom - 10, '#ff6b6b');
    return;
  }
  // Slimes, or a giant red slime if the boss sprite failed to load.
  const art = slimeArt[e.type] ?? slimeArt.red;
  const s = e.type === 'boss' ? 5 : e.scale;
  const f = Math.floor(e.phase) % 2;
  shadow(e.x, e.y, 6 * s, 2 * s);
  ctx.drawImage(e.flash > 0 ? art.flash[f] : art.frames[f], Math.round(e.x - 8 * s), Math.round(e.y - 15 * s), 16 * s, 16 * s);
  if (e.type === 'boss') drawHpBar(e.x, e.y - 15 * s - 6, 48, e.hp / e.maxHp);
}

function drawPlayer() {
  shadow(player.x, player.y, 12, 3);
  for (const g of ghosts) {
    ctx.globalAlpha = (g.life / 0.18) * 0.4;
    player.anim.draw(ctx, g.x, g.y, g.flip, g.frame);
  }
  const blink = player.invuln > 0 && player.hurtTimer === 0 && !player.dashing && Math.floor(state.time * 20) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;
  player.anim.draw(ctx, player.x, player.y, player.facing < 0);
  ctx.globalAlpha = 1;
  drawText('Fox', player.x, player.y - foxSheet.headroom - 3, '#ffe066');
}

function drawGems() {
  for (const g of gems) {
    if (!inView(g, 8)) continue;
    const x = Math.round(g.x);
    const y = Math.round(g.y + Math.sin(state.time * 6 + g.x) * 1);
    const [fill, hi] = g.value >= 10 ? ['#ffd23f', '#fff6c2'] : g.value >= 2 ? ['#7dff8a', '#e0ffe4'] : ['#5ad1ff', '#d8f6ff'];
    pixelDot(x, y, 2, '#10243a');
    ctx.fillStyle = fill;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillStyle = hi;
    ctx.fillRect(x, y - 1, 1, 1);
  }
}

function drawSpin() {
  const t = player.spinFx / 0.3;
  const r = player.spinRadius * (1 - t * 0.5);
  ctx.strokeStyle = `rgba(255, 190, 110, ${t})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(Math.round(player.x), Math.round(player.y - player.hitY / 2), r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWeaponsFx() {
  for (const o of player.orbs ?? []) {
    const x = Math.round(o.x), y = Math.round(o.y);
    ctx.globalAlpha = 0.35;
    pixelDot(x, y, 4, '#b06cff');
    ctx.globalAlpha = 1;
    pixelDot(x, y, 2, '#d9b8ff');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 1);
  }
  for (const p of projectiles) {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.globalAlpha = 0.35;
    pixelDot(x, y, 4, '#ff6a2b');
    ctx.globalAlpha = 1;
    pixelDot(x, y, 2, '#ffb347');
    pixelDot(x, y, 1, '#fff1c1');
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const t of texts) drawText(t.text, t.x, t.y, t.color);
}

function drawDebug(drawables) {
  ctx.lineWidth = 1;
  for (const d of drawables) {
    ctx.strokeStyle = d === player ? '#00ffff' : d.kind ? '#ffff00' : '#ff3bff';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)';
  for (const d of drawables) {
    if (!d.hitR) continue;
    ctx.beginPath();
    ctx.arc(d.x, d.y - d.hitY, d.hitR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90, 209, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.pickup, 0, Math.PI * 2);
  ctx.stroke();
  const f = foxSheet.frames[player.anim.frameIndex];
  const px = Math.round(player.x), py = Math.round(player.y);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.strokeRect(px - foxSheet.pivot.x + 0.5, py - foxSheet.pivot.y + 0.5, f.w - 1, f.h - 1);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(px - 2, py, 5, 1);
  ctx.fillRect(px, py - 2, 1, 5);
}

function render(dt) {
  const k = 1 - Math.exp(-dt * 10);
  cam.x += (player.x - cam.w / 2 - cam.x) * k;
  cam.y += (player.y - 8 - cam.h / 2 - cam.y) * k;

  ctx.fillStyle = '#1f3d2b';
  ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.save();
  const sx = state.shake ? rand(-state.shake, state.shake) : 0;
  const sy = state.shake ? rand(-state.shake, state.shake) : 0;
  ctx.translate(Math.round(-cam.x + sx), Math.round(-cam.y + sy));

  world.drawGround(ctx, cam);
  drawGems();
  if (player.spinFx > 0) drawSpin();

  const drawables = world.visibleProps(cam);
  for (const e of enemies) if (inView(e, 24)) drawables.push(e);
  drawables.push(player);
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) {
    if (d === player) drawPlayer();
    else if (d.kind) world.drawProp(ctx, d);
    else drawEnemy(d);
  }

  drawWeaponsFx();
  if (state.debug) drawDebug(drawables);
  ctx.restore();
}

// ---- HUD & menus -----------------------------------------------------------

let hudTimer = 0, fpsFrames = 0, fpsTime = 0, fps = 0;

function updateHud(rawDt) {
  fpsFrames++;
  fpsTime += rawDt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  hudTimer -= rawDt;
  if (hudTimer > 0) return;
  hudTimer = 0.1;
  $('lv').textContent = `Lv.${player.level}`;
  $('hpFill').style.width = `${(player.hp / player.maxHp) * 100}%`;
  $('hpText').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  $('xpFill').style.width = `${(player.xp / player.xpNeed) * 100}%`;
  $('xpText').textContent = `${player.xp}/${player.xpNeed}`;
  $('dashFill').style.width = `${(1 - player.dashCd / 1.2) * 100}%`;
  $('time').textContent = fmtTime(state.time);
  $('kills').textContent = state.kills;
  $('enemyCount').textContent = enemies.length;
  $('fps').textContent = fps;
  $('animName').textContent = `${player.anim.name} #${player.anim.index}`;
}

function renderSlots() {
  const owned = Object.entries(player.skills);
  $('slots').innerHTML =
    owned.map(([k, l]) => `<div class="slot" title="${UPGRADES[k].name}">${UPGRADES[k].icon}<b>${l}</b></div>`).join('') +
    '<div class="slot empty"></div>'.repeat(Math.max(0, 8 - owned.length));
}

function showModal(title, bodyHtml, actions) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  const box = $('modalActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = a.className ?? 'btn';
    b.innerHTML = a.label;
    b.onclick = a.onClick;
    box.append(b);
  }
  $('modal').hidden = false;
}

function hideModal() {
  $('modal').hidden = true;
}

function openLevelUp() {
  const choices = rollChoices(player);
  if (!choices.length) {
    pendingLevelUps = 0;
    player.hp = Math.min(player.maxHp, player.hp + 30);
    return;
  }
  state.mode = 'levelup';
  state.choices = choices;
  showModal(`LEVEL UP! → Lv.${player.level}`, '<p class="hint">Chọn 1 kỹ năng — click hoặc bấm phím 1 / 2 / 3</p>', choices.map((key, i) => {
    const u = UPGRADES[key];
    const lvl = player.skills[key] ?? 0;
    return {
      className: 'choice',
      label: `<span class="key">${i + 1}</span><span class="icon">${u.icon}</span><span class="title">${u.name}</span>` +
        `<span class="lvl">${lvl ? `Lv.${lvl} → ${lvl + 1}` : 'MỚI'}</span><span class="desc">${u.desc(lvl)}</span>`,
      onClick: () => pickUpgrade(key),
    };
  }));
}

function pickUpgrade(key) {
  if (state.mode !== 'levelup') return;
  applyUpgrade(player, key);
  pendingLevelUps--;
  renderSlots();
  hideModal();
  state.mode = 'play';
  burst(player.x, player.y - 8, 16, '#ffe066', 60);
}

function sheetInfo(title, sheet, id) {
  if (!sheet) return `<h3>${title}</h3><p class="hint">Chưa load được sprite, đang dùng hình tạm.</p>`;
  const f = sheet.frames[0];
  const anims = Object.entries(sheet.anims).map(([n, a]) => (a.frames.length > 1 ? `${n} (${a.frames.length})` : n)).join(', ');
  const upscale = sheet.pixelScale ? ` · ảnh gốc phóng ×${sheet.pixelScale}` : '';
  return `<h3>${title}</h3><div class="sheet-preview" id="${id}"></div>
    <p class="hint">Nguồn: ${sheet.source}<br>Frame: ${f.w}×${f.h}px × ${sheet.frames.length} · Pivot: (${sheet.pivot.x}, ${sheet.pivot.y})${upscale}<br>
    ${sheet.views ? 'Hướng' : 'Animation'}: ${anims}</p>`;
}

function appendPreview(id, sheet) {
  const img = sheet.image;
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  c.style.width = `${img.width * 2}px`;
  $(id).append(c);
}

function openPause() {
  state.mode = 'pause';
  showModal('TẠM DỪNG', `
    <div class="pause-grid">
      <div>
        <h3>Điều khiển</h3>
        <ul>
          <li><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> di chuyển</li>
          <li><kbd>Space</kbd> lướt (né đòn)</li>
          <li><kbd>H</kbd> bật/tắt hitbox + pivot</li>
          <li><kbd>B</kbd> gọi boss ra test</li>
          <li><kbd>K</kbd> xuất sprite sheet</li>
          <li><kbd>R</kbd> chơi lại</li>
        </ul>
      </div>
      <div>
        ${sheetInfo('Nhân vật chính', foxSheet, 'heroPreview')}
        ${sheetInfo('Boss', bossSheet, 'bossPreview')}
      </div>
    </div>`, [
    { label: 'Tiếp tục (Esc)', onClick: resume },
    { label: 'Xuất sprite (K)', onClick: exportSheet, className: 'btn ghost' },
    { label: 'Chơi lại (R)', onClick: newGame, className: 'btn ghost' },
  ]);
  appendPreview('heroPreview', foxSheet);
  if (bossSheet) appendPreview('bossPreview', bossSheet);
}

function resume() {
  hideModal();
  state.mode = 'play';
}

function gameOver() {
  state.mode = 'dead';
  burst(player.x, player.y - 8, 30, '#f07b2c', 70);
  showModal('GAME OVER', `<p class="big">Sống sót <b>${fmtTime(state.time)}</b> · <b>Lv.${player.level}</b> · Hạ <b>${state.kills}</b> quái</p>`, [
    { label: 'Chơi lại (R)', onClick: newGame },
  ]);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportSheet() {
  const img = foxSheet.image;
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  c.toBlob(blob => download(blob, 'fox.png'));
  const json = JSON.stringify(sheetToAsepriteJson(foxSheet, 'fox.png'), null, 2);
  download(new Blob([json], { type: 'application/json' }), 'fox.json');
  toast('Đã xuất fox.png + fox.json');
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function handleKeys() {
  if (Input.hit('KeyH')) state.debug = !state.debug;
  if (Input.hit('KeyK')) exportSheet();
  if (Input.hit('KeyB') && state.mode === 'play') spawnBoss();
  if (Input.hit('Escape')) {
    if (state.mode === 'play') openPause();
    else if (state.mode === 'pause') resume();
  }
  if (Input.hit('KeyR') && (state.mode === 'dead' || state.mode === 'pause')) newGame();
  if (state.mode === 'levelup') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((code, i) => {
      if (Input.hit(code) && state.choices[i]) pickUpgrade(state.choices[i]);
    });
  }
}

async function loadFirst(loaders) {
  for (const load of loaders) {
    try {
      return await load();
    } catch (err) {
      console.warn('[sprites]', err.message);
    }
  }
  return null;
}

async function boot() {
  Input.init();
  resize();
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'play') openPause();
  });

  [foxSheet, bossSheet] = await Promise.all([
    loadFirst([
      () => loadSvgStrip(SPRITES.hero.url, SPRITES.hero),
      () => loadAsepriteSheet('assets/fox.json'),
    ]).then(sheet => sheet ?? buildFoxSheet()),
    loadFirst([() => loadSvgStrip(SPRITES.boss.url, SPRITES.boss)]),
  ]);
  slimeArt = buildSlimeArt();
  $('spriteSource').textContent = foxSheet.source.split('/').pop();

  newGame();
  let last = performance.now();
  requestAnimationFrame(function loop(now) {
    const raw = Math.max(0, (now - last) / 1000);
    last = now;
    const dt = Math.min(0.05, raw);
    handleKeys();
    if (state.mode === 'play') update(dt);
    render(dt);
    updateHud(raw);
    Input.endFrame();
    requestAnimationFrame(loop);
  });

  // Handy for poking at the game from DevTools.
  window.game = {
    state,
    get player() { return player; },
    get enemies() { return enemies; },
    get sheet() { return foxSheet; },
    get bossSheet() { return bossSheet; },
    pick: i => pickUpgrade(state.choices[i]),
    boss: () => spawnBoss(),
    // Fast-forward the simulation, e.g. game.step(30)
    step(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds && state.mode === 'play'; t += dt) {
        update(dt);
        updateHud(dt);
      }
      render(1);
      return { mode: state.mode, time: state.time, kills: state.kills, enemies: enemies.length, level: player.level, hp: player.hp };
    },
  };
}

boot();

// Game loop: the shared context every module writes into, plus rendering, HUD and menus.
import { buildFoxSheet, buildEnemyArt, buildPickupArt, loadAsepriteSheet, loadGridSheet, loadSvgStrip, sheetToAsepriteJson, makeCanvas } from './sprites.js';
import { Input, World, SpatialHash, WORLD } from './world.js';
import {
  Player, WEAPONS, PERKS, ALL_UPGRADES, WEAPON_SLOTS, PERK_SLOTS,
  mods, rollChoices, applyChoice, chestPicks, evoHint, weaponFace,
} from './entities.js';
import { updateWeapons, updateWeaponFx, drawGroundFx, drawWeaponFx } from './weapons.js';
import { runDirector, updateEnemies, updateFoeShots, updateDrops, onEnemyDeath, spawnEnemy, drawEnemy, drawFoeShots, drawDrops } from './swarm.js';
import { drawText, pixelDot, rand, shadow } from './draw.js';
import { createPostFx } from './postfx.js';
import { SPRITES } from './config.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const cam = { x: 0, y: 0, w: 0, h: 0 };
const enemyHash = new SpatialHash(24);
// shake is trauma, not an amplitude: it decays on its own curve and drives a *directional*
// offset, so a hit from the left no longer shakes identically to a hit from the right.
const state = {
  mode: 'loading', time: 0, kills: 0, debug: false, choices: [],
  shake: 0, shakeAngle: 0, flash: 0, flashColor: '#ffffff', chroma: 0, hitstop: 0,
};
const postfx = createPostFx();
const lights = [];
const MAX_ENEMIES = 450;
const MAX_PARTICLES = 900;
const MAX_GEMS = 400;
const MAX_TEXTS = 90;

let foxSheet, bossSheet, enemyArt, pickupArt, world, player;
let pendingLevelUps = 0;

// Everything the swarm and weapon modules are allowed to touch. They push entities in here and
// call back through the helpers; kills, XP and particles stay owned by this file.
const G = {
  state, cam, bounds: WORLD,
  world: null, player: null, hash: enemyHash, m: null,
  art: null, pickupArt: null, bossSheet: null,
  enemies: [], shots: [], foeShots: [], zones: [], bolts: [], claws: [], ripples: [],
  gems: [], drops: [], particles: [], texts: [], ghosts: [],
  maxParticles: MAX_PARTICLES, maxEnemies: MAX_ENEMIES,
  spawnTimer: 0, nextEvent: 0, lateTimer: 45, lateIndex: 0, wave: 1,
  pendingChests: [],
  hpMul: () => 1 + state.time / 110,
  compact, burst, hit, near, toast, hurtPlayer, shakeBy, flashScreen, onScreen,
};

function resize() {
  // A hidden tab reports 0×0. Falling through with that collapses the camera, and everything
  // measured from it — spawn distance, culling, what counts as on screen — collapses with it.
  const vw = Math.max(480, innerWidth);
  const vh = Math.max(270, innerHeight);
  const scale = Math.max(2, Math.round(Math.min(vw / 640, vh / 360)));
  canvas.width = Math.ceil(vw / scale);
  canvas.height = Math.ceil(vh / scale);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
  ctx.imageSmoothingEnabled = false;
  cam.w = canvas.width;
  cam.h = canvas.height;
  postfx.resize(cam.w, cam.h);
  // The HUD builds every border, gap and font size off one game pixel, so it stops looking like
  // a web page sitting on top of the game and starts looking like part of it.
  document.documentElement.style.setProperty('--px', `${scale}px`);
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
  Object.assign(G, {
    world, player,
    enemies: [], shots: [], foeShots: [], zones: [], bolts: [], claws: [], ripples: [],
    gems: [], drops: [], particles: [], texts: [], ghosts: [],
    spawnTimer: 0, nextEvent: 0, lateTimer: 45, lateIndex: 0, wave: 1, pendingChests: [],
  });
  G.m = mods(player);
  Object.assign(state, { mode: 'play', time: 0, kills: 0, shake: 0, flash: 0, choices: [] });
  pendingLevelUps = 0;
  cam.x = player.x - cam.w / 2;
  cam.y = player.y - cam.h / 2;
  hideModal();
  renderSlots();
}

// ---- Simulation --------------------------------------------------------------

function update(dt) {
  state.time += dt;
  G.m = mods(player);
  player.update(dt, Input.axis(), Input.hit('Space'), world, G.m);
  runDirector(dt, G);
  updateEnemies(dt, G);
  updateWeapons(dt, G);
  updateFoeShots(dt, G);
  compact(G.enemies, e => e.hp > 0);
  updateGems(dt);
  updateDrops(dt, G);
  updateFx(dt);
  if (player.dead) gameOver();
  else if (G.pendingChests.length) openChest();
  else if (pendingLevelUps > 0) openLevelUp();
}

function near(x, y, range, count) {
  const out = [];
  for (const e of enemyHash.query(x, y, range)) {
    if (e.hp <= 0) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < range * range) out.push({ e, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, count).map(o => o.e);
}

function onScreen(o, m = 0) {
  return o.x > cam.x - m && o.x < cam.x + cam.w + m && o.y > cam.y - m && o.y < cam.y + cam.h + m * 2;
}

// angle is where the force came FROM; the camera kicks away from it.
function shakeBy(amount, angle) {
  if (amount > state.shake) {
    state.shake = amount;
    if (angle !== undefined) state.shakeAngle = angle;
  }
}

function flashScreen(amount, color = '#ffffff') {
  if (amount >= state.flash) {
    state.flash = amount;
    state.flashColor = color;
  }
}

function hurtPlayer(amount, fx, fy) {
  const taken = player.damage(amount, G.m.armor);
  if (!taken) return;
  G.texts.push({ x: player.x, y: player.y - player.hitY * 2 - 6, text: `-${taken}`, life: 0.7, color: '#ff6b6b' });
  burst(fx ?? player.x, fy ?? player.y - player.hitY, 8, '#ff6b6b');
  shakeBy(3 + taken * 0.12, Math.atan2((fy ?? player.y) - player.y, (fx ?? player.x) - player.x));
  state.chroma = Math.max(state.chroma, Math.min(1, taken / 25));
  flashScreen(Math.min(0.22, taken / 90), '#ff4d5e');
}

function hit(e, dmg, nx, ny, knock, opts = {}) {
  if (e.hp <= 0) return;
  const crit = opts.crit || Math.random() < G.m.crit;
  const amount = Math.max(1, Math.round(crit ? dmg * G.m.critMul : dmg));
  e.hp -= amount;
  e.flash = 0.1;
  e.kx += (nx * knock) / e.mass;
  e.ky += (ny * knock) / e.mass;
  if (G.texts.length < MAX_TEXTS && onScreen(e, 20)) {
    G.texts.push({ x: e.x + rand(-4, 4), y: e.y - e.hitY * 2 - 4, text: String(amount), life: 0.6, color: crit ? '#ffd23f' : '#ffffff' });
  }
  if (e.hp <= 0) killed(e);
}

function killed(e) {
  state.kills++;
  if (G.gems.length < MAX_GEMS) {
    G.gems.push({ x: e.x, y: e.y - 3, value: e.xp, vx: rand(-25, 25), vy: rand(-25, 25), pull: false, taken: false });
  } else {
    G.gems[Math.floor(Math.random() * G.gems.length)].value += e.xp;
  }
  burst(e.x, e.y - e.hitY, 6 + 4 * Math.min(e.mass, 5), e.color);
  onEnemyDeath(e, G);
}

function updateGems(dt) {
  const damp = Math.exp(-dt * 6);
  let gained = 0;
  for (const g of G.gems) {
    const dx = player.x - g.x;
    const dy = player.y - player.hitY / 2 - g.y;
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
      gained += g.value;
    }
  }
  if (gained) pendingLevelUps += player.gainXp(gained * G.m.growth);
  compact(G.gems, g => !g.taken);
}

function burst(x, y, n, color, speed = 40) {
  for (let i = 0; i < n && G.particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed);
    const life = rand(0.25, 0.5);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Math.random() < 0.3 ? 2 : 1 });
  }
}

function updateFx(dt) {
  const damp = Math.exp(-dt * 4);
  for (const p of G.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= damp;
    p.vy *= damp;
    p.life -= dt;
  }
  compact(G.particles, p => p.life > 0);
  for (const t of G.texts) {
    t.y -= 18 * dt;
    t.life -= dt;
  }
  compact(G.texts, t => t.life > 0);
  for (const g of G.ghosts) g.life -= dt;
  compact(G.ghosts, g => g.life > 0);
  if (player.dashing) G.ghosts.push({ x: player.x, y: player.y, flip: player.facing < 0, frame: player.anim.frameIndex, life: 0.18 });
  updateWeaponFx(dt, G);
  state.shake = Math.max(0, state.shake - dt * 20);
  state.flash = Math.max(0, state.flash - dt * 2);
}

// ---- Rendering ---------------------------------------------------------------

function drawPlayer() {
  shadow(ctx, player.x, player.y, 12, 3);
  for (const g of G.ghosts) {
    ctx.globalAlpha = (g.life / 0.18) * 0.4;
    player.anim.draw(ctx, g.x, g.y, g.flip, g.frame);
  }
  const blink = player.invuln > 0 && player.hurtTimer === 0 && !player.dashing && Math.floor(state.time * 20) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;
  player.anim.draw(ctx, player.x, player.y, player.facing < 0);
  ctx.globalAlpha = 1;
  drawText(ctx, 'Fox', player.x, player.y - foxSheet.headroom - 3, '#ffe066');
}

function drawGems() {
  for (const g of G.gems) {
    if (!onScreen(g, 8)) continue;
    const x = Math.round(g.x);
    const y = Math.round(g.y + Math.sin(state.time * 6 + g.x) * 1);
    const [fill, hi] = g.value >= 10 ? ['#ffd23f', '#fff6c2'] : g.value >= 2 ? ['#7dff8a', '#e0ffe4'] : ['#5ad1ff', '#d8f6ff'];
    pixelDot(ctx, x, y, 2, '#10243a');
    ctx.fillStyle = fill;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillStyle = hi;
    ctx.fillRect(x, y - 1, 1, 1);
  }
}

function drawParticles() {
  for (const p of G.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const t of G.texts) drawText(ctx, t.text, t.x, t.y, t.color);
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

// Everything in the scene that should light the world around it. Collected here rather than
// registered by the weapon and enemy modules, so those stay unaware a lighting pass exists.
function collectLights() {
  lights.length = 0;
  const pulse = 0.85 + Math.sin(state.time * 9) * 0.15;

  for (const z of G.zones) {
    const fade = Math.min(1, z.life / 0.6);
    lights.push({ x: z.x, y: z.y, r: z.r * 2.4 * pulse, color: '#ff7a2b', alpha: 0.55 * fade });
  }
  for (const p of G.shots) {
    if (!onScreen(p, 30)) continue;
    const cold = p.kind === 'frost';
    lights.push({
      x: p.x, y: p.y, r: cold ? 26 : 34,
      color: cold ? '#7cc7ff' : '#ff9a3c', alpha: cold ? 0.45 : 0.6,
    });
  }
  for (const b of G.bolts) {
    const t = b.life / b.max;
    lights.push({ x: b.x, y: b.y, r: b.r * 5 * t, color: '#fdf6a0', alpha: t });
    lights.push({ x: b.x, y: b.y - 40, r: b.r * 3 * t, color: '#cfe4ff', alpha: t * 0.7 });
  }
  for (const r of G.ripples) {
    const t = r.life / r.max;
    lights.push({ x: r.x, y: r.y, r: r.r * 2.2 * (1.4 - t * 0.4), color: r.color, alpha: t });
  }
  for (const o of player.orbs) {
    lights.push({ x: o.x, y: o.y, r: o.big ? 28 : 20, color: '#c79bff', alpha: 0.5 });
  }
  if (player.auraRadius > 0) {
    lights.push({ x: player.x, y: player.y - player.hitY / 2, r: player.auraRadius * 1.35 * pulse, color: '#ffc861', alpha: 0.4 });
  }
  if (player.spinFx > 0) {
    const t = player.spinFx / 0.3;
    lights.push({ x: player.x, y: player.y - player.hitY / 2, r: player.spinRadius * 1.7 * t, color: '#ffbe6e', alpha: t * 0.6 });
  }
  if (player.dashing) {
    lights.push({ x: player.x, y: player.y - player.hitY, r: 40, color: '#fff3e0', alpha: 0.5 });
  }
  for (const c of G.claws) {
    const t = c.life / c.max;
    lights.push({ x: c.x + Math.cos(c.a) * c.reach * 0.6, y: c.y + Math.sin(c.a) * c.reach * 0.4, r: c.reach * 0.9 * t, color: '#fff3e0', alpha: t * 0.5 });
  }
  // Loot glints, so the field of gems reads as treasure rather than as litter.
  for (const g of G.drops) {
    if (!onScreen(g, 20)) continue;
    const c = g.kind === 'heart' ? '#ff6b6b' : g.kind === 'magnet' ? '#5ad1ff' : g.kind === 'bomb' ? '#9aa6bd' : '#ffd23f';
    lights.push({ x: g.x, y: g.y, r: g.kind === 'chest' ? 44 : 22, color: c, alpha: 0.8 });
  }
  // Elites carry their own menace light.
  for (const e of G.enemies) {
    if (!e.elite || !onScreen(e, 40)) continue;
    lights.push({ x: e.x, y: e.y - e.hitY, r: e.boss ? 70 : 48, color: e.boss ? '#ff5a5a' : '#ffa04a', alpha: 0.55 });
  }
  return lights;
}

function render(dt) {
  const k = 1 - Math.exp(-dt * 10);
  cam.x += (player.x - cam.w / 2 - cam.x) * k;
  cam.y += (player.y - 8 - cam.h / 2 - cam.y) * k;

  ctx.fillStyle = '#12211c';
  ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.save();
  // Directional kick plus a little noise, instead of pure axis-uniform jitter.
  const s = state.shake;
  const sx = s ? Math.cos(state.shakeAngle) * -s + rand(-s, s) * 0.5 : 0;
  const sy = s ? Math.sin(state.shakeAngle) * -s + rand(-s, s) * 0.5 : 0;
  const camX = Math.round(-cam.x + sx);
  const camY = Math.round(-cam.y + sy);
  ctx.translate(camX, camY);

  world.drawGround(ctx, cam);
  drawGroundFx(ctx, G);
  drawGems();
  drawDrops(ctx, G);

  const drawables = world.visibleProps(cam);
  for (const e of G.enemies) if (onScreen(e, 40)) drawables.push(e);
  drawables.push(player);
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) {
    if (d === player) drawPlayer();
    else if (d.kind) world.drawProp(ctx, d);
    else drawEnemy(ctx, d, G);
  }

  drawWeaponFx(ctx, G);
  drawFoeShots(ctx, G);
  drawParticles();
  if (state.debug) drawDebug(drawables);
  ctx.restore();

  postfx.composite(ctx, {
    lights: collectLights(),
    camX, camY,
    time: state.time,
    flash: state.flash > 0 ? { a: state.flash, color: state.flashColor } : null,
    chroma: state.chroma,
    grade: 1,
  });

  // These decay in render, not update, so they still resolve while the game is paused.
  state.chroma = Math.max(0, state.chroma - dt * 2.5);
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
  $('xpText').textContent = `${Math.floor(player.xp)}/${player.xpNeed}`;
  $('dashFill').style.width = `${(1 - player.dashCd / player.dashCooldown) * 100}%`;
  $('time').textContent = fmtTime(state.time);
  $('kills').textContent = state.kills;
  $('gold').textContent = player.gold;
  $('enemyCount').textContent = G.enemies.length;
  $('wave').textContent = G.wave;
  $('fps').textContent = fps;
  $('animName').textContent = `${player.anim.name} #${player.anim.index}`;
}

function slotHtml(key, level, { evolved = false, kind = 'weapon' } = {}) {
  const face = kind === 'weapon' ? weaponFace(player, key) : PERKS[key];
  const max = ALL_UPGRADES[key].max;
  const hint = kind === 'weapon' ? evoHint(player, key) : null;
  const title = `${face.name} Lv.${level}/${max}${hint ? ` — ${hint}` : ''}`;
  return `<div class="slot${evolved ? ' evo' : ''}${level >= max ? ' maxed' : ''}" title="${title}">${face.icon}<b>${level}</b></div>`;
}

function renderSlots() {
  const weapons = Object.entries(player.weapons);
  const perks = Object.entries(player.perks);
  $('weaponSlots').innerHTML =
    weapons.map(([k, l]) => slotHtml(k, l, { evolved: !!player.evolved[k] })).join('') +
    '<div class="slot empty"></div>'.repeat(Math.max(0, WEAPON_SLOTS - weapons.length));
  $('perkSlots').innerHTML =
    perks.map(([k, l]) => slotHtml(k, l, { kind: 'perk' })).join('') +
    '<div class="slot empty"></div>'.repeat(Math.max(0, PERK_SLOTS - perks.length));
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

function choiceCard(choice, i) {
  const { kind, key } = choice;
  if (kind === 'evo') {
    const { evo, name } = WEAPONS[key];
    return {
      className: 'choice evo',
      label: `<span class="key">${i + 1}</span><span class="icon">${evo.icon}</span><span class="title">${evo.name}</span>` +
        `<span class="lvl">TIẾN HOÁ · từ ${name}</span><span class="desc">${evo.desc}</span>`,
      onClick: () => pickUpgrade(i),
    };
  }
  const def = kind === 'weapon' ? WEAPONS[key] : PERKS[key];
  const lvl = (kind === 'weapon' ? player.weapons[key] : player.perks[key]) ?? 0;
  const tag = lvl ? `Lv.${lvl} → ${lvl + 1}` : kind === 'weapon' ? 'CHIÊU MỚI' : 'PERK MỚI';
  return {
    className: `choice ${kind}`,
    label: `<span class="key">${i + 1}</span><span class="icon">${def.icon}</span><span class="title">${def.name}</span>` +
      `<span class="lvl">${tag}</span><span class="desc">${def.desc(lvl)}</span>`,
    onClick: () => pickUpgrade(i),
  };
}

function openLevelUp() {
  const choices = rollChoices(player);
  if (!choices.length) {
    pendingLevelUps = 0;
    player.heal(30);
    toast('❤️ Không còn gì để nâng — hồi 30 máu');
    return;
  }
  state.mode = 'levelup';
  state.choices = choices;
  const slots = `Chiêu ${Object.keys(player.weapons).length}/${WEAPON_SLOTS} · Perk ${Object.keys(player.perks).length}/${PERK_SLOTS}`;
  showModal(`LEVEL UP! → Lv.${player.level}`,
    `<p class="hint">Chọn 1 — click hoặc bấm phím 1…${choices.length} · ${slots}</p>`,
    choices.map(choiceCard));
}

function pickUpgrade(i) {
  if (state.mode !== 'levelup') return;
  const choice = state.choices[i];
  if (!choice) return;
  applyChoice(player, choice);
  G.m = mods(player);
  pendingLevelUps--;
  renderSlots();
  hideModal();
  state.mode = 'play';
  if (choice.kind === 'evo') {
    toast(`✨ ${WEAPONS[choice.key].evo.name} — tiến hoá!`);
    flashScreen(0.35, '#ffd23f');
    burst(player.x, player.y - 8, 40, '#ffd23f', 110);
  } else {
    burst(player.x, player.y - 8, 16, '#ffe066', 60);
  }
}

function openChest() {
  const n = G.pendingChests.shift();
  const picks = chestPicks(player, n);
  const gold = 15 + Math.round(state.time / 6);
  player.gold += gold;
  const lines = [];
  for (const key of picks) {
    const before = player.weapons[key] ?? 0;
    applyChoice(player, { kind: 'weapon', key });
    const face = weaponFace(player, key);
    lines.push(`<div class="loot">${face.icon} <b>${face.name}</b> ${before ? `Lv.${before} → ${before + 1}` : 'CHIÊU MỚI'}</div>`);
  }
  if (!picks.length) {
    const healed = player.heal(60);
    lines.push(`<div class="loot">❤️ <b>Hồi ${healed} máu</b> — mọi chiêu đã kịch trần</div>`);
  }
  lines.push(`<div class="loot">💰 <b>+${gold} vàng</b></div>`);
  G.m = mods(player);
  renderSlots();
  state.mode = 'chest';
  burst(player.x, player.y - 8, 30, '#ffd23f', 90);
  showModal('🎁 RƯƠNG BÁU', `<p class="hint">Cướp áp tải rơi đồ</p>${lines.join('')}`, [
    { label: 'Nhận (Space)', onClick: closeChest },
  ]);
}

function closeChest() {
  if (state.mode !== 'chest') return;
  hideModal();
  state.mode = 'play';
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

function buildList() {
  const line = (key, lvl, kind) => {
    const face = kind === 'weapon' ? weaponFace(player, key) : PERKS[key];
    const hint = kind === 'weapon' ? evoHint(player, key) : null;
    return `<li>${face.icon} ${face.name} <b>Lv.${lvl}</b>${hint ? ` <span class="hint">${hint}</span>` : ''}</li>`;
  };
  return `<h3>Đang mang</h3><ul>
    ${Object.entries(player.weapons).map(([k, l]) => line(k, l, 'weapon')).join('')}
    ${Object.entries(player.perks).map(([k, l]) => line(k, l, 'perk')).join('')}
  </ul>`;
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
          <li><kbd>B</kbd> gọi Quái Khói ra test</li>
          <li><kbd>N</kbd> gọi Đầu Lĩnh Cướp ra test</li>
          <li><kbd>K</kbd> xuất sprite sheet</li>
          <li><kbd>R</kbd> chơi lại</li>
        </ul>
        ${buildList()}
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
  // Cửu Mệnh spends itself here: one free stand-up, and the swarm gets shoved off.
  if (player.perks.revive && !player.revived) {
    player.revived = true;
    player.hp = Math.round(player.maxHp * 0.5);
    player.invuln = 2.5;
    for (const e of G.enemies) {
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const l = Math.hypot(dx, dy) || 1;
      if (l < 160) {
        e.kx += (dx / l) * 900 / e.mass;
        e.ky += (dy / l) * 900 / e.mass;
      }
    }
    burst(player.x, player.y - 8, 50, '#ffe066', 130);
    flashScreen(0.5, '#fff3c4');
    shakeBy(8);
    toast('🪶 Cửu Mệnh! Đứng dậy với 50% máu');
    return;
  }
  state.mode = 'dead';
  burst(player.x, player.y - 8, 30, '#f07b2c', 70);
  showModal('GAME OVER', `<p class="big">Sống sót <b>${fmtTime(state.time)}</b> · <b>Lv.${player.level}</b> · Hạ <b>${state.kills}</b> quái · <b>${player.gold}</b> vàng</p>${buildList()}`, [
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
  if (Input.hit('KeyB') && state.mode === 'play') testSpawn('boss');
  if (Input.hit('KeyN') && state.mode === 'play') testSpawn('captain');
  if (Input.hit('Escape')) {
    if (state.mode === 'play') openPause();
    else if (state.mode === 'pause') resume();
  }
  if (Input.hit('KeyR') && (state.mode === 'dead' || state.mode === 'pause')) newGame();
  if (state.mode === 'chest' && (Input.hit('Space') || Input.hit('Enter'))) closeChest();
  if (state.mode === 'levelup') {
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((code, i) => {
      if (Input.hit(code)) pickUpgrade(i);
    });
  }
}

// Debug shortcut: drop one of anything just off screen.
function testSpawn(type) {
  const a = Math.random() * Math.PI * 2;
  const d = Math.hypot(cam.w, cam.h) / 2 + 20;
  const x = Math.max(12, Math.min(WORLD.w - 12, player.x + Math.cos(a) * d));
  const y = Math.max(12, Math.min(WORLD.h - 12, player.y + Math.sin(a) * d));
  const e = spawnEnemy(G, type, x, y);
  if (e) toast(`⚠ ${e.name} xuất hiện!`);
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
    loadFirst([() => loadGridSheet(SPRITES.boss.url, SPRITES.boss)]),
  ]);
  enemyArt = buildEnemyArt();
  pickupArt = buildPickupArt();
  G.art = enemyArt;
  G.pickupArt = pickupArt;
  G.bossSheet = bossSheet;
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
    state, G,
    get player() { return player; },
    get enemies() { return G.enemies; },
    get sheet() { return foxSheet; },
    get bossSheet() { return bossSheet; },
    pick: i => pickUpgrade(i),
    spawn: type => testSpawn(type),
    give(key, levels = 1) {
      for (let i = 0; i < levels; i++) applyChoice(player, { kind: key in WEAPONS ? 'weapon' : 'perk', key });
      G.m = mods(player);
      renderSlots();
      return key in WEAPONS ? player.weapons[key] : player.perks[key];
    },
    // Fast-forward the simulation, e.g. game.step(30)
    step(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds && state.mode === 'play'; t += dt) {
        update(dt);
        updateHud(dt);
      }
      render(1);
      return { mode: state.mode, time: state.time, kills: state.kills, enemies: G.enemies.length, level: player.level, hp: player.hp, gold: player.gold };
    },
  };
}

boot();

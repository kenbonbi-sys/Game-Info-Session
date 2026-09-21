// The numbers a swarm run is balanced on: perks, weapons, their evolutions, the enemy roster
// and the two classes that carry state (Player, Enemy). No drawing and no game loop here.
import { Animator, DirectionalAnimator } from './sprites.js';
import { shuffle } from './draw.js';

// How many different weapons / perks one run can hold, as in Vampire Survivors: the cap is what
// turns a level-up into a choice instead of a formality.
export const WEAPON_SLOTS = 6;
export const PERK_SLOTS = 6;
// A weapon evolves when it is maxed and its paired perk has reached this level.
export const EVO_PERK_LEVEL = 3;

// ---- Perks -----------------------------------------------------------------
// A perk never fires on its own. It bends the numbers every weapon reads out of mods().

export const PERKS = {
  might: { name: 'Uy Lực', icon: '💪', max: 5, desc: () => '+12% sát thương cho mọi chiêu' },
  haste: { name: 'Tốc Chiêu', icon: '⏱️', max: 5, desc: () => '-8% thời gian hồi chiêu' },
  area: { name: 'Bao Phủ', icon: '🌐', max: 5, desc: () => '+12% phạm vi chiêu' },
  amount: { name: 'Bội Kích', icon: '✨', max: 3, desc: () => '+1 đạn cho mọi chiêu bắn ra' },
  speed: { name: 'Chân Gió', icon: '👟', max: 5, desc: () => '+10% tốc độ chạy' },
  vitality: { name: 'Sinh Lực', icon: '❤️', max: 5, desc: () => '+25 máu tối đa, hồi ngay 25 máu' },
  armor: { name: 'Giáp Vảy', icon: '🛡️', max: 5, desc: () => 'Mỗi đòn ăn vào bớt 1 sát thương' },
  regen: { name: 'Hồi Máu', icon: '🌿', max: 5, desc: () => '+0.5 máu mỗi giây' },
  magnet: { name: 'Nam Châm', icon: '🧲', max: 4, desc: () => '+45% tầm hút ngọc EXP' },
  luck: { name: 'Vận May', icon: '🍀', max: 5, desc: () => '+6% chí mạng, rơi đồ nhiều hơn' },
  growth: { name: 'Học Nhanh', icon: '📖', max: 5, desc: () => '+12% EXP nhận được' },
  dash: { name: 'Lướt Gió', icon: '💨', max: 3, desc: () => 'Lướt hồi nhanh hơn 25%, đi xa hơn' },
  revive: { name: 'Cửu Mệnh', icon: '🪶', max: 1, desc: () => 'Gục một lần rồi đứng dậy với 50% máu' },
};

// Everything a weapon asks about the player, resolved once per frame.
export function mods(player) {
  const p = k => player.perks[k] ?? 0;
  return {
    might: 1 + 0.12 * p('might'),
    haste: 0.92 ** p('haste'),
    area: 1 + 0.12 * p('area'),
    amount: p('amount'),
    crit: 0.08 + 0.06 * p('luck'),
    critMul: 2 + 0.15 * p('luck'),
    armor: p('armor'),
    regen: 0.5 * p('regen'),
    growth: 1 + 0.12 * p('growth'),
    drop: 1 + 0.15 * p('luck'),
  };
}

// ---- Weapons ---------------------------------------------------------------
// stats(level, m, evolved) returns everything weapons.js needs to fire the thing; the level-up
// screen only ever reads name/icon/desc. evo.perk is the perk that unlocks the evolution.

export const WEAPONS = {
  foxfire: {
    name: 'Hỏa Hồ', icon: '🔥', max: 8,
    desc: l => (l === 0 ? 'Bắn cầu lửa vào con quái gần nhất' : '+Sát thương, bắn nhanh hơn' + (l % 2 === 1 ? ', +1 cầu lửa' : '')),
    evo: { perk: 'might', name: 'Cửu Vĩ Hỏa', icon: '🌋', desc: 'Cầu lửa nổ tung khi trúng, thiêu cả đám xung quanh' },
    stats: (l, m, evo) => ({
      dmg: (10 + 4.5 * l) * m.might * (evo ? 1.6 : 1),
      cooldown: 0.85 * 0.9 ** (l - 1) * m.haste,
      count: 1 + Math.floor((l - 1) / 2) + m.amount + (evo ? 1 : 0),
      speed: 250,
      pierce: Math.floor(l / 3) + (evo ? 2 : 0),
      blast: evo ? 30 * m.area : 0,
      range: 280,
    }),
  },
  orbs: {
    name: 'Ngọc Linh', icon: '🔮', max: 7,
    desc: l => (l === 0 ? 'Cầu linh hồn xoay quanh cáo, chạm là đau' : '+1 quả cầu, +sát thương, xoay rộng hơn'),
    evo: { perk: 'area', name: 'Nguyệt Luân', icon: '🌙', desc: 'Hai vành cầu xoay ngược chiều, sát thương gấp rưỡi' },
    stats: (l, m, evo) => ({
      count: (1 + l + m.amount) * (evo ? 2 : 1),
      dmg: (6 + 3 * l) * m.might * (evo ? 1.5 : 1),
      radius: (32 + 3 * l) * m.area,
      spin: 2.6 + 0.25 * l,
      tick: evo ? 0.22 : 0.35,
      rings: evo ? 2 : 1,
    }),
  },
  spin: {
    name: 'Quét Đuôi', icon: '🌀', max: 6,
    desc: l => (l === 0 ? 'Quẫy đuôi gây sát thương và đẩy lùi quanh mình' : '+Phạm vi, +sát thương, hồi chiêu nhanh hơn'),
    evo: { perk: 'haste', name: 'Bão Đuôi', icon: '🌪️', desc: 'Quẫy hai vòng, vòng sau làm quái đứng hình 0.8 giây' },
    stats: (l, m, evo) => ({
      dmg: (14 + 6 * l) * m.might,
      radius: (46 + 9 * l) * m.area * (evo ? 1.3 : 1),
      cooldown: Math.max(0.6, 2.8 - 0.22 * l) * m.haste,
      knock: 170,
      pulses: evo ? 2 : 1,
      stun: evo ? 0.8 : 0,
    }),
  },
  claw: {
    name: 'Vuốt Gió', icon: '🐾', max: 7,
    desc: l => (l === 0 ? 'Bổ một vệt vuốt rộng về hướng đang quay mặt' : '+Sát thương, vệt vuốt dài hơn'),
    evo: { perk: 'might', name: 'Song Trảo', icon: '⚔️', desc: 'Bổ cả hai bên cùng lúc, hất quái văng ra xa' },
    stats: (l, m, evo) => ({
      dmg: (16 + 7 * l) * m.might,
      cooldown: Math.max(0.35, 1.5 - 0.12 * l) * m.haste,
      reach: (52 + 6 * l) * m.area * (evo ? 1.35 : 1),
      arc: 1.15 + 0.04 * l,
      knock: evo ? 260 : 120,
      sides: evo ? 2 : 1,
      sweeps: 1 + Math.floor(l / 4) + m.amount,
    }),
  },
  bolt: {
    name: 'Thiên Lôi', icon: '⚡', max: 6,
    desc: l => (l === 0 ? 'Sét giáng xuống những con quái ngẫu nhiên quanh cáo' : '+1 tia sét, +sát thương'),
    evo: { perk: 'luck', name: 'Lôi Vũ', icon: '🌩️', desc: 'Mỗi tia nảy sang 2 con bên cạnh và luôn chí mạng' },
    stats: (l, m, evo) => ({
      dmg: (22 + 9 * l) * m.might,
      cooldown: Math.max(0.8, 3.2 - 0.25 * l) * m.haste,
      strikes: 1 + Math.floor(l / 2) + m.amount + (evo ? 1 : 0),
      radius: (20 + 2 * l) * m.area,
      range: 200,
      chain: evo ? 2 : 0,
      alwaysCrit: !!evo,
    }),
  },
  frost: {
    name: 'Băng Vụn', icon: '❄️', max: 7,
    desc: l => (l === 0 ? 'Bắn một chùm mảnh băng xuyên qua và làm chậm quái' : '+1 mảnh, làm chậm sâu hơn'),
    evo: { perk: 'amount', name: 'Bão Tuyết', icon: '🌨️', desc: 'Mảnh băng vỡ ra thành mảnh nhỏ, quái gần như đứng hình' },
    stats: (l, m, evo) => ({
      dmg: (9 + 4 * l) * m.might,
      cooldown: Math.max(0.45, 1.6 - 0.12 * l) * m.haste,
      count: 3 + Math.floor(l / 2) + m.amount,
      spread: 0.55,
      speed: 200,
      pierce: 1 + Math.floor(l / 3),
      slow: evo ? 0.25 : Math.max(0.4, 0.68 - 0.04 * l),
      slowFor: 1.6 + 0.1 * l,
      shatter: evo ? 2 : 0,
      range: 240,
    }),
  },
  aura: {
    name: 'Hồ Quang', icon: '🌟', max: 6,
    desc: l => (l === 0 ? 'Vầng sáng quanh cáo liên tục đốt và đẩy quái ra' : '+Phạm vi, +sát thương mỗi nhịp'),
    evo: { perk: 'area', name: 'Nuốt Hồn', icon: '👁️', desc: 'Mỗi nhịp đốt trúng quái thì hút lại 1 máu' },
    stats: (l, m, evo) => ({
      dmg: (5 + 3 * l) * m.might,
      radius: (34 + 6 * l) * m.area * (evo ? 1.25 : 1),
      tick: 0.55 * m.haste,
      knock: 45,
      drain: evo ? 1 : 0,
    }),
  },
  lantern: {
    name: 'Đèn Hồ Ly', icon: '🏮', max: 6,
    desc: l => (l === 0 ? 'Thả đèn lửa xuống đất, quái đi qua là cháy' : '+Vũng lửa to hơn, cháy lâu hơn'),
    evo: { perk: 'regen', name: 'Hỏa Ngục', icon: '🔆', desc: 'Vũng lửa nổ tung khi tắt, thiêu sạch chỗ đó' },
    stats: (l, m, evo) => ({
      dmg: (5 + 2.2 * l) * m.might,
      cooldown: Math.max(1, 3 - 0.2 * l) * m.haste,
      pools: 1 + Math.floor(l / 3) + m.amount,
      radius: (26 + 3 * l) * m.area * (evo ? 1.3 : 1),
      life: 3 + 0.4 * l,
      tick: 0.4,
      burst: evo ? (40 + 8 * l) * m.might : 0,
    }),
  },
  talisman: {
    name: 'Lá Bùa', icon: '🎴', max: 6,
    desc: l => (l === 0 ? 'Ném lá bùa bay vòng ra rồi quay về tay cáo' : '+1 lá bùa, bay xa hơn'),
    evo: { perk: 'speed', name: 'Bùa Truy Hồn', icon: '💮', desc: 'Lá bùa tự bám theo quái và ở lại lâu gấp đôi' },
    stats: (l, m, evo) => ({
      dmg: (12 + 5 * l) * m.might,
      cooldown: Math.max(0.7, 2.2 - 0.15 * l) * m.haste,
      count: 1 + Math.floor(l / 2) + m.amount,
      reach: (110 + 8 * l) * m.area,
      speed: 190,
      life: (1.7 + 0.1 * l) * (evo ? 2 : 1),
      seek: evo ? 220 : 0,
    }),
  },
};

export const ALL_UPGRADES = { ...WEAPONS, ...PERKS };

// Name and icon as they should appear once a weapon has evolved.
export function weaponFace(player, key) {
  const w = WEAPONS[key];
  return player.evolved?.[key] && w.evo ? { name: w.evo.name, icon: w.evo.icon } : { name: w.name, icon: w.icon };
}

// ---- Level-up rolls --------------------------------------------------------

function evoReady(player, key) {
  const w = WEAPONS[key];
  return !!w.evo && !player.evolved[key] && (player.weapons[key] ?? 0) >= w.max &&
    (player.perks[w.evo.perk] ?? 0) >= EVO_PERK_LEVEL;
}

// The line the HUD shows on a maxed weapon that is still waiting for its perk.
export function evoHint(player, key) {
  const w = WEAPONS[key];
  if (!w.evo || player.evolved[key] || (player.weapons[key] ?? 0) < w.max) return null;
  const need = EVO_PERK_LEVEL - (player.perks[w.evo.perk] ?? 0);
  return need > 0 ? `${w.evo.name}: cần ${PERKS[w.evo.perk].name} Lv.${EVO_PERK_LEVEL}` : null;
}

// Draws `n` distinct entries by weight, so a fresh run keeps handing out new weapons instead of
// a third stack of +12% damage.
function weightedDraw(pool, n) {
  const out = [];
  const left = [...pool];
  while (out.length < n && left.length) {
    let total = 0;
    for (const c of left) total += c.weight;
    let roll = Math.random() * total;
    let i = 0;
    while (i < left.length - 1 && (roll -= left[i].weight) > 0) i++;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

// A choice is { kind: 'weapon' | 'perk' | 'evo', key }.
export function rollChoices(player, count) {
  const slots = count ?? ((player.perks.luck ?? 0) >= 3 ? 4 : 3);
  const owned = Object.keys(player.weapons).length;
  const evos = shuffle(Object.keys(WEAPONS).filter(k => evoReady(player, k))).slice(0, 1)
    .map(key => ({ kind: 'evo', key }));

  const pool = [];
  for (const [key, w] of Object.entries(WEAPONS)) {
    const lvl = player.weapons[key] ?? 0;
    if (player.evolved[key] || lvl >= w.max) continue;
    if (lvl === 0 && owned >= WEAPON_SLOTS) continue;
    pool.push({ kind: 'weapon', key, weight: lvl === 0 ? (owned < 3 ? 4 : 1.8) : 2.2 });
  }
  for (const [key, p] of Object.entries(PERKS)) {
    const lvl = player.perks[key] ?? 0;
    if (lvl >= p.max) continue;
    if (lvl === 0 && Object.keys(player.perks).length >= PERK_SLOTS) continue;
    pool.push({ kind: 'perk', key, weight: key === 'revive' ? 0.5 : 1.6 });
  }
  return [...evos, ...weightedDraw(pool, Math.max(0, slots - evos.length))];
}

export function applyChoice(player, choice) {
  const { kind, key } = choice;
  if (kind === 'evo') {
    player.evolved[key] = true;
    player.weapons[key] = WEAPONS[key].max;
    return;
  }
  if (kind === 'weapon') {
    player.weapons[key] = (player.weapons[key] ?? 0) + 1;
    player.cd[key] = player.cd[key] ?? 0;
    return;
  }
  const lvl = (player.perks[key] ?? 0) + 1;
  player.perks[key] = lvl;
  if (key === 'vitality') {
    player.maxHp += 25;
    player.hp = Math.min(player.maxHp, player.hp + 25);
  }
  if (key === 'speed') player.speed = player.baseSpeed * 1.1 ** lvl;
  if (key === 'magnet') player.pickup = player.basePickup * 1.45 ** lvl;
}

// A chest hands out weapon levels — never a perk, so opening one always changes how you fight.
export function chestPicks(player, n) {
  const owned = Object.keys(player.weapons);
  const upgradable = owned.filter(k => !player.evolved[k] && player.weapons[k] < WEAPONS[k].max);
  const fresh = Object.keys(WEAPONS).filter(k => !(k in player.weapons));
  const pool = upgradable.length ? upgradable : owned.length < WEAPON_SLOTS ? fresh : [];
  if (!pool.length) return [];
  return Array.from({ length: n }, () => pool[(Math.random() * pool.length) | 0]);
}

// ---- Player ----------------------------------------------------------------

export class Player {
  constructor(sheet, x, y) {
    this.anim = sheet.views ? new DirectionalAnimator(sheet) : new Animator(sheet);
    this.hitY = Math.round((sheet.headroom ?? 20) / 2);
    this.x = x;
    this.y = y;
    this.r = 9;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.maxHp = 130;
    this.hp = 130;
    this.baseSpeed = 90;
    this.speed = 90;
    this.basePickup = 64;
    this.pickup = 64;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = 6;
    this.gold = 0;
    this.invuln = 0;
    this.hurtTimer = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.dashDir = { x: 1, y: 0 };
    this.weapons = { foxfire: 1 };
    this.perks = {};
    this.evolved = {};
    this.cd = { foxfire: 0 };
    this.orbAngle = 0;
    this.orbs = [];
    this.spinFx = 0;
    this.spinRadius = 0;
    this.auraFx = 0;
    this.auraRadius = 0;
    this.claws = [];
    this.revived = false;
    this.regenBank = 0;
    this.onDash = null;
  }

  get dead() {
    return this.hp <= 0;
  }

  get dashing() {
    return this.dashTime > 0;
  }

  get dashCooldown() {
    return 1.2 * 0.75 ** (this.perks.dash ?? 0);
  }

  update(dt, axis, wantDash, world, m) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    if (m.regen > 0 && this.hp > 0 && this.hp < this.maxHp) {
      this.regenBank += m.regen * dt;
      const whole = Math.floor(this.regenBank);
      if (whole > 0) {
        this.regenBank -= whole;
        this.hp = Math.min(this.maxHp, this.hp + whole);
      }
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const power = 260 + 40 * (this.perks.dash ?? 0);
      this.vx = this.dashDir.x * power;
      this.vy = this.dashDir.y * power;
    } else {
      if (wantDash && this.dashCd === 0) {
        this.dashDir = axis.x || axis.y ? { ...axis } : { x: this.facing, y: 0 };
        this.dashTime = 0.16 + 0.02 * (this.perks.dash ?? 0);
        this.dashCd = this.dashCooldown;
        this.invuln = Math.max(this.invuln, 0.25);
        this.onDash?.();
      }
      const k = 1 - Math.exp(-dt * 18);
      this.vx += (axis.x * this.speed - this.vx) * k;
      this.vy += (axis.y * this.speed - this.vy) * k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    world.collide(this);

    if (Math.abs(this.vx) > 4) this.facing = Math.sign(this.vx);
    this.anim.face?.(this.vx, this.vy);
    const moving = Math.hypot(this.vx, this.vy) > 12;
    this.anim.play(this.hurtTimer > 0 ? 'hurt' : moving ? 'run' : 'idle');
    this.anim.update(dt * 1000 * (this.dashing ? 1.8 : 1));
  }

  // Returns the damage actually taken, 0 if the hit was dodged or the fox is already down.
  damage(amount, armor = 0) {
    if (this.invuln > 0 || this.dead) return 0;
    const taken = Math.max(1, Math.round(amount - armor));
    this.hp = Math.max(0, this.hp - taken);
    this.invuln = 0.8;
    this.hurtTimer = 0.25;
    this.anim.play('hurt', true);
    return taken;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  // Returns how many levels were gained.
  gainXp(amount) {
    this.xp += amount;
    let ups = 0;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = Math.floor(6 + this.level ** 1.5 * 3);
      ups++;
    }
    return ups;
  }
}

// ---- Enemies ---------------------------------------------------------------
// r: body collider at the feet · hitY/hitR: the circle weapons hit, above the feet · scale: art scale
// ai: which routine in swarm.js drives it · art: which sheet in buildEnemyArt() it draws with

export const ENEMY_TYPES = {
  green: {
    name: 'Nhớt Xanh', hp: 12, speed: 34, dmg: 4, r: 7, hitY: 10, hitR: 9, mass: 1, xp: 1,
    scale: 2, fps: 5, color: '#7ed957', ai: 'chase', art: 'slimeGreen',
  },
  purple: {
    name: 'Nhớt Tím', hp: 28, speed: 52, dmg: 6, r: 7, hitY: 10, hitR: 9, mass: 1, xp: 2,
    scale: 2, fps: 6, color: '#b06cff', ai: 'chase', art: 'slimePurple',
  },
  blue: {
    name: 'Nhớt Đá', hp: 85, speed: 24, dmg: 10, r: 10, hitY: 14, hitR: 13, mass: 2.4, xp: 5,
    scale: 2.7, fps: 4, color: '#5ad1ff', ai: 'chase', art: 'slimeBlue',
  },
  bat: {
    name: 'Dơi', hp: 9, speed: 66, dmg: 4, r: 5, hitY: 10, hitR: 8, mass: 0.5, xp: 1,
    scale: 1.5, fps: 12, color: '#8d6bb5', ai: 'weave', art: 'bat', fly: true,
  },
  wisp: {
    name: 'Bóng Ma', hp: 40, speed: 46, dmg: 8, r: 7, hitY: 12, hitR: 10, mass: 1.2, xp: 3,
    scale: 1.9, fps: 7, color: '#7df6ff', ai: 'ghost', art: 'wisp', fly: true, ghost: true,
  },
  boar: {
    name: 'Heo Lòi', hp: 70, speed: 36, dmg: 13, r: 9, hitY: 12, hitR: 12, mass: 2, xp: 5,
    scale: 2.2, fps: 6, color: '#a9743f', ai: 'charger', art: 'boar', charge: { range: 150, wind: 0.6, dash: 0.5, rest: 0.9, power: 4.2 },
  },
  toad: {
    name: 'Cóc Độc', hp: 46, speed: 24, dmg: 6, r: 8, hitY: 11, hitR: 11, mass: 1.6, xp: 4,
    scale: 2.1, fps: 4, color: '#8ec63f', ai: 'ranged', art: 'toad',
    shot: { range: 145, rate: 2.2, speed: 115, dmg: 8, r: 3, color: '#b6ff5a', life: 2.4 },
  },
  puff: {
    name: 'Nấm Nổ', hp: 24, speed: 46, dmg: 6, r: 6, hitY: 10, hitR: 9, mass: 0.9, xp: 2,
    scale: 1.8, fps: 8, color: '#ff9f4a', ai: 'chase', art: 'puff', explode: { r: 42, dmg: 16 },
  },
  bandit: {
    name: 'Cướp', hp: 52, speed: 64, dmg: 10, r: 7, hitY: 14, hitR: 11, mass: 1.3, xp: 4,
    scale: 1.9, fps: 7, color: '#d06a3a', ai: 'chase', art: 'bandit', gold: 2,
  },
  archer: {
    name: 'Cướp Bắn Cung', hp: 38, speed: 50, dmg: 7, r: 7, hitY: 14, hitR: 11, mass: 1.2, xp: 4,
    scale: 1.9, fps: 7, color: '#5fbf72', ai: 'ranged', art: 'archer', gold: 3,
    shot: { range: 170, rate: 1.9, speed: 165, dmg: 9, r: 2, color: '#ffe9a8', life: 2.2 },
  },
  mule: {
    name: 'Cướp Áp Tải', hp: 110, speed: 76, dmg: 0, r: 8, hitY: 14, hitR: 12, mass: 1.6, xp: 12,
    scale: 2, fps: 9, color: '#ffd23f', ai: 'flee', art: 'mule', gold: 12, chest: 2, flees: 20,
  },
  brute: {
    name: 'Cướp Đầu Gấu', hp: 280, speed: 32, dmg: 18, r: 12, hitY: 20, hitR: 16, mass: 4, xp: 20,
    scale: 3, fps: 5, color: '#ff5a5a', ai: 'charger', art: 'brute', elite: true, gold: 10,
    charge: { range: 190, wind: 0.75, dash: 0.6, rest: 1.1, power: 3.6 },
  },
  captain: {
    name: 'Đầu Lĩnh Cướp', hp: 1200, speed: 42, dmg: 22, r: 14, hitY: 24, hitR: 20, mass: 6, xp: 50,
    scale: 3.4, fps: 6, color: '#c08bff', ai: 'captain', art: 'captain', elite: true, boss: true,
    gold: 30, chest: 3,
    shot: { rate: 3.4, speed: 135, dmg: 12, r: 3, color: '#ffb3f0', life: 2.6, volley: 8 },
    summon: { every: 7, count: 4, type: 'bandit' },
  },
  boss: {
    name: 'Quái Khói', hp: 480, speed: 28, dmg: 16, r: 18, hitY: 40, hitR: 30, mass: 5, xp: 35,
    scale: 1, fps: 8, color: '#ff3b3b', ai: 'chase', art: 'slimeRed', elite: true, boss: true, gold: 15,
  },
};

export class Enemy {
  constructor(type, x, y, hpMul) {
    const t = ENEMY_TYPES[type];
    this.type = type;
    this.name = t.name;
    this.x = x;
    this.y = y;
    this.maxHp = this.hp = Math.round(t.hp * (t.boss ? Math.min(hpMul, 3) : hpMul));
    this.baseSpeed = t.speed * (0.9 + Math.random() * 0.2);
    this.speed = this.baseSpeed;
    this.dmg = t.dmg;
    this.r = t.r;
    this.hitY = t.hitY;
    this.hitR = t.hitR;
    this.mass = t.mass;
    this.fps = t.fps;
    this.color = t.color;
    this.xp = t.xp;
    this.scale = t.scale;
    this.art = t.art;
    this.ai = t.ai;
    this.fly = !!t.fly;
    this.ghost = !!t.ghost;
    this.elite = !!t.elite;
    this.boss = !!t.boss;
    this.gold = t.gold ?? 0;
    this.chest = t.chest ?? 0;
    this.explode = t.explode ?? null;
    this.shot = t.shot ?? null;
    this.charge = t.charge ?? null;
    this.summon = t.summon ?? null;
    this.kx = 0;
    this.ky = 0;
    this.flash = 0;
    // One re-hit timer per lingering damage source, so an orb, the aura, a fire pool and a
    // talisman sitting on the same slime all tick on their own clocks.
    this.orbCd = 0;
    this.auraCd = 0;
    this.zoneCd = 0;
    this.talCd = 0;
    this.slow = 0;
    this.slowMul = 1;
    this.stun = 0;
    this.state = 'walk';
    this.timer = Math.random() * 1.2;
    this.shotCd = t.shot ? 0.6 + Math.random() * (t.shot.rate ?? 2) : 0;
    this.summonCd = t.summon ? t.summon.every : 0;
    this.life = t.flees ?? 0;
    this.dvx = 0;
    this.dvy = 0;
    this.phase = Math.random() * 10;
    this.seed = Math.random() * Math.PI * 2;
  }
}

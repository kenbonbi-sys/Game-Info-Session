// Player, enemies and the upgrade/skill definitions.
import { Animator, DirectionalAnimator } from './sprites.js';

export const UPGRADES = {
  foxfire: {
    name: 'Foxfire', icon: '🔥', max: 6,
    desc: l => (l === 0 ? 'Bắn cầu lửa vào quái gần nhất' : '+Sát thương, bắn nhanh hơn' + (l % 2 === 1 ? ', +1 cầu lửa' : '')),
  },
  orbs: {
    name: 'Spirit Orbs', icon: '🔮', max: 6,
    desc: l => (l === 0 ? '2 quả cầu linh hồn xoay quanh cáo' : '+1 quả cầu, +sát thương'),
  },
  spin: {
    name: 'Tail Spin', icon: '🌀', max: 5,
    desc: l => (l === 0 ? 'Quẫy đuôi gây sát thương + đẩy lùi xung quanh' : '+Phạm vi, +sát thương, hồi chiêu nhanh hơn'),
  },
  speed: { name: 'Swift Paws', icon: '👟', max: 5, desc: () => '+12% tốc độ chạy' },
  vitality: { name: 'Vitality', icon: '❤️', max: 5, desc: () => '+25 máu tối đa, hồi 25 máu' },
  magnet: { name: 'Magnet', icon: '🧲', max: 4, desc: () => '+50% phạm vi hút EXP' },
};

export function applyUpgrade(player, key) {
  player.skills[key] = (player.skills[key] ?? 0) + 1;
  if (key === 'speed') player.speed *= 1.12;
  if (key === 'vitality') {
    player.maxHp += 25;
    player.hp = Math.min(player.maxHp, player.hp + 25);
  }
  if (key === 'magnet') player.pickup *= 1.5;
}

export function rollChoices(player, count = 3) {
  const pool = Object.keys(UPGRADES).filter(k => (player.skills[k] ?? 0) < UPGRADES[k].max);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function weaponStats(player) {
  const f = player.skills.foxfire ?? 0;
  const o = player.skills.orbs ?? 0;
  const s = player.skills.spin ?? 0;
  return {
    foxfire: f > 0 && {
      dmg: 10 + f * 4,
      cooldown: 0.8 * 0.87 ** (f - 1),
      count: 1 + Math.floor((f - 1) / 2),
      speed: 240,
      pierce: Math.floor(f / 3),
    },
    orbs: o > 0 && { count: 1 + o, dmg: 6 + o * 3, radius: 34 + o * 3, spin: 3 + o * 0.3 },
    spin: s > 0 && { dmg: 14 + s * 6, radius: 46 + s * 8, cooldown: 2.6 - s * 0.2 },
  };
}

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
    this.maxHp = 100;
    this.hp = 100;
    this.speed = 90;
    this.pickup = 64;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = 6;
    this.invuln = 0;
    this.hurtTimer = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.dashDir = { x: 1, y: 0 };
    this.skills = { foxfire: 1 };
    this.cd = { foxfire: 0, spin: 0 };
    this.orbAngle = 0;
    this.spinFx = 0;
    this.spinRadius = 0;
    this.onDash = null;
  }

  get dead() {
    return this.hp <= 0;
  }

  get dashing() {
    return this.dashTime > 0;
  }

  update(dt, axis, wantDash, world) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDir.x * 260;
      this.vy = this.dashDir.y * 260;
    } else {
      if (wantDash && this.dashCd === 0) {
        this.dashDir = axis.x || axis.y ? { ...axis } : { x: this.facing, y: 0 };
        this.dashTime = 0.16;
        this.dashCd = 1.2;
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

  damage(amount) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 0.8;
    this.hurtTimer = 0.25;
    this.anim.play('hurt', true);
    return true;
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

export const ENEMY_TYPES = {
  // r: body collider at the feet · hitY/hitR: weapon hit circle above the feet · scale: slime draw scale
  green: { hp: 12, speed: 34, dmg: 5, r: 7, hitY: 10, hitR: 9, mass: 1, xp: 1, scale: 2, fps: 5, color: '#7ed957' },
  purple: { hp: 26, speed: 50, dmg: 7, r: 7, hitY: 10, hitR: 9, mass: 1, xp: 2, scale: 2, fps: 6, color: '#b06cff' },
  boss: { hp: 420, speed: 28, dmg: 15, r: 18, hitY: 40, hitR: 30, mass: 5, xp: 30, scale: 1, fps: 8, color: '#ff3b3b' },
};

export class Enemy {
  constructor(type, x, y, hpMul) {
    const t = ENEMY_TYPES[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.maxHp = this.hp = Math.round(t.hp * hpMul);
    this.speed = t.speed * (0.9 + Math.random() * 0.2);
    this.dmg = t.dmg;
    this.r = t.r;
    this.hitY = t.hitY;
    this.hitR = t.hitR;
    this.mass = t.mass;
    this.fps = t.fps;
    this.color = t.color;
    this.xp = t.xp;
    this.scale = t.scale;
    this.kx = 0;
    this.ky = 0;
    this.flash = 0;
    this.orbCd = 0;
    this.phase = Math.random() * 10;
  }
}

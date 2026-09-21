import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_ART_KEYS, raggedGrids } from '../src/sprites.js';
import {
  ENEMY_TYPES, PERKS, WEAPONS, WEAPON_SLOTS, PERK_SLOTS, EVO_PERK_LEVEL,
  mods, rollChoices, applyChoice, chestPicks,
} from '../src/entities.js';
import { WAVES, EVENTS } from '../src/swarm.js';

// A player as the upgrade code sees it. No canvas, so this runs under plain node --test.
const freshPlayer = () => ({
  weapons: { foxfire: 1 }, perks: {}, evolved: {}, cd: { foxfire: 0 },
  maxHp: 130, hp: 130, baseSpeed: 90, speed: 90, basePickup: 64, pickup: 64,
});

test('every enemy in the roster has art and a behaviour the loop knows', () => {
  const routines = new Set(['chase', 'weave', 'ghost', 'charger', 'ranged', 'flee', 'captain']);
  for (const [key, t] of Object.entries(ENEMY_TYPES)) {
    assert.ok(ENEMY_ART_KEYS.includes(t.art), `${key} draws with missing art "${t.art}"`);
    assert.ok(routines.has(t.ai), `${key} asks for missing behaviour "${t.ai}"`);
    assert.ok(t.name && t.hp > 0 && t.speed >= 0 && t.r > 0, `${key} has a nonsense stat block`);
    if (t.ai === 'ranged' || t.ai === 'captain') assert.ok(t.shot, `${key} shoots but has no shot`);
    if (t.ai === 'charger') assert.ok(t.charge, `${key} charges but has no charge`);
    if (t.ai === 'captain') assert.ok(t.summon && ENEMY_TYPES[t.summon.type], `${key} summons nothing real`);
  }
  assert.deepEqual(raggedGrids(), [], 'pixel grids with rows of different lengths lose pixels');
});

test('nothing the director can spawn is missing from the roster', () => {
  let last = -1;
  for (const w of WAVES) {
    assert.ok(w.at > last, 'waves have to be in order for waveAt() to pick the right one');
    last = w.at;
    assert.ok(w.rate > 0 && w.pool.length);
    for (const type of w.pool) assert.ok(ENEMY_TYPES[type], `wave at ${w.at}s spawns unknown "${type}"`);
  }
  last = -1;
  for (const ev of EVENTS) {
    assert.ok(ev.at > last, 'events have to be in order — the director only ever looks forward');
    last = ev.at;
    if (ev.type) assert.ok(ENEMY_TYPES[ev.type], `event at ${ev.at}s spawns unknown "${ev.type}"`);
  }
});

test('every weapon stays finite at every level, with any perks and evolved or not', () => {
  const none = mods(freshPlayer());
  const maxed = mods({ perks: Object.fromEntries(Object.entries(PERKS).map(([k, p]) => [k, p.max])) });
  for (const [key, w] of Object.entries(WEAPONS)) {
    if (w.evo) assert.ok(PERKS[w.evo.perk], `${key} evolves off unknown perk "${w.evo.perk}"`);
    for (const m of [none, maxed]) {
      for (let l = 1; l <= w.max; l++) {
        for (const evo of [false, true]) {
          const s = w.stats(l, m, evo);
          for (const [field, value] of Object.entries(s)) {
            if (typeof value !== 'number') continue;
            assert.ok(Number.isFinite(value), `${key} Lv.${l} has ${field} = ${value}`);
            assert.ok(value >= 0, `${key} Lv.${l} has negative ${field}`);
          }
          if (s.cooldown !== undefined) assert.ok(s.cooldown > 0, `${key} Lv.${l} would fire every frame`);
          if (s.count !== undefined) assert.ok(s.count >= 1, `${key} Lv.${l} fires nothing`);
        }
      }
      assert.ok(w.desc(0).length && w.desc(w.max).length);
    }
  }
});

test('level-up rolls respect the slot caps and never offer a maxed upgrade', () => {
  const player = freshPlayer();
  for (let i = 0; i < 400; i++) {
    const choices = rollChoices(player);
    for (const c of choices) {
      if (c.kind === 'evo') continue;
      const [owned, defs] = c.kind === 'weapon' ? [player.weapons, WEAPONS] : [player.perks, PERKS];
      assert.ok((owned[c.key] ?? 0) < defs[c.key].max, `offered a maxed ${c.key}`);
      if (!(c.key in owned)) {
        const cap = c.kind === 'weapon' ? WEAPON_SLOTS : PERK_SLOTS;
        assert.ok(Object.keys(owned).length < cap, `offered a new ${c.key} with no slot free`);
      }
    }
    if (choices.length) applyChoice(player, choices[0]);
  }
  assert.ok(Object.keys(player.weapons).length <= WEAPON_SLOTS);
  assert.ok(Object.keys(player.perks).length <= PERK_SLOTS);
  for (const [k, l] of Object.entries(player.weapons)) assert.ok(l <= WEAPONS[k].max, `${k} went past max`);
  for (const [k, l] of Object.entries(player.perks)) assert.ok(l <= PERKS[k].max, `${k} went past max`);
});

test('an evolution is offered once the weapon is maxed and its perk has caught up', () => {
  const player = freshPlayer();
  player.weapons = { spin: WEAPONS.spin.max };
  player.perks = { [WEAPONS.spin.evo.perk]: EVO_PERK_LEVEL - 1 };
  const offered = () => Array.from({ length: 60 }, () => rollChoices(player)).flat().some(c => c.kind === 'evo');
  assert.equal(offered(), false, 'evolution showed up before its perk was ready');
  player.perks[WEAPONS.spin.evo.perk] = EVO_PERK_LEVEL;
  assert.equal(offered(), true, 'evolution never showed up even though it was ready');
  applyChoice(player, { kind: 'evo', key: 'spin' });
  assert.equal(player.evolved.spin, true);
  assert.equal(offered(), false, 'the same evolution was offered twice');
});

test('a chest hands out weapon levels it can actually give', () => {
  const player = freshPlayer();
  player.weapons = { foxfire: WEAPONS.foxfire.max, orbs: 2 };
  for (let i = 0; i < 50; i++) {
    for (const key of chestPicks(player, 3)) {
      assert.notEqual(key, 'foxfire', 'chest offered levels on an already maxed weapon');
      assert.ok(WEAPONS[key], `chest offered unknown weapon "${key}"`);
    }
  }
  // Everything maxed and every slot full: the chest has nothing left to give, and says so.
  player.weapons = Object.fromEntries(Object.keys(WEAPONS).slice(0, WEAPON_SLOTS).map(k => [k, WEAPONS[k].max]));
  assert.deepEqual(chestPicks(player, 3), []);
});

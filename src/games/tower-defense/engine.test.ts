/**
 * Hold the Haven's rules, one behaviour per test (docs/games/tower-defense.md, section 11).
 * The contract kit (contract.test.ts) covers the generic properties; this file covers
 * what only this game does, on small hand-made states with exact numbers.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../game/rng';
import { HABIT_IDS } from '../../game/types';
import { vassalName } from '../../game/vassals';
import { emptyRun, makeMember, type RunContext } from '../contract';
import { botRng, parties, playToEnd, runs } from '../testing/contract';
import {
  BREAK_TICKS,
  CNT_PCT,
  ENEMY_CAP,
  GUARD_TICKS,
  HP_PCT,
  MAPS,
  PARTY_HP_PCT,
  UNIT,
  bestPad,
  buildPads,
  buildPath,
  callWaveBonus,
  chorusBoost,
  damageOf,
  engine,
  enemyPoint,
  intervalOf,
  padCell,
  pathEnd,
  placeCost,
  pointInto,
  rangeOf,
  refund,
  scoreOf,
  upgradeCost,
  type Enemy,
  type MonsterId,
  type TDAction,
  type TDState,
  type Tower,
  type TowerKind,
} from './engine';
import game from './manifest';
import { strings } from './strings';

// ---------------------------------------------------------------------------
// Small hand-made worlds: a straight path along row 3, pads around it.
// ---------------------------------------------------------------------------

const cell = (x: number, y: number) => y * 9 + x;
const STRAIGHT = Array.from({ length: 9 }, (_, x) => cell(x, 3)); // END = 8000
/** Pads: 0 (4,2) above the path, 1 (3,2), 2 (5,2), 3 (4,4) below, 4 (0,0) far away, 5 (7,2). */
const PADS = [cell(4, 2), cell(3, 2), cell(5, 2), cell(4, 4), cell(0, 0), cell(7, 2)].sort((a, b) => a - b);
const padIndex = (x: number, y: number) => PADS.indexOf(cell(x, y));
const P_ABOVE = padIndex(4, 2);

const MEMBER_OF: Record<TowerKind, string> = {
  runner: 'move',
  lantern: 'outside',
  sweeper: 'clean',
  chorus: 'social',
  archivist: 'study',
  lull: 'sleep',
  hearth: 'eat',
  bubble: 'hygiene',
};

function world(over: Partial<TDState> = {}, difficulty: 1 | 2 | 3 | 4 | 5 = 3): TDState {
  const s = engine.initial(1, parties.full, emptyRun(difficulty), 'en');
  return { ...s, path: STRAIGHT, pads: PADS, waveAt: -1, started: 1, glow: 500, ...over };
}

function tower(pad: number, kind: TowerKind, over: Partial<Tower> = {}): Tower {
  return { pad, member: MEMBER_OF[kind], kind, level: 1, power: 44, cd: 0, invested: 0, jamUntil: 0, ...over };
}

let nextEnemy = 1;
function enemy(over: Partial<Enemy> = {}): Enemy {
  return {
    id: nextEnemy++,
    kind: 'clutter-blob',
    wave: 3,
    hp: 1000,
    maxHp: 1000,
    pos: 4000,
    speed: 30,
    armour: 0,
    glow: 4,
    leak: 1,
    markUntil: 0,
    markPct: 0,
    knockUntil: 0,
    pulseAt: 0,
    ...over,
  };
}

/** Hit points a monster of `base` hp has when it spawns in `wave` (spec section 4): difficulty, the party's power, then the wave. */
function spawnHp(s: TDState, base: number, wave: number): number {
  let hp = Math.floor((Math.floor((Math.floor((base * HP_PCT[s.difficulty - 1]!) / 100) * s.hpPct) / 100) * (100 + 6 * (wave - 1))) / 100);
  if (wave === 1) hp = Math.floor((hp * 80) / 100);
  return Math.max(1, hp);
}

const tick = (s: TDState, n = 1): TDState => {
  let out = s;
  for (let i = 0; i < n; i++) out = engine.reduce(out, { type: 'tick' });
  return out;
};
const act = (s: TDState, a: TDAction) => engine.reduce(s, a);
const start = (seed = 1, run: RunContext = runs.plain, party = parties.full) => engine.initial(seed, party, run, 'en');
const hpOf = (s: TDState, i = 0) => s.enemies[i]!.hp;

/** Every number anywhere in a value is an integer. */
function allIntegers(value: unknown, path = 'state'): string[] {
  if (typeof value === 'number') return Number.isInteger(value) ? [] : [`${path} = ${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => allIntegers(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => allIntegers(v, `${path}.${k}`));
  return [];
}

/** The naive strategy of the difficulty 1 acceptance test: cycle the cards, lowest free pad, never upgrade, never call a wave. */
function naiveAction(s: TDState): TDAction {
  const cards = s.members.filter((m) => m.kind !== null);
  const card = cards[s.towers.length % cards.length]!;
  const taken = new Set(s.towers.map((t) => t.pad));
  const pad = s.pads.findIndex((_, i) => !taken.has(i));
  return pad >= 0 && s.glow >= placeCost(card) ? { type: 'place', pad, member: card.id } : { type: 'tick' };
}

function playNaive(seed: number): TDState {
  let s = start(seed, emptyRun(1), parties.starter);
  for (let i = 0; i < 20000 && s.result === null; i++) s = engine.reduce(s, naiveAction(s));
  return s;
}

// ---------------------------------------------------------------------------
// Path following
// ---------------------------------------------------------------------------

describe('maps and the path', () => {
  it.each([0, 1, 2])('map %i: 8 to 12 pads, each touching the path, a connected path with no repeated cell', (layout) => {
    for (const mirror of [false, true]) {
      const path = buildPath(layout, mirror);
      const pads = buildPads(layout, mirror);
      expect(pads.length).toBeGreaterThanOrEqual(8);
      expect(pads.length).toBeLessThanOrEqual(12);
      expect(new Set(path).size).toBe(path.length);
      for (let i = 1; i < path.length; i++) expect(Math.abs((path[i]! % 9) - (path[i - 1]! % 9)) + Math.abs(Math.floor(path[i]! / 9) - Math.floor(path[i - 1]! / 9))).toBe(1);
      for (const p of pads) {
        const touches = path.some((c) => Math.max(Math.abs((c % 9) - (p % 9)), Math.abs(Math.floor(c / 9) - Math.floor(p / 9))) <= 1);
        expect(touches).toBe(true);
        expect(path).not.toContain(p);
      }
      expect([...pads].sort((a, b) => a - b)).toEqual(pads);
    }
  });

  it('has the documented sizes and agrees with the drawn maps', () => {
    expect([0, 1, 2].map((l) => buildPath(l, false).length)).toEqual([23, 21, 24]);
    expect([0, 1, 2].map((l) => buildPads(l, false).length)).toEqual([10, 10, 11]);
    for (const layout of [0, 1, 2]) {
      const drawn: number[] = [];
      MAPS[layout]!.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== 'o' && ch !== '.' && drawn.push(y * 9 + x)));
      expect(drawn.sort((a, b) => a - b)).toEqual([...buildPath(layout, false)].sort((a, b) => a - b));
    }
  });

  it('mirrors every cell x -> 8 - x and keeps the path order', () => {
    for (const layout of [0, 1, 2]) {
      const plain = buildPath(layout, false);
      const mirrored = buildPath(layout, true);
      expect(mirrored).toEqual(plain.map((c) => Math.floor(c / 9) * 9 + (8 - (c % 9))));
      expect(buildPads(layout, true)).toEqual(buildPads(layout, false).map((c) => Math.floor(c / 9) * 9 + (8 - (c % 9))).sort((a, b) => a - b));
    }
  });

  it('interpolates exactly: cell centres at multiples of 1000, integers in between, a turn included', () => {
    const path = buildPath(0, false);
    const pt = { x: 0, y: 0 };
    for (let k = 0; k < path.length; k++) {
      pointInto(path, k * UNIT, pt);
      expect(pt).toEqual({ x: (path[k]! % 9) * UNIT + 500, y: Math.floor(path[k]! / 9) * UNIT + 500 });
    }
    pointInto(path, 6 * UNIT + 250, pt); // (6,1) -> (6,2): straight down a quarter of a cell
    expect(pt).toEqual({ x: 6500, y: 1750 });
    pointInto(path, 99999, pt); // past the end: the Haven
    expect(pt).toEqual({ x: 8500, y: 5500 });
  });

  it.each([16, 18, 30, 44, 52])('an enemy of speed %i reaches the Haven in exactly ceil(END / speed) ticks', (speed) => {
    let s = world({ enemies: [enemy({ speed, pos: 0 })], started: 8 });
    const expected = Math.ceil(pathEnd(s.path) / speed);
    let ticks = 0;
    const seen: number[] = [];
    while (s.leaks === 0 && ticks < 5000) {
      s = tick(s);
      ticks++;
      if (s.enemies[0]) seen.push(s.enemies[0].pos);
    }
    expect(ticks).toBe(expected);
    expect(seen.every((p, i) => p === speed * (i + 1))).toBe(true);
    expect(s.leaks).toBe(1);
    expect(s.havenHp).toBe(s.havenMax - 1);
  });
});

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------

describe('towers', () => {
  it('Runner shoots the first enemy: highest position, then lowest id', () => {
    const s0 = world({ towers: [tower(P_ABOVE, 'runner')], enemies: [enemy({ pos: 3000 }), enemy({ pos: 4000 })] });
    const s1 = tick(s0);
    expect(hpOf(s1, 0)).toBe(1000);
    expect(hpOf(s1, 1)).toBe(1000 - 5);
    const tied = world({ towers: [tower(P_ABOVE, 'runner')], enemies: [enemy({ pos: 4000 }), enemy({ pos: 4000 })] });
    const t1 = tick(tied);
    expect([hpOf(t1, 0), hpOf(t1, 1)]).toEqual([995, 1000]);
    expect(t1.shots).toEqual([{ pad: P_ABOVE, x: 4530, y: 3500, kind: 'runner' }]);
  });

  it('a tower fires every `interval` ticks and holds fire without a target', () => {
    const s0 = world({ towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy({ pos: 4000, speed: 1 })] });
    const interval = intervalOf('lantern', 1, 44); // 24 - 1
    const hits: number[] = [];
    let s = s0;
    for (let i = 1; i <= interval * 3; i++) {
      const before = hpOf(s);
      s = tick(s);
      if (hpOf(s) < before) hits.push(i);
    }
    expect(hits).toEqual([1, 1 + interval, 1 + 2 * interval]);
    const idle = tick(world({ towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy({ pos: 0, speed: 1 })] }), 5);
    expect(hpOf(idle)).toBe(1000);
    expect(idle.towers[0]!.cd).toBe(0);
  });

  it('armour reduces a hit (at least 1) but the Lantern ignores it', () => {
    const armoured = (kind: TowerKind) => hpOf(tick(world({ towers: [tower(P_ABOVE, kind)], enemies: [enemy({ armour: 3 })] })));
    expect(armoured('runner')).toBe(1000 - (5 - 3));
    expect(armoured('lantern')).toBe(1000 - 20);
    const wall = hpOf(tick(world({ towers: [tower(P_ABOVE, 'runner')], enemies: [enemy({ armour: 50 })] })));
    expect(wall).toBe(999);
  });

  it('Sweeper hits every enemy in range and none outside it', () => {
    const s = tick(
      world({ towers: [tower(P_ABOVE, 'sweeper')], enemies: [enemy({ pos: 4000 }), enemy({ pos: 4300 }), enemy({ pos: 3800 }), enemy({ pos: 7000 })] }),
    );
    expect(s.enemies.map((e) => e.hp)).toEqual([990, 990, 990, 1000]);
    expect(s.shots).toHaveLength(1);
  });

  it('Chorus boosts the towers within its reach, the highest boost applies, and it is gone once sold', () => {
    const runnerOnly = (extra: Tower[]) => {
      const s = world({ towers: [tower(P_ABOVE, 'runner'), ...extra].sort((a, b) => a.pad - b.pad), enemies: [enemy()] });
      return hpOf(tick(s));
    };
    const near = padIndex(3, 2);
    const near2 = padIndex(5, 2);
    expect(runnerOnly([])).toBe(1000 - 5);
    expect(runnerOnly([tower(near, 'chorus')])).toBe(1000 - Math.floor((5 * (100 + chorusBoost(1, 44))) / 100)); // +36 percent: 6
    expect(runnerOnly([tower(near, 'chorus'), tower(near2, 'chorus', { level: 2 })])).toBe(1000 - Math.floor((5 * (100 + chorusBoost(2, 44))) / 100)); // +51 percent: 7, not 5 + 6 + 7
    expect(runnerOnly([tower(padIndex(4, 4), 'chorus')])).toBe(1000 - 6); // two cells away (2000 u) is inside the reach of 2100 + 5 * 44
    expect(rangeOf('chorus', 1, 44)).toBe(2320);
    expect(runnerOnly([tower(padIndex(7, 2), 'chorus')])).toBe(1000 - 5); // 3000 u: out of reach
    expect(runnerOnly([tower(padIndex(0, 0), 'chorus')])).toBe(1000 - 5);
    let s = world({ towers: [tower(P_ABOVE, 'runner'), tower(near, 'chorus')].sort((a, b) => a.pad - b.pad), enemies: [enemy()] });
    s = act(s, { type: 'sell', pad: near });
    expect(hpOf(tick(s))).toBe(1000 - 5);
  });

  it('one Chorus boosts every tower in its reach at once, not just a neighbour', () => {
    const left = padIndex(3, 2);
    const right = padIndex(5, 2);
    const mid = P_ABOVE;
    const twoRunners = (chorus: Tower[]) => {
      const s = tick(world({ towers: [tower(left, 'runner'), tower(right, 'runner'), ...chorus].sort((a, b) => a.pad - b.pad), enemies: [enemy()] }));
      return 1000 - hpOf(s);
    };
    expect(twoRunners([])).toBe(10);
    expect(twoRunners([tower(mid, 'chorus')])).toBe(12); // both runners hit for 6
    expect(twoRunners([tower(padIndex(0, 0), 'chorus')])).toBe(10); // out of reach of both
  });

  it('every map has pads where a Chorus reaches two or more towers, mirrored or not', () => {
    for (let layout = 0; layout < 3; layout++) {
      for (const mirror of [false, true]) {
        const pads = buildPads(layout, mirror);
        const reach = rangeOf('chorus', 1, 1);
        const neighbours = pads.map((p, i) => pads.filter((q, j) => j !== i && ((p % 9) - (q % 9)) ** 2 * UNIT * UNIT + (Math.floor(p / 9) - Math.floor(q / 9)) ** 2 * UNIT * UNIT <= reach * reach).length);
        expect(neighbours.filter((n) => n >= 2).length, `layout ${layout}, mirror ${mirror}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('Archivist marks its target: everyone hits it harder until the mark runs out', () => {
    const pads = [P_ABOVE, padIndex(3, 2)].sort((a, b) => a - b);
    const arch = pads[0]!;
    const run = pads[1]!;
    const s0 = world({ towers: [tower(arch, 'archivist'), tower(run, 'runner')], enemies: [enemy()] });
    const s1 = tick(s0);
    expect(s1.enemies[0]!.markUntil).toBe(1 + 60);
    expect(s1.enemies[0]!.markPct).toBe(40 + 8);
    expect(hpOf(s1)).toBe(1000 - 4 - Math.floor((5 * 148) / 100)); // archivist 4, then the runner at +48 percent
    // Still marked at tick 60, expired at tick 61.
    const marked = tick(world({ towers: [tower(run, 'runner')], enemies: [enemy({ markUntil: 11, markPct: 33 })], tick: 9 }));
    expect(hpOf(marked)).toBe(1000 - 6);
    const expired = tick(world({ towers: [tower(run, 'runner')], enemies: [enemy({ markUntil: 10, markPct: 33 })], tick: 9 }));
    expect(hpOf(expired)).toBe(1000 - 5);
  });

  it('Archivist prefers an unmarked enemy and never weakens a stronger mark', () => {
    const lead = enemy({ pos: 4200, markUntil: 500, markPct: 90 });
    const back = enemy({ pos: 4000 });
    const s = tick(world({ towers: [tower(P_ABOVE, 'archivist')], enemies: [lead, back] }));
    expect(s.enemies[1]!.markPct).toBe(48);
    expect(s.enemies[0]!.markPct).toBe(90);
    const again = tick(world({ towers: [tower(P_ABOVE, 'archivist')], enemies: [enemy({ pos: 4200, markUntil: 500, markPct: 90 })] }));
    expect(again.enemies[0]!.markPct).toBe(90);
    expect(again.enemies[0]!.markUntil).toBe(500);
  });

  it('Lull slows by an exact percent: cap 50, the highest of several, the Specter immune, the Static halved', () => {
    const moved = (e: Partial<Enemy>, towers: Tower[]) => tick(world({ towers, enemies: [enemy({ pos: 4000, ...e })] })).enemies[0]!.pos - 4000;
    expect(moved({}, [])).toBe(30);
    expect(moved({}, [tower(P_ABOVE, 'lull')])).toBe(Math.floor((30 * (100 - 38)) / 100)); // 30 + floor(44 / 5)
    expect(moved({}, [tower(P_ABOVE, 'lull', { level: 3, power: 100 })])).toBe(15); // 40 + 20 capped at 50
    expect(moved({}, [tower(P_ABOVE, 'lull'), tower(padIndex(3, 2), 'lull', { level: 2 })].sort((a, b) => a.pad - b.pad))).toBe(Math.floor((30 * (100 - 43)) / 100));
    expect(moved({ kind: 'silence-specter', speed: 38 }, [tower(P_ABOVE, 'lull')])).toBe(38);
    expect(moved({ kind: 'the-static', speed: 16 }, [tower(P_ABOVE, 'lull')])).toBe(Math.floor((16 * (100 - 19)) / 100));
    expect(moved({}, [tower(padIndex(0, 0), 'lull')])).toBe(30); // out of range
    expect(moved({ speed: 1 }, [tower(P_ABOVE, 'lull', { level: 3, power: 100 })])).toBe(1); // never stalls
  });

  it('Hearth repairs the Haven by 1 per interval and never above the maximum', () => {
    let s = world({ towers: [tower(P_ABOVE, 'hearth')], havenHp: 5 });
    s = tick(s);
    expect(s.havenHp).toBe(6);
    const interval = intervalOf('hearth', 1, 44); // 400 - 88
    expect(interval).toBe(312);
    const t1 = s.tick;
    while (s.havenHp === 6) s = tick(s);
    expect(s.tick - t1).toBe(interval);
    expect(s.havenHp).toBe(7);
    const full = tick(world({ towers: [tower(P_ABOVE, 'hearth')] }), 50);
    expect(full.havenHp).toBe(full.havenMax);
    expect(full.towers[0]!.cd).toBe(0);
    expect(intervalOf('hearth', 3, 100)).toBe(100); // floor of the interval
  });

  it('Bubble splashes within its radius, with half damage minus armour', () => {
    const target = enemy({ pos: 4000 });
    const near = enemy({ pos: 3500, armour: 1 }); // 500 u behind: inside 700
    const far = enemy({ pos: 3000 }); // 1000 u behind: outside
    const s = tick(world({ towers: [tower(P_ABOVE, 'bubble')], enemies: [target, near, far] }));
    const dmg = damageOf('bubble', 1, 44); // 11
    expect(s.enemies[0]!.hp).toBe(1000 - dmg);
    expect(s.enemies[1]!.hp).toBe(1000 - Math.max(1, Math.floor((dmg * 50) / 100) - 1));
    expect(s.enemies[2]!.hp).toBe(1000);
  });

  it('Bubble pushes the target back, but only once per 40 ticks, and never the Static', () => {
    let s = world({ towers: [tower(P_ABOVE, 'bubble')], enemies: [enemy({ pos: 3000 })] });
    const knocks: number[] = [];
    for (let i = 1; i <= 52; i++) {
      const before = s.enemies[0]!.pos;
      s = tick(s);
      if (s.enemies[0]!.pos < before) knocks.push(i);
    }
    expect(knocks).toEqual([1, 52]); // shots at 1, 18, 35 (cooling down), 52
    const first = tick(world({ towers: [tower(P_ABOVE, 'bubble')], enemies: [enemy({ pos: 3000 })] }));
    expect(first.enemies[0]!.pos).toBe(3000 + 30 - 250);
    const boss = tick(world({ towers: [tower(P_ABOVE, 'bubble')], enemies: [enemy({ kind: 'the-static', pos: 3000, speed: 16, armour: 3 })] }));
    expect(boss.enemies[0]!.pos).toBe(3016);
  });

  it('a hit that drops an enemy credits the kill to that member, and damage dealt stops at its hit points', () => {
    const s = tick(world({ towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy({ hp: 10 })] }));
    expect(s.enemies).toHaveLength(0);
    const lantern = s.members.find((m) => m.id === 'outside')!;
    expect(lantern.kills).toBe(1);
    expect(lantern.dealt).toBe(10);
    expect(s.kills).toBe(1);
  });

  it('a tower never wastes a shot on an enemy that is already down this tick', () => {
    const pads = [P_ABOVE, padIndex(3, 2)].sort((a, b) => a - b);
    const s = tick(world({ towers: [tower(pads[0]!, 'lantern'), tower(pads[1]!, 'lantern')], enemies: [enemy({ hp: 20, pos: 4200 }), enemy({ pos: 4000 })] }));
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.hp).toBe(1000 - 20); // the second Lantern turned to the next enemy
  });
});

// ---------------------------------------------------------------------------
// Power and levels
// ---------------------------------------------------------------------------

describe('power and levels', () => {
  it('power scales damage, range, interval and cost with the formulas of the spec', () => {
    expect(damageOf('runner', 1, 8)).toBe(4); // floor(4 * 108 / 100)
    expect(damageOf('runner', 1, 44)).toBe(5); // floor(4 * 144 / 100)
    expect(damageOf('runner', 3, 44)).toBe(Math.floor((Math.floor((4 * 220) / 100) * 144) / 100)); // 8 * 1.44 = 11
    expect(damageOf('runner', 3, 44)).toBe(11);
    expect(damageOf('lantern', 1, 44)).toBe(20);
    expect(damageOf('chorus', 2, 44)).toBe(0);
    expect(rangeOf('lantern', 1, 8)).toBe(2840);
    expect(rangeOf('lantern', 3, 44)).toBe(2800 + 220 + 500);
    expect(intervalOf('runner', 1, 8)).toBe(5);
    expect(intervalOf('runner', 1, 44)).toBe(4);
    expect(intervalOf('runner', 1, 100)).toBe(3);
    expect(placeCost(start().members.find((m) => m.id === 'outside')!)).toBe(40 + 8);
    expect(placeCost(start(1, runs.plain, parties.starter).members.find((m) => m.id === 'outside')!)).toBe(41);
  });

  it('upgrades cost one `cost`, then two, stop at level 3, and the invested glow feeds the refund', () => {
    let s = world({ glow: 1000 });
    s = act(s, { type: 'place', pad: P_ABOVE, member: 'outside' });
    const cost = 48;
    expect(s.towers[0]).toMatchObject({ level: 1, invested: cost });
    expect(upgradeCost(s.towers[0]!)).toBe(cost);
    s = act(s, { type: 'upgrade', pad: P_ABOVE });
    expect(s.towers[0]).toMatchObject({ level: 2, invested: 2 * cost });
    expect(upgradeCost(s.towers[0]!)).toBe(2 * cost);
    s = act(s, { type: 'upgrade', pad: P_ABOVE });
    expect(s.towers[0]).toMatchObject({ level: 3, invested: 4 * cost });
    expect(s.glow).toBe(1000 - 4 * cost);
    expect(upgradeCost(s.towers[0]!)).toBeNull();
    expect(act(s, { type: 'upgrade', pad: P_ABOVE })).toBe(s);
    expect(refund(s.towers[0]!)).toBe(Math.floor((4 * cost * 70) / 100));
  });

  it('upgrading changes how the tower fights', () => {
    const level = (lvl: 1 | 2 | 3) => hpOf(tick(world({ towers: [tower(P_ABOVE, 'lantern', { level: lvl })], enemies: [enemy()] })));
    expect(level(1)).toBe(1000 - damageOf('lantern', 1, 44));
    expect(level(2)).toBe(1000 - damageOf('lantern', 2, 44));
    expect(level(3)).toBe(1000 - damageOf('lantern', 3, 44));
    expect(damageOf('lantern', 3, 44)).toBeGreaterThan(damageOf('lantern', 2, 44));
  });
});

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

describe('economy', () => {
  it('refuses to place or upgrade without the glow, leaving the state untouched', () => {
    const poor = world({ glow: 47 });
    expect(act(poor, { type: 'place', pad: P_ABOVE, member: 'outside' })).toBe(poor);
    const enough = act({ ...poor, glow: 48 }, { type: 'place', pad: P_ABOVE, member: 'outside' });
    expect(enough.glow).toBe(0);
    const stuck = { ...enough, glow: 47 };
    expect(act(stuck, { type: 'upgrade', pad: P_ABOVE })).toBe(stuck);
  });

  it('refuses a taken pad, an unknown pad, an unknown member and a member without a habit', () => {
    const s = act(world(), { type: 'place', pad: P_ABOVE, member: 'move' });
    expect(act(s, { type: 'place', pad: P_ABOVE, member: 'move' })).toBe(s);
    expect(act(s, { type: 'place', pad: 99, member: 'move' })).toBe(s);
    expect(act(s, { type: 'place', pad: -1, member: 'move' })).toBe(s);
    expect(act(s, { type: 'place', pad: 1.5, member: 'move' })).toBe(s);
    expect(act(s, { type: 'place', pad: 1, member: 'nobody' })).toBe(s);
    const mixed = engine.initial(1, parties.mixed, runs.plain, 'en');
    expect(act(mixed, { type: 'place', pad: 0, member: 'citizen-ada' })).toBe(mixed);
  });

  it('selling returns 70 percent of what the tower cost, and frees the pad', () => {
    let s = world({ glow: 200 });
    s = act(s, { type: 'place', pad: P_ABOVE, member: 'move' }); // 38
    s = act(s, { type: 'upgrade', pad: P_ABOVE }); // 38 more
    expect(s.glow).toBe(200 - 76);
    const sold = act(s, { type: 'sell', pad: P_ABOVE });
    expect(sold.glow).toBe(200 - 76 + Math.floor((76 * 70) / 100));
    expect(sold.towers).toHaveLength(0);
    expect(act(sold, { type: 'sell', pad: P_ABOVE })).toBe(sold);
    expect(act(sold, { type: 'place', pad: P_ABOVE, member: 'move' }).towers).toHaveLength(1);
  });

  it('refuses to sell a jammed tower, with the state untouched, until the jam is over', () => {
    const jammed = world({ towers: [tower(P_ABOVE, 'runner', { jamUntil: 30, invested: 100 })], tick: 20 });
    expect(act(jammed, { type: 'sell', pad: P_ABOVE })).toBe(jammed);
    const free = act({ ...jammed, tick: 30 }, { type: 'sell', pad: P_ABOVE });
    expect(free.towers).toHaveLength(0);
    expect(free.glow).toBe(jammed.glow + 70);
  });

  it('adds one glow every 20 ticks', () => {
    const s = tick(world({ glow: 0 }), 100);
    expect(s.glow).toBe(5);
    expect(s.glowEarned).toBe(5);
  });

  it('kills pay glow: luck adds a percentage and wave 1 pays double', () => {
    const kill = (over: Partial<TDState>, e: Partial<Enemy>) => tick(world({ towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy({ hp: 5, glow: 7, ...e })], glow: 0, ...over }));
    expect(kill({}, {}).glow).toBe(7);
    expect(kill({ luckPct: 50 }, {}).glow).toBe(10); // floor(7 * 1.5)
    expect(kill({}, { wave: 1 }).glow).toBe(14);
    expect(kill({ luckPct: 50 }, { wave: 1 }).glow).toBe(20);
    expect(kill({}, {}).glowEarned).toBe(7);
  });

  it('keeps glow at or above zero over 200 games that run to their end, mixing the bot with random actions, and never throws', () => {
    const rng = mulberry32(2024);
    const bot = botRng(3);
    const ids = parties.full.members.map((m) => m.id);
    let withKills = 0;
    let lateWaves = 0;
    for (let g = 0; g < 200; g++) {
      const d = ((g % 5) + 1) as 1 | 2 | 3 | 4 | 5;
      let s = engine.initial(g + 1, g % 3 === 0 ? parties.starter : parties.full, emptyRun(d), 'en');
      for (let i = 0; i < 20000 && s.result === null; i++) {
        let a: TDAction;
        if (rng() < 0.12) {
          // A random action, sometimes nonsense (a pad out of range, an unknown member).
          const pad = Math.floor(rng() * (s.pads.length + 2)) - 1;
          const r = rng();
          a =
            r < 0.3
              ? { type: 'place', pad, member: ids[Math.floor(rng() * ids.length)]! }
              : r < 0.5
                ? { type: 'upgrade', pad }
                : r < 0.7
                  ? { type: 'sell', pad }
                  : r < 0.85
                    ? { type: 'callWave' }
                    : { type: 'setSpeed', speed: rng() < 0.5 ? 1 : 2 };
        } else a = engine.botPlay(s, bot)!;
        s = engine.reduce(s, a);
        if (s.glow < 0) throw new Error(`negative glow in game ${g} after ${JSON.stringify(a)}`);
        if (s.towers.length > s.pads.length) throw new Error('more towers than pads');
      }
      expect(s.result, `game ${g} ended`).not.toBeNull();
      if (s.kills > 0) withKills++;
      if (s.started >= 5) lateWaves++;
    }
    expect(withKills).toBeGreaterThan(150);
    expect(lateWaves).toBeGreaterThan(60);
  });

  it('runs on glow from the start: more at the gentle difficulties', () => {
    expect([1, 2, 3, 4, 5].map((d) => start(1, emptyRun(d as 1 | 2 | 3 | 4 | 5)).glow)).toEqual([120, 110, 100, 95, 90]);
  });
});

// ---------------------------------------------------------------------------
// Waves from the seed
// ---------------------------------------------------------------------------

describe('waves', () => {
  it('the same seed gives the same layout, mirror and waves; seeds differ', () => {
    const a = start(11);
    const b = start(11);
    expect({ l: a.layout, m: a.mirror, w: a.waves }).toEqual({ l: b.layout, m: b.mirror, w: b.waves });
    const layouts = new Set([1, 2, 3, 4, 5].map((seed) => `${start(seed).layout}${start(seed).mirror}`));
    expect(layouts.size).toBeGreaterThanOrEqual(3);
    const waves = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(start(seed).waves)));
    expect(waves.size).toBeGreaterThanOrEqual(5);
  });

  it('plays 5, 6, 8, 8 and 8 waves by difficulty, template 8 (the Static) always last', () => {
    const totals = [1, 2, 3, 4, 5].map((d) => start(3, emptyRun(d as 1 | 2 | 3 | 4 | 5)).total);
    expect(totals).toEqual([5, 6, 8, 8, 8]);
    for (const d of [1, 2, 3, 4, 5] as const) {
      const s = start(3, emptyRun(d));
      expect(s.waves).toHaveLength(s.total);
      const last = s.waves[s.waves.length - 1]!;
      expect(last[last.length - 1]!.kind).toBe('the-static');
      expect(s.waves.flat().filter((g) => g.kind === 'the-static')).toHaveLength(1);
    }
  });

  it('scales counts and spacing with the difficulty and offsets from the first enemy at 0', () => {
    const count = (d: 1 | 2 | 3 | 4 | 5) => start(1, emptyRun(d)).waves[0]!;
    expect(count(3)).toHaveLength(Math.ceil((6 * CNT_PCT[2]!) / 100));
    expect(count(3).map((g) => g.offset)).toEqual(count(3).map((_, i) => i * 40));
    expect(count(1).map((g) => g.offset)).toEqual(count(1).map((_, i) => i * 46)); // interval + 6
    expect(count(5).map((g) => g.offset)).toEqual(count(5).map((_, i) => i * 36)); // interval - 4
    expect(count(5).length).toBeGreaterThan(count(1).length);
    const lastWave = start(1, emptyRun(3)).waves[7]!;
    expect(lastWave.filter((g) => g.kind === 'clutter-blob')).toHaveLength(Math.ceil((4 * CNT_PCT[2]!) / 100));
    expect(lastWave.filter((g) => g.kind === 'dust-bunny')).toHaveLength(Math.ceil((6 * CNT_PCT[2]!) / 100));
    const bunnies = lastWave.filter((g, i) => g.kind === 'dust-bunny' && lastWave[i - 1]!.kind === 'dust-bunny');
    expect(bunnies.length).toBeGreaterThan(0);
    const i = lastWave.findIndex((g, k) => k > 0 && g.kind === 'dust-bunny' && lastWave[k - 1]!.kind === 'dust-bunny');
    expect(lastWave[i]!.offset - lastWave[i - 1]!.offset).toBe(12); // a Dust Bunny follows at half the interval
  });

  it('picks monsters from the seed: the seven templates draw two different kinds in wave 7', () => {
    const kinds = (seed: number) => [...new Set(start(seed, emptyRun(3)).waves[6]!.map((g) => g.kind))];
    for (let seed = 1; seed <= 30; seed++) expect(kinds(seed)).toHaveLength(2);
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => kinds(seed).join())).size).toBeGreaterThan(2);
  });

  it('spawns on the schedule: wave 1 at the first wave tick, the rest after the break', () => {
    let s = start(2, emptyRun(3));
    expect(s.waveAt).toBe(300);
    s = tick(s, 299);
    expect(s.started).toBe(0);
    s = tick(s);
    expect(s.started).toBe(1);
    expect(s.enemies).toHaveLength(1);
    expect(s.feed.some((l) => l.key === 'waveStart')).toBe(true);
    expect(s.enemies[0]!.hp).toBe(spawnHp(s, 60, 1)); // wave 1 is gentler
  });

  it('hit points grow with the wave number and the difficulty', () => {
    const hpAt = (wave: number, d: 1 | 3) => {
      const s = world({ queue: [{ at: 1, kind: 'clutter-blob', wave }], difficulty: d });
      return tick(s).enemies[0]!.hp;
    };
    expect(hpAt(3, 3)).toBe(spawnHp(world(), 60, 3));
    expect(hpAt(3, 1)).toBeLessThan(hpAt(3, 3));
    expect(hpAt(5, 3)).toBeGreaterThan(hpAt(3, 3));
  });

  it('clearing a wave schedules the next one after the break', () => {
    const s0 = world({ started: 1, cleared: 0, towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy({ hp: 5, wave: 1 })] });
    const s1 = tick(s0);
    expect(s1.cleared).toBe(1);
    expect(s1.waveAt).toBe(s1.tick + BREAK_TICKS[2]!);
    expect(s1.feed[s1.feed.length - 1]).toMatchObject({ key: 'waveCleared', params: { n: 1, s: 10 } });
    let s = s1;
    while (s.started === 1) s = tick(s);
    expect(s.tick).toBe(s1.waveAt);
  });

  it('keeps at most 48 enemies alive, the rest wait in the queue', () => {
    const queue = Array.from({ length: 60 }, () => ({ at: 1, kind: 'clutter-blob' as MonsterId, wave: 3 }));
    let s = tick(world({ queue, started: 3 }));
    expect(s.enemies).toHaveLength(ENEMY_CAP);
    expect(s.queue).toHaveLength(12);
    s = tick(s, 3);
    expect(s.enemies).toHaveLength(ENEMY_CAP);
    expect(s.queue).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// The Static
// ---------------------------------------------------------------------------

describe('the Static', () => {
  const bw = (over: Partial<TDState> = {}) => world({ started: 8, cleared: 7, ...over });
  const boss = (over: Partial<Enemy> = {}) => enemy({ kind: 'the-static', speed: 16, armour: 3, leak: 5, pos: 4000, pulseAt: 10, wave: 8, ...over });

  it('arrives on the last wave with a pulse 100 ticks later, and announces itself', () => {
    const s = tick(bw({ queue: [{ at: 1, kind: 'the-static', wave: 8 }], started: 8 }));
    expect(s.enemies[0]).toMatchObject({ kind: 'the-static', pulseAt: 101, hp: spawnHp(s, 800, 8) });
    expect(s.feed.some((l) => l.key === 'bossArrives')).toBe(true);
  });

  it('jams the nearest tower within 3000 units for 60 ticks, every 100 ticks', () => {
    const near = P_ABOVE;
    const other = padIndex(7, 2);
    const s0 = bw({ towers: [tower(near, 'runner'), tower(other, 'runner')].sort((a, b) => a.pad - b.pad), enemies: [boss()], tick: 9 });
    const s1 = tick(s0);
    const jammed = s1.towers.find((t) => t.pad === near)!;
    expect(jammed.jamUntil).toBe(10 + 60);
    expect(s1.towers.find((t) => t.pad === other)!.jamUntil).toBe(0);
    expect(s1.enemies[0]!.pulseAt).toBe(110);
    expect(s1.feed[s1.feed.length - 1]).toMatchObject({ key: 'jam', params: { name: 'Pell', tower: 'Runner' } });
    // The jammed tower is silent for the whole window and its countdown stops.
    const fired = (s: TDState, pad: number) => s.shots.some((x) => x.pad === pad);
    let s = s1;
    for (let t = 11; t < 70; t++) {
      s = tick(s);
      expect(fired(s, near)).toBe(false);
    }
    s = tick(s);
    expect(s.tick).toBe(70);
    expect(fired(s, near)).toBe(true);
    // The second pulse jams again at tick 110.
    while (s.tick < 110) s = tick(s);
    expect(s.towers.map((t) => t.jamUntil)).toContain(170); // by now the Static has walked on: the nearest tower is the other one
  });

  it('does not jam a tower out of reach, or one that is already jammed', () => {
    const far = padIndex(0, 0);
    const s = tick(bw({ towers: [tower(far, 'runner')], enemies: [boss({ pos: 7000 })], tick: 9 }));
    expect(s.towers[0]!.jamUntil).toBe(0);
    expect(s.enemies[0]!.pulseAt).toBe(110);
    const twoPads = [P_ABOVE, padIndex(3, 2)].sort((a, b) => a - b);
    const t = tick(bw({ towers: [tower(twoPads[0]!, 'runner', { jamUntil: 50 }), tower(twoPads[1]!, 'runner')], enemies: [boss()], tick: 9 }));
    expect(t.towers[1]!.jamUntil).toBe(70); // the first was jammed already, the next nearest takes it
  });

  it('a jammed Chorus stops boosting at once', () => {
    const pads = [P_ABOVE, padIndex(3, 2)];
    const hp = (jam: number) =>
      hpOf(tick(bw({ towers: [tower(pads[0]!, 'runner'), tower(pads[1]!, 'chorus', { jamUntil: jam })].sort((a, b) => a.pad - b.pad), enemies: [enemy()] })));
    expect(hp(0)).toBe(1000 - 6);
    expect(hp(5)).toBe(1000 - 5);
  });

  it('cannot be knocked back and leaks for 5', () => {
    const s = tick(bw({ enemies: [boss({ pos: 7990, pulseAt: 999 })] }));
    expect(s.enemies).toHaveLength(0);
    expect(s.havenHp).toBe(s.havenMax - 5);
    expect(s.feed.some((l) => l.key === 'leak')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Win, loss, buffs
// ---------------------------------------------------------------------------

describe('winning and losing', () => {
  const lastWave = (over: Partial<TDState> = {}) =>
    world({ started: 8, cleared: 7, total: 8, towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy({ hp: 5, wave: 8 })], ...over });

  it('is won when the last wave is cleared', () => {
    const s = tick(lastWave());
    expect(s.result).toBe('won');
    expect(s.cleared).toBe(8);
    expect(engine.outcome(s)).toMatchObject({ result: 'won' });
    expect(s.feed[s.feed.length - 1]!.key).toBe('won');
  });

  it('is lost when the Haven reaches 0, and that is checked before won', () => {
    const s = tick(lastWave({ towers: [], enemies: [enemy({ pos: 7990, wave: 8 })], havenHp: 1 }));
    expect(s.havenHp).toBe(0);
    expect(s.result).toBe('lost'); // the last wave was cleared by that very leak, and still it is lost
    expect(s.cleared).toBeLessThan(s.total);
    expect(engine.outcome(s)!.log[engine.outcome(s)!.log.length - 1]).toMatch(/come home after wave 8/);
  });

  it('a Hearth cannot cancel a loss: the Haven at 0 is settled right after the leaks, and the rest of the tick is skipped', () => {
    const hearth = tower(padIndex(0, 0), 'hearth');
    const runner = tower(P_ABOVE, 'runner');
    const s0 = world({ towers: [hearth, runner].sort((a, b) => a.pad - b.pad), enemies: [enemy({ pos: 7990 }), enemy({ pos: 4000, hp: 3 })], havenHp: 1 });
    const s = tick(s0);
    expect(s.result).toBe('lost');
    expect(s.havenHp).toBe(0);
    expect(s.shots).toEqual([]); // no tower acted
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.hp).toBe(3);
    expect(s.glow).toBe(s0.glow); // and no kill paid
    // With a revive the Haven stands again at half, and the tick goes on (the Hearth may then add one).
    const saved = tick({ ...s0, revivesLeft: 1, havenMax: 10 });
    expect(saved.result).toBeNull();
    expect(saved.revivesLeft).toBe(0);
    expect(saved.havenHp).toBe(5 + 1);
    expect(saved.feed.some((l) => l.key === 'revive')).toBe(true);
  });

  it('a revive restores half the Haven (rounded up), once per count', () => {
    const leaking = () => enemy({ pos: 7990, leak: 3 });
    let s = tick(world({ enemies: [leaking()], havenHp: 3, havenMax: 9, revivesLeft: 2 }));
    expect(s).toMatchObject({ havenHp: 5, revivesLeft: 1, result: null });
    expect(s.feed.some((l) => l.key === 'revive' && l.params.hp === 5)).toBe(true);
    s = tick({ ...s, havenHp: 3, enemies: [leaking()] });
    expect(s).toMatchObject({ havenHp: 5, revivesLeft: 0, result: null });
    s = tick({ ...s, havenHp: 3, enemies: [leaking()] });
    expect(s.result).toBe('lost');
  });

  it('forfeit ends as fled, and then every action returns the very same state', () => {
    const s = act(start(), { type: 'forfeit' });
    expect(s.result).toBe('fled');
    for (const a of [{ type: 'tick' }, { type: 'place', pad: 0, member: 'move' }, { type: 'callWave' }, { type: 'sell', pad: 0 }, { type: 'setSpeed', speed: 2 }, { type: 'forfeit' }] as TDAction[]) {
      expect(engine.reduce(s, a)).toBe(s);
    }
    expect(engine.forfeit!(s)).toEqual({ type: 'forfeit' });
    expect(engine.botPlay(s, botRng())).toBeNull();
  });

  it('ends at the tick guard, won while the Haven stands', () => {
    const s = tick(world({ tick: GUARD_TICKS - 1, started: 0, waveAt: -1 }));
    expect(s.tick).toBe(GUARD_TICKS);
    expect(s.result).toBe('won');
  });

  it('callWave starts the next wave now, banks floor(saved / 10) glow, and counts the early ticks', () => {
    let s = start(1, emptyRun(3));
    expect(callWaveBonus(s)).toBe(30);
    s = tick(s, 100);
    const glow = s.glow;
    const called = act(s, { type: 'callWave' });
    expect(called.started).toBe(1);
    expect(called.waveAt).toBe(-1);
    expect(called.glow).toBe(glow + 20); // 200 ticks left
    expect(called.earlyTicks).toBe(200);
    expect(called.queue.length).toBeGreaterThan(0);
    expect(called.glowEarned).toBe(s.glowEarned + 20);
    expect(act(called, { type: 'callWave' })).toBe(called); // the queue is not empty yet
    expect(callWaveBonus(called)).toBeNull();
  });

  it('a called wave spaces its monsters like a scheduled one: the first spawns on the next tick, the gaps follow the offsets', () => {
    const spawnTicks = (s0: TDState, fromTick: number) => {
      const seen: number[] = [];
      let s = s0;
      let known = 0;
      for (let i = 0; i < 200 && seen.length < 4; i++) {
        s = tick(s);
        if (s.nextId - 1 > known) {
          seen.push(s.tick - fromTick);
          known = s.nextId - 1;
        }
      }
      return seen;
    };
    const base = start(3, emptyRun(3));
    const gap = base.waves[0]![1]!.offset;
    const scheduled = spawnTicks({ ...base, waveAt: base.tick + 1 }, base.tick + 1); // starts inside the next tick
    const called = spawnTicks(act(base, { type: 'callWave' }), base.tick + 1);
    expect(scheduled.slice(0, 3)).toEqual([0, gap, 2 * gap]);
    expect(called.slice(0, 3)).toEqual([0, gap, 2 * gap]);
  });

  it('callWave with no wave scheduled saves one break, and is refused once every wave has started', () => {
    const s = world({ started: 2, waveAt: -1, queue: [], enemies: [enemy()] });
    const called = act(s, { type: 'callWave' });
    expect(called.glow).toBe(s.glow + 20);
    expect(called.earlyTicks).toBe(200);
    const all = world({ started: 8, total: 8, waveAt: -1 });
    expect(act(all, { type: 'callWave' })).toBe(all);
  });

  it('scores a win by Haven, waves and speed; a loss and a flight by waves cleared', () => {
    const won = { ...start(), result: 'won' as const, havenHp: 7, havenMax: 10, earlyTicks: 150 };
    expect(scoreOf(won)).toBe(400 + 280 + 15);
    expect(scoreOf({ ...won, earlyTicks: 9999 })).toBe(400 + 280 + 200);
    expect(scoreOf({ ...won, result: 'lost', cleared: 4, total: 8 })).toBe(150);
    expect(scoreOf({ ...won, result: 'fled', cleared: 4, total: 8 })).toBe(100);
    expect(engine.outcome(won)!.score).toBe(scoreOf(won));
  });

  it('writes the outcome log in the player language, with the top four towers and the cheers', () => {
    let s = engine.initial(1, parties.mixed, runs.plain, 'fr');
    s = act(s, { type: 'place', pad: 0, member: 'eat' });
    s = act({ ...s, glow: 999 }, { type: 'place', pad: 1, member: 'sleep' });
    s = act(s, { type: 'forfeit' });
    const o = engine.outcome(s)!;
    expect(o.result).toBe('fled');
    expect(o.log[0]).toMatch(/^Le chemin : /);
    expect(o.log.some((l) => l.includes('Ada encourage depuis le rempart'))).toBe(true);
    expect(o.log.filter((l) => /monstre\(s\) vaincu\(s\)/.test(l))).toHaveLength(2);
    expect(o.troopsUsed).toEqual(['sleep', 'eat'].sort((a, b) => parties.mixed.members.findIndex((m) => m.id === a) - parties.mixed.members.findIndex((m) => m.id === b)));
    const en = engine.outcome(engine.reduce(engine.initial(1, parties.full, runs.plain, 'en'), { type: 'forfeit' }))!;
    expect(en.log[en.log.length - 1]).toBe('The troops head home early, 0 of 6 waves cleared.');
    expect(en.troopsUsed).toEqual([]);
  });

  it('lists at most the four members that dealt the most damage', () => {
    let s = start(1, runs.plain);
    s = { ...s, glow: 9999 };
    s.members.forEach((m, i) => (s = act(s, { type: 'place', pad: i, member: m.id })));
    const o = engine.outcome(act(s, { type: 'forfeit' }))!;
    expect(o.log.filter((l) => l.includes(': 0 defeated.'))).toHaveLength(4);
    expect(o.troopsUsed).toHaveLength(8);
  });
});

describe('buffs and the party', () => {
  it('defense adds Haven hit points, rounded up', () => {
    const run: RunContext = { buffs: [{ id: 'd', kind: 'defense', amount: 15 }], roomIndex: 0, difficulty: 3 };
    expect(start(1, run).havenMax).toBe(10 + Math.ceil(1.5));
    expect(start(1, run).havenHp).toBe(12);
  });

  it('attack adds a percentage to every hit', () => {
    const run: RunContext = { buffs: [{ id: 'a', kind: 'attack', amount: 50 }], roomIndex: 0, difficulty: 3 };
    const s = tick(world({ towers: [tower(P_ABOVE, 'lantern')], enemies: [enemy()], attackPct: start(1, run).attackPct }));
    expect(start(1, run).attackPct).toBe(50);
    expect(hpOf(s)).toBe(1000 - Math.floor((20 * 150) / 100));
  });

  it('time slows waves 1 and 2 by up to 40 percent', () => {
    const slowed = (seconds: number, wave: number) => {
      const run: RunContext = { buffs: [{ id: 't', kind: 'time', amount: seconds }], roomIndex: 0, difficulty: 3 };
      const s = { ...engine.initial(1, parties.full, run, 'en'), queue: [{ at: 1, kind: 'clutter-blob' as MonsterId, wave }], waveAt: -1 };
      return tick(s).enemies[0]!.speed;
    };
    expect(slowed(0, 1)).toBe(30);
    expect(slowed(20, 1)).toBe(24);
    expect(slowed(20, 2)).toBe(24);
    expect(slowed(20, 3)).toBe(30);
    expect(slowed(90, 1)).toBe(18);
  });

  it('revive and hint buffs become counts; a hinted placement on the best pad spends a hint', () => {
    const run: RunContext = { buffs: [{ id: 'r', kind: 'revive', amount: 2 }, { id: 'h', kind: 'hint', amount: 2 }], roomIndex: 0, difficulty: 3 };
    const s = engine.initial(1, parties.full, run, 'en');
    expect(s.revivesLeft).toBe(2);
    expect(s.hintsLeft).toBe(2);
    const best = bestPad(s, 'outside')!;
    const other = best === 0 ? 1 : 0;
    // A hint is spent only by a placement the Screen marks as following a shown star, on the starred pad.
    expect(act(s, { type: 'place', pad: best, member: 'outside' }).hintsLeft).toBe(2);
    expect(act(s, { type: 'place', pad: other, member: 'outside', hinted: true }).hintsLeft).toBe(2);
    expect(act(s, { type: 'place', pad: best, member: 'outside', hinted: true }).hintsLeft).toBe(1);
    const none = engine.initial(1, parties.full, runs.plain, 'en');
    expect(act(none, { type: 'place', pad: bestPad(none, 'outside')!, member: 'outside', hinted: true }).hintsLeft).toBe(0);
  });

  it('the party changes the game: power makes towers stronger and each habit adds a card', () => {
    const full = start(1, runs.plain, parties.full);
    const starter = start(1, runs.plain, parties.starter);
    expect(full.members.filter((m) => m.kind !== null)).toHaveLength(8);
    expect(starter.members.map((m) => m.kind)).toEqual(['runner', 'lantern', 'sweeper']);
    expect(damageOf('lantern', 1, full.members[1]!.power)).toBeGreaterThan(damageOf('lantern', 1, starter.members[1]!.power));
    expect(placeCost(full.members[1]!)).toBeGreaterThan(placeCost(starter.members[1]!));
    const mixed = start(1, runs.plain, parties.mixed);
    expect(mixed.members[0]!.kind).toBeNull();
  });

  it('bestPad picks the pad with the most path in range, the lowest on a tie; Chorus wants neighbours; Hearth the lowest pad', () => {
    const s = world();
    const best = bestPad(s, 'move')!;
    expect(best).toBeGreaterThanOrEqual(0);
    expect(best).not.toBe(padIndex(0, 0)); // never the pad far from the path
    expect(bestPad(s, 'eat')).toBe(0);
    expect(bestPad({ ...s, towers: [tower(0, 'runner')] }, 'eat')).toBe(1);
    const withRunner = { ...s, towers: [tower(P_ABOVE, 'runner')] };
    const chorus = bestPad(withRunner, 'social')!;
    expect(Math.max(Math.abs(padCell(withRunner, chorus).cx - 4), Math.abs(padCell(withRunner, chorus).cy - 2))).toBe(1);
    expect(bestPad(s, 'nobody')).toBeNull();
    expect(bestPad(start(1, runs.plain, parties.mixed), 'citizen-ada')).toBeNull();
    const full = { ...s, towers: s.pads.map((_, pad) => tower(pad, 'runner')) };
    expect(bestPad(full, 'move')).toBeNull();
  });

  it('enemyPoint follows the path', () => {
    const s = world({ enemies: [enemy({ pos: 2500 })] });
    expect(enemyPoint(s, s.enemies[0]!)).toEqual({ x: 3000, y: 3500 });
  });
});

// ---------------------------------------------------------------------------
// Determinism, frame rate, bot
// ---------------------------------------------------------------------------

describe('determinism and frame rate', () => {
  it('two bot games from the same seed are identical, action for action', () => {
    const a = playToEnd(game, 7, parties.full, runs.plain);
    const b = playToEnd(game, 7, parties.full, runs.plain);
    expect(a.actions).toEqual(b.actions);
    expect(a.state).toEqual(b.state);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('a JSON round trip in the middle of a game continues exactly the same', () => {
    let s = start(21, emptyRun(3));
    const rng = botRng();
    for (let i = 0; i < 700; i++) s = engine.reduce(s, engine.botPlay(s, rng)!);
    let copy = JSON.parse(JSON.stringify(s)) as TDState;
    const rngA = botRng(5);
    const rngB = botRng(5);
    for (let i = 0; i < 700 && s.result === null; i++) {
      s = engine.reduce(s, engine.botPlay(s, rngA)!);
      copy = engine.reduce(copy, engine.botPlay(copy, rngB)!);
    }
    expect(copy).toEqual(s);
  });

  it('every number in the state is an integer, all game long', () => {
    for (const [seed, party] of [[3, parties.full], [9, parties.starter], [12, parties.mixed]] as const) {
      let s = engine.initial(seed, party, emptyRun(4), 'en');
      const rng = botRng();
      for (let i = 0; i < 6000 && s.result === null; i++) {
        s = engine.reduce(s, engine.botPlay(s, rng)!);
        if (i % 40 === 0) expect(allIntegers(s)).toEqual([]);
      }
      expect(allIntegers(s)).toEqual([]);
    }
  });

  it('the same actions on the same ticks give the same state, however the ticks are grouped in between', () => {
    // A `place` lands on tick 37 and a `callWave` on tick 100; grouping the ticks differently must not change anything.
    const plan = new Map<number, TDAction>([
      [37, { type: 'place', pad: 0, member: 'outside' }],
      [100, { type: 'callWave' }],
    ]);
    const run = (batch: number) => {
      let s = start(4, emptyRun(3));
      while (s.tick < 400) {
        for (let i = 0; i < batch && s.tick < 400; i++) {
          s = tick(s);
          const a = plan.get(s.tick);
          if (a) s = act(s, a);
        }
      }
      return s;
    };
    const one = run(1);
    expect(one.tick).toBe(400);
    expect(one.towers).toHaveLength(1);
    expect(one.started).toBe(1);
    expect(one.enemies.length).toBeGreaterThan(0);
    expect(run(2)).toEqual(one);
    expect(run(5)).toEqual(one);
    // And it can fail: the same plan with the call a tick later is a different game.
    plan.set(101, plan.get(100)!);
    plan.delete(100);
    expect(run(1)).not.toEqual(one);
  });

  it('setSpeed only stores the speed, and refuses nonsense', () => {
    const s = start();
    const fast = act(s, { type: 'setSpeed', speed: 2 });
    expect(fast.speed).toBe(2);
    expect({ ...fast, speed: 1 }).toEqual(s);
    expect(act(s, { type: 'setSpeed', speed: 1 })).toBe(s);
    expect(act(s, { type: 'setSpeed', speed: 3 as 1 })).toBe(s);
    expect(engine.reduce(s, { type: 'bogus' } as unknown as TDAction)).toBe(s);
    expect(engine.reduce(s, null as unknown as TDAction)).toBe(s);
  });

  it('never has more than 48 enemies alive and never more shots than towers', () => {
    for (const seed of [1, 2, 3]) {
      let s = start(seed, emptyRun(5));
      const rng = botRng();
      while (s.result === null) {
        s = engine.reduce(s, engine.botPlay(s, rng)!);
        if (s.enemies.length > ENEMY_CAP || s.shots.length > s.towers.length) throw new Error(`cap broken at tick ${s.tick}`);
      }
    }
    expect(true).toBe(true);
  });
});

describe('the bot', () => {
  it('wins 40 to 70 percent of seeds 1 to 100 on difficulty 3 with the full party', { timeout: 60000 }, () => {
    let wins = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = playToEnd(game, seed, parties.full, emptyRun(3));
      expect(r.outcome, `seed ${seed} ended`).not.toBeNull();
      if (r.outcome!.result === 'won') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(40);
    expect(wins).toBeLessThanOrEqual(70);
  });

  it('terminates on every difficulty and fixture party, well inside the step budget', { timeout: 60000 }, () => {
    for (const d of [1, 2, 3, 4, 5] as const) {
      for (const party of [parties.full, parties.starter, parties.mixed, parties.single]) {
        const r = playToEnd(game, d * 7, party, emptyRun(d));
        expect(r.outcome).not.toBeNull();
        expect(r.steps).toBeLessThan(20000);
      }
    }
  });

  it('always moves on: one valid action per call, null only when over', () => {
    let s = start(5);
    const rng = botRng();
    for (let i = 0; i < 400; i++) {
      const a = engine.botPlay(s, rng)!;
      const next = engine.reduce(s, a);
      expect(next === s, JSON.stringify(a)).toBe(false);
      s = next;
    }
    expect(engine.botPlay(act(s, { type: 'forfeit' }), rng)).toBeNull();
  });

  it('opens with a Lantern, builds six damage towers, then its Lull, Archivist and (once the Haven is hurt) Hearth', () => {
    const s = start(5, emptyRun(3));
    expect(engine.botPlay(s, botRng())).toMatchObject({ type: 'place', member: 'outside' });
    const gunMembers = ['outside', 'hygiene', 'clean', 'move'];
    // Fewer than six damage towers: always another damage tower.
    const early = { ...s, towers: [tower(0, 'lantern'), tower(1, 'bubble'), tower(2, 'sweeper')], glow: 900, havenHp: 3 };
    expect(gunMembers).toContain((engine.botPlay(early, botRng()) as { member: string }).member);
    // Six damage towers stand: the supports come, in order, each once.
    let state: TDState = { ...s, towers: (['lantern', 'bubble', 'sweeper', 'runner', 'lantern', 'bubble'] as TowerKind[]).map((k, i) => tower(i, k)), glow: 900, havenHp: 3 };
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = engine.botPlay(state, botRng())!;
      if (a.type !== 'place') break;
      order.push(a.member);
      state = engine.reduce(state, a);
    }
    const supports = order.filter((m) => ['social', 'sleep', 'study', 'eat'].includes(m));
    expect(supports.indexOf('sleep')).toBeLessThan(supports.indexOf('study'));
    expect(supports.indexOf('study')).toBeLessThan(supports.indexOf('eat'));
    expect(new Set(order).size).toBe(order.length);
    // A healthy Haven gets no Hearth.
    const healthy = { ...state, havenHp: state.havenMax };
    expect(order).toContain('eat');
    expect(engine.botPlay({ ...healthy, towers: healthy.towers.filter((t) => t.kind !== 'hearth') }, botRng())).not.toMatchObject({ member: 'eat' });
  });

  it('upgrades once its damage towers stand, and calls the wave when idle and broke', () => {
    const s = start(5, emptyRun(3), parties.starter);
    const seven = { ...s, glow: 500, towers: [0, 1, 2, 3, 4, 5, 6].map((p) => tower(p, 'runner')) };
    expect(engine.botPlay(seven, botRng())).toMatchObject({ type: 'upgrade', pad: 0 });
    const broke = { ...s, glow: 0 };
    expect(engine.botPlay(broke, botRng())).toEqual({ type: 'callWave' });
    expect(engine.botPlay({ ...broke, enemies: [enemy()] }, botRng())).toEqual({ type: 'tick' });
  });

  it('wins every one of 20 seeds on the full party at difficulty 2', () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) if (playToEnd(game, seed, parties.full, emptyRun(2)).outcome!.result === 'won') wins++;
    expect(wins).toBe(20);
  });
});

/** Eight vassals at level 6, loyalty 20: power 20, a mid-game party. */
const midParty = { members: HABIT_IDS.map((h) => makeMember({ id: h, name: vassalName(h), habit: h, level: 6, loyalty: 20 })) };
/** Five vassals at level 5, loyalty 60: power 21. */
const fiveParty = { members: (['move', 'outside', 'clean', 'hygiene', 'study'] as const).map((h) => makeMember({ id: h, name: vassalName(h), habit: h, level: 5, loyalty: 60 })) };

function botWins(party: typeof parties.full, difficulty: 1 | 2 | 3 | 4 | 5, seeds: number): number {
  let wins = 0;
  for (let seed = 1; seed <= seeds; seed++) if (playToEnd(game, seed, party, emptyRun(difficulty)).outcome!.result === 'won') wins++;
  return wins;
}

// Win rates are measured with the bot of spec section 9 and no buffs; the doc (section 13) has the 100-seed table.
describe('balance: a smooth curve over parties and difficulties', () => {
  it('a party of five vassals at power 21 has power 21', () => {
    expect(fiveParty.members.every((m) => m.power === 21)).toBe(true);
    expect(midParty.members.every((m) => m.power === 20)).toBe(true);
  });

  it('every party wins difficulty 1 and (at least 27 of 30) difficulty 2, the starter and five-vassal parties included', { timeout: 20000 }, () => {
    for (const party of [parties.starter, fiveParty, midParty, parties.full]) {
      expect(botWins(party, 1, 30)).toBe(30);
      expect(botWins(party, 2, 30)).toBeGreaterThanOrEqual(27);
    }
  });

  it('the starter party has a real chance on difficulty 3 (at least 5 of 30) and none on difficulty 5', { timeout: 20000 }, () => {
    expect(botWins(parties.starter, 3, 30)).toBeGreaterThanOrEqual(5);
    expect(botWins(parties.starter, 5, 15)).toBe(0);
  });

  it('the mid party (eight vassals at power 20) and the five-vassal party can win difficulty 3 too', { timeout: 20000 }, () => {
    expect(botWins(midParty, 3, 30)).toBeGreaterThanOrEqual(5);
    expect(botWins(fiveParty, 3, 30)).toBeGreaterThanOrEqual(2);
  });

  it('the full party wins less often as the difficulty rises: 3 above 4 above 5, and difficulty 5 can still be won', { timeout: 30000 }, () => {
    const [d3, d4, d5] = [botWins(parties.full, 3, 30), botWins(parties.full, 4, 30), botWins(parties.full, 5, 50)];
    expect(d3).toBeGreaterThan(d4);
    expect(d4 / 30).toBeGreaterThan(d5 / 50);
    expect(d5).toBeGreaterThanOrEqual(1);
  });

  it('the monster hit points only grow with the difficulty, by at most 1.6 times a step', () => {
    for (let d = 1; d < 5; d++) {
      expect(HP_PCT[d]!).toBeGreaterThan(HP_PCT[d - 1]!);
      expect(HP_PCT[d]! / HP_PCT[d - 1]!).toBeLessThanOrEqual(1.6);
    }
    for (let d = 1; d < 5; d++) expect(CNT_PCT[d]!).toBeGreaterThanOrEqual(CNT_PCT[d - 1]!);
  });

  it('monsters toughen with the mean power of the towers, a little less than the towers do', () => {
    const hp = (party: typeof parties.full) => engine.initial(1, party, emptyRun(3), 'en').hpPct;
    expect(hp(parties.starter)).toBe(100 + Math.floor((8 * PARTY_HP_PCT) / 100));
    expect(hp(parties.full)).toBe(100 + Math.floor((44 * PARTY_HP_PCT) / 100));
    expect(hp(parties.full)).toBeLessThan(144);
    expect(hp({ members: [] })).toBe(100);
  });

  // The bot builds a tower for every member it has; if a member made it worse, the support towers would be a trap.
  describe('removing a member never helps the bot on difficulty 3 by more than 10 points (3 of 30 seeds)', () => {
    let all: number | null = null;
    it.each(HABIT_IDS.map((h) => [h]))('without %s', { timeout: 20000 }, (habit) => {
      all ??= botWins(parties.full, 3, 30);
      const without = botWins({ members: parties.full.members.filter((m) => m.id !== habit) }, 3, 30);
      expect(without, `with all eight ${all} wins, without ${habit} ${without}`).toBeLessThanOrEqual(all + 3);
    });
  });
});

describe('difficulty 1 for a first-time player', () => {
  it('a naive strategy with the starter party (cycle the cards, never upgrade, never call) wins at least 45 of seeds 1 to 50', { timeout: 60000 }, () => {
    let wins = 0;
    for (let seed = 1; seed <= 50; seed++) if (playNaive(seed).result === 'won') wins++;
    expect(wins).toBeGreaterThanOrEqual(45);
  });

  it('the harder difficulties really are harder: more monster hit points and fewer Haven points', () => {
    const hp = [1, 2, 3, 4, 5].map((d) => HP_PCT[d - 1]!);
    expect([...hp].sort((a, b) => a - b)).toEqual(hp);
    expect([1, 2, 3, 4, 5].map((d) => start(1, emptyRun(d as 1 | 2 | 3 | 4 | 5)).havenMax)).toEqual([20, 15, 10, 8, 6]);
  });
});

describe('texts', () => {
  it('names every tower and monster in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      expect(Object.keys(strings[lang].towers)).toHaveLength(8);
      expect(Object.keys(strings[lang].monsters)).toHaveLength(10);
      expect(new Set(Object.values(strings[lang].towers).map((t) => t.letter)).size).toBe(8);
    }
  });

  it('the feed carries pre-localised parameters', () => {
    const fr = engine.initial(1, parties.full, runs.plain, 'fr');
    const s = act(fr, { type: 'place', pad: 0, member: 'outside' });
    expect(s.feed[0]).toMatchObject({ key: 'placed', params: { name: 'Wren', tower: 'Lanterne', pad: 1 } });
    const started = tick(fr, 340);
    expect(String(started.feed.find((l) => l.key === 'waveStart')!.params.monsters)).toMatch(/Amas de désordre x\d+/);
  });
});

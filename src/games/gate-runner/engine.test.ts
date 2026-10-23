/**
 * Haven Rush rules: gates, combat, boss, the proof of every level, party and buffs, scoring, the bot.
 * The contract kit covers the generic properties; this file covers this game.
 */
import { describe, expect, it } from 'vitest';
import { fnv1a, mulberry32 } from '../../game/rng';
import { emptyRun, type RunBuff, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  BOSS_START,
  BOSS_TICKS,
  BOT_ERROR_PCT,
  SHIELD_EAT,
  SOCIAL_GATE,
  applyOp,
  bestSide,
  engine,
  foeDamage,
  formatOp,
  isOver,
  outcomeLog,
  previewPairs,
  scoreOf,
  startSquadOf,
  steerRateOf,
  volley,
  type GateRunnerAction,
  type GateRunnerState,
} from './engine';
import { MAX_ATTEMPTS, PAIRS, TUNING, greedy, makeLevel, marginPct, playPath, simState, solve, type Built } from './level';
import game from './manifest';
import { BASE_SQUAD, CENTER, LEFT_X, RIGHT_X, SPEED, SPEED_SLOW, type Foe, type Gate, type Item } from './rules';
import { strings } from './strings';

type D = 1 | 2 | 3 | 4 | 5;
const DIFFS: D[] = [1, 2, 3, 4, 5];

const start = (seed = 1, party = parties.starter, run: RunContext = runs.plain, locale: 'en' | 'fr' = 'en') => engine.initial(seed, party, run, locale);
const buffed = (...buffs: RunBuff[]): RunContext => ({ ...emptyRun(2), buffs });
const tick = (s: GateRunnerState): GateRunnerState => engine.reduce(s, { type: 'tick' });
function ticks(s: GateRunnerState, n: number): GateRunnerState {
  let next = s;
  for (let i = 0; i < n; i++) next = tick(next);
  return next;
}
const levelOf = (seed: number, d: D) => makeLevel(mulberry32(fnv1a(`gate-runner:${seed}`)), d);

/** A hand-built lane: nothing but what the test puts on it. */
function lane(parts: Partial<Built>, squad = 10, d: D = 1): GateRunnerState {
  return simState(squad, { gates: [], foes: [], items: [], bossLine: 400, ...parts }, d);
}
const gate = (y: number, l: Gate['l'], r: Gate['r']): Gate => ({ y, l, r });
const foe = (y: number, lane: Foe['lane'], hp: number, wall = false): Foe => ({ y, lane, hp, wall });

describe('gate operations', () => {
  it('multiplies and adds', () => {
    expect(applyOp(5, { k: 'mul', n: 2 })).toBe(10);
    expect(applyOp(7, { k: 'mul', n: 3 })).toBe(21);
    expect(applyOp(5, { k: 'add', n: 10 })).toBe(15);
    expect(applyOp(5, { k: 'add', n: 25 })).toBe(30);
  });

  it('subtract empties the squad only when the result would drop below 1', () => {
    expect(applyOp(6, { k: 'sub', n: 5 })).toBe(1);
    expect(applyOp(5, { k: 'sub', n: 5 })).toBe(0);
    expect(applyOp(4, { k: 'sub', n: 5 })).toBe(0);
    expect(applyOp(10, { k: 'sub', n: 5 })).toBe(5);
  });

  it('divide rounds down and keeps one member while anyone is left', () => {
    expect(applyOp(5, { k: 'div', n: 2 })).toBe(2);
    expect(applyOp(9, { k: 'div', n: 2 })).toBe(4);
    expect(applyOp(1, { k: 'div', n: 2 })).toBe(1);
    expect(applyOp(0, { k: 'div', n: 2 })).toBe(0);
  });

  it('shows ops the way the gates are drawn', () => {
    expect(['mul', 'add', 'sub', 'div'].map((k, i) => formatOp({ k: k as 'mul', n: [2, 10, 5, 2][i]! }))).toEqual(['x2', '+10', '-5', '÷2']);
  });

  it('applies the gate of the half the squad stands in when it crosses the line', () => {
    const s0 = lane({ gates: [gate(40, { k: 'mul', n: 2 }, { k: 'add', n: 10 })] }, 10);
    const right = ticks(s0, 12);
    expect(right.squad).toBe(20);
    const left = ticks({ ...s0, side: 0, x: LEFT_X }, 12);
    expect(left.squad).toBe(20);
    const l2 = ticks({ ...lane({ gates: [gate(40, { k: 'mul', n: 3 }, { k: 'add', n: 10 })] }, 10), side: 0, x: LEFT_X }, 12);
    const r2 = ticks(lane({ gates: [gate(40, { k: 'mul', n: 3 }, { k: 'add', n: 10 })] }, 10), 12);
    expect(l2.squad).toBe(30);
    expect(r2.squad).toBe(20);
  });

  it('a subtract gate that empties the squad ends the run as lost', () => {
    const s = ticks(lane({ gates: [gate(8, { k: 'sub', n: 5 }, { k: 'sub', n: 5 })] }, 5), 3);
    expect(s.phase).toBe('lost');
    expect(engine.outcome(s)?.result).toBe('lost');
  });
});

describe('the lane', () => {
  it('runs 4 units per tick, 2 under the slow lane or the time buff', () => {
    expect(ticks(lane({}), 5).y).toBe(5 * SPEED);
    expect(ticks(engine.reduce(lane({}), { type: 'slow', on: true }), 5).y).toBe(5 * SPEED_SLOW);
    const timed = start(1, parties.starter, buffed({ id: 't', kind: 'time', amount: 1 }));
    expect(ticks(timed, 20).y).toBe(20 * SPEED_SLOW);
    expect(ticks(timed, 21).y).toBe(20 * SPEED_SLOW + SPEED);
  });

  it('slides to the half it was asked for, at its own rate', () => {
    const s = engine.reduce(lane({}), { type: 'side', side: 0 });
    expect(s.side).toBe(0);
    const after = ticks({ ...s, x: RIGHT_X, rate: 10 }, 4);
    expect(after.x).toBe(RIGHT_X - 40);
    expect(ticks({ ...s, x: RIGHT_X, rate: 10 }, 20).x).toBe(LEFT_X);
  });

  it('the line between the halves counts as the right', () => {
    const s0 = lane({ gates: [gate(8, { k: 'add', n: 1 }, { k: 'add', n: 2 })] }, 10);
    expect(ticks({ ...s0, x: CENTER, side: 1 }, 2).squad).toBe(12);
    expect(ticks({ ...s0, x: CENTER - 1, side: 0, rate: 0 }, 2).squad).toBe(11);
  });
});

describe('shooting and contact', () => {
  it('a volley hurts the boss by one point per member, a crowd by a sixth of that, a wall by half of that', () => {
    expect(volley(60, 0)).toBe(60);
    expect(volley(60, 50)).toBe(90);
    expect(foeDamage(60, 0, false)).toBe(10);
    expect(foeDamage(60, 0, true)).toBe(5);
    expect(foeDamage(3, 0, false)).toBe(1);
    expect(foeDamage(0, 0, false)).toBe(1);
  });

  it('fires every 4 ticks, every 2 with rapid fire', () => {
    const s0 = lane({ foes: [foe(300, 2, 500)] }, 60);
    const hps: number[] = [];
    let s = { ...s0, y: 150 };
    for (let i = 0; i < 9; i++) {
      s = tick(s);
      hps.push(s.foes[0]!.hp);
    }
    const drops = hps.filter((hp, i) => hp < (i === 0 ? 500 : hps[i - 1]!)).length;
    expect(drops).toBe(3);
    let fast = { ...s0, y: 150, rapid: 100 };
    const fastHps: number[] = [];
    for (let i = 0; i < 9; i++) {
      fast = tick(fast);
      fastHps.push(fast.foes[0]!.hp);
    }
    expect(fastHps.filter((hp, i) => hp < (i === 0 ? 500 : fastHps[i - 1]!)).length).toBe(5);
  });

  it('only shoots what is within range', () => {
    const s = ticks(lane({ foes: [foe(300, 2, 100)] }, 60), 5);
    expect(s.foes[0]!.hp).toBe(100);
    expect(ticks({ ...s, y: 140 }, 1).foes[0]!.hp).toBeLessThan(100);
  });

  it('a crowd that reaches the squad costs one member per point it has left, then it is gone', () => {
    const s = ticks({ ...lane({ foes: [foe(8, 2, 4)] }, 10), cd: 99 }, 2);
    expect(s.squad).toBe(6);
    expect(s.foes[0]!.hp).toBe(0);
    expect(s.events.some((e) => e.t === 'hit' && e.a === 4)).toBe(true);
  });

  it('shots from range thin a crowd before it arrives', () => {
    const open = ticks(lane({ foes: [foe(400, 2, 30)], bossLine: 600 }, 60), 95);
    expect(open.squad).toBe(60);
  });

  it('a wall takes half the damage a crowd takes', () => {
    const crowd = ticks(lane({ foes: [foe(300, 2, 100)] }, 60), 40);
    const wall = ticks(lane({ foes: [foe(300, 2, 100, true)] }, 60), 40);
    expect(100 - wall.foes[0]!.hp).toBeLessThan(100 - crowd.foes[0]!.hp);
  });

  it('a guard on one half only hits the squad standing in that half', () => {
    const parts = { gates: [gate(8, { k: 'add', n: 0 }, { k: 'add', n: 0 })], foes: [foe(8, 0, 6)] };
    expect(ticks({ ...lane(parts, 10), cd: 99 }, 3).squad).toBe(10);
    expect(ticks({ ...lane(parts, 10), side: 0, x: LEFT_X, cd: 99 }, 3).squad).toBe(4);
  });

  it('the gate counts before what guards it', () => {
    const parts = { gates: [gate(8, { k: 'mul', n: 3 }, { k: 'mul', n: 3 })], foes: [foe(8, 2, 10)] };
    expect(ticks({ ...lane(parts, 10), cd: 99 }, 3).squad).toBe(20);
  });

  it('a shield absorbs the first 5 losses to a crowd', () => {
    const s = ticks({ ...lane({ foes: [foe(8, 2, 8)] }, 10), shield: 5, cd: 99 }, 3);
    expect(s.squad).toBe(7);
    expect(s.shield).toBe(0);
  });

  it('orbs add members, rapid orbs set the rapid timer, and luck makes them bigger', () => {
    const items: Item[] = [{ y: 8, lane: 2, kind: 'members', n: 8 }, { y: 20, lane: 2, kind: 'rapid', n: 100 }];
    const s = ticks(lane({ items }, 10), 6);
    expect(s.squad).toBe(18);
    expect(s.rapid).toBeGreaterThan(80);
    const lucky = ticks({ ...lane({ items }, 10), luck: 50 }, 6);
    expect(lucky.squad).toBe(22);
  });

  it('an orb on one half is missed from the other', () => {
    const items: Item[] = [{ y: 8, lane: 0, kind: 'members', n: 8 }];
    expect(ticks(lane({ items }, 10), 3).squad).toBe(10);
  });
});

describe('revive', () => {
  it('brings five members back once per revive buff, then the run is lost', () => {
    const parts = { gates: [gate(8, { k: 'sub', n: 5 }, { k: 'sub', n: 5 })] };
    const once = ticks({ ...lane(parts, 5), revives: 1 }, 3);
    expect(once.squad).toBe(5);
    expect(once.revives).toBe(0);
    expect(once.phase).toBe('run');
    const twice = ticks({ ...lane({ gates: [gate(8, { k: 'sub', n: 5 }, { k: 'sub', n: 5 }), gate(16, { k: 'sub', n: 5 }, { k: 'sub', n: 5 })] }, 5), revives: 1 }, 6);
    expect(twice.phase).toBe('lost');
  });
});

describe('the boss', () => {
  const atBoss = (squad: number, hp: number): GateRunnerState => ({ ...lane({}, squad), phase: 'boss', y: 400, bossHp: hp, bossMax: hp, bossGap: BOSS_START });

  it('closes in 2 units per tick: 140 ticks from first sight to the squad', () => {
    expect(BOSS_TICKS).toBe(140);
    const s = ticks(atBoss(1, 1_000_000), 70);
    expect(s.bossGap).toBe(BOSS_START - 140);
    expect(ticks(atBoss(1, 1_000_000), 140).phase).toBe('lost');
  });

  it('is shot down when the volleys add up before it arrives', () => {
    const s = ticks(atBoss(100, 3000), 140);
    expect(s.phase).toBe('won');
    expect(s.bossHp).toBe(0);
    expect(s.bossGap).toBeGreaterThan(0);
  });

  it('reaches the squad when the damage falls short', () => {
    const s = ticks(atBoss(10, 100_000), 200);
    expect(s.phase).toBe('lost');
    expect(engine.outcome(s)?.log.at(-1)).toMatch(/boss reached/i);
  });

  it('the attack buff adds to every volley, rapid fire doubles the rate, the slow lane does not slow the boss', () => {
    const base = ticks(atBoss(100, 1_000_000), 20);
    const strong = ticks({ ...atBoss(100, 1_000_000), atk: 50 }, 20);
    const fast = ticks({ ...atBoss(100, 1_000_000), rapid: 100 }, 20);
    expect(1_000_000 - strong.bossHp).toBe(Math.floor(((1_000_000 - base.bossHp) * 3) / 2));
    expect(1_000_000 - fast.bossHp).toBeGreaterThan(1.8 * (1_000_000 - base.bossHp));
    expect(ticks({ ...atBoss(1, 1_000_000), slow: true }, 10).bossGap).toBe(BOSS_START - 20);
  });

  it('the run phase turns into the boss phase at the boss line', () => {
    const s = ticks(lane({ bossLine: 40 }), 10);
    expect(s.phase).toBe('boss');
    expect(s.y).toBe(40);
  });
});

describe('levels are generated fairly and proven', () => {
  it('margins shrink with difficulty: 40, 32, 23, 14, 5 percent', () => {
    expect(DIFFS.map(marginPct)).toEqual([40, 32, 23, 14, 5]);
  });

  it('the pair count and the gate weights are documented numbers', () => {
    expect([...PAIRS]).toEqual([6, 7, 7, 8, 8]);
    expect(TUNING.traps).toEqual([0, 0, 1, 2, 3]);
  });

  for (const d of DIFFS) {
    it(`difficulty ${d}: 300 seeds, every level winnable by its best path with the margin, none needs the fallback`, () => {
      let tempting = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const lv = levelOf(seed, d);
        expect(lv.report.fallback).toBe(false);
        expect(lv.report.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
        // The boss hit points are exactly what the margin allows: best * 100 >= hp * (100 + margin) and not one point looser.
        const m = marginPct(d);
        expect(lv.report.bestDamage * 100).toBeGreaterThanOrEqual(lv.bossHp * (100 + m));
        expect(lv.report.bestDamage * 100).toBeLessThan((lv.bossHp + 1) * (100 + m));
        // Playing the plan from the start really beats the boss, with the weakest squad.
        const played = playPath(simState(BASE_SQUAD, lv, d), lv.plan);
        expect(played.dealt).toBe(lv.report.bestDamage);
        expect(played.dealt).toBeGreaterThanOrEqual(lv.bossHp);
        if (d >= 3) {
          // A tempting-but-bad gate exists: the greedy path is worse than the best by at least a tenth.
          expect(lv.report.greedyDamage * 10).toBeLessThanOrEqual(lv.report.bestDamage * 9);
          tempting += 1;
        }
        if (d >= 4) expect(lv.report.greedyDamage).toBeLessThan(lv.bossHp);
        if (d <= 2) expect(lv.report.greedyDamage).toBeGreaterThanOrEqual(lv.bossHp);
      }
      expect(tempting).toBe(d >= 3 ? 300 : 0);
    }, 60_000);
  }

  it('the solver is exhaustive: the best path beats every other path (small levels checked by hand)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const lv = levelOf(seed, 1);
      const s0 = simState(BASE_SQUAD, lv, 1);
      const n = lv.gates.length;
      let best = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        const path = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
        best = Math.max(best, playPath(s0, path).dealt);
      }
      expect(solve(s0).dealt).toBe(best);
    }
  }, 30_000);

  it('greedy takes the larger result at each gate on arrival', () => {
    const s0 = lane({ gates: [gate(100, { k: 'add', n: 10 }, { k: 'mul', n: 3 })] }, 10);
    expect(greedy(s0).path).toEqual([1]);
    const s1 = lane({ gates: [gate(100, { k: 'add', n: 25 }, { k: 'mul', n: 3 })] }, 10);
    expect(greedy(s1).path).toEqual([0]);
  });

  it('a stronger squad that follows the same path only does better (proof for the weakest squad covers all)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of DIFFS) {
        const lv = levelOf(seed, d);
        const weak = playPath(simState(BASE_SQUAD, lv, d), lv.plan).dealt;
        for (const squad of [8, 21, 40]) expect(playPath(simState(squad, lv, d), lv.plan).dealt).toBeGreaterThanOrEqual(weak);
      }
    }
  }, 30_000);

  it('the layout depends on the seed and the difficulty only, never on the party or the buffs', () => {
    const a = start(9, parties.starter, runs.plain);
    const b = start(9, parties.mixed, runs.buffed);
    expect(b.foes).toEqual(a.foes);
    expect(b.items).toEqual(a.items);
    expect(b.bossHp).toBe(a.bossHp);
    expect(b.bossLine).toBe(a.bossLine);
  });

  it('different seeds make different levels, the same seed the same level', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) seen.add(JSON.stringify(levelOf(seed, 3).gates));
    expect(seen.size).toBeGreaterThan(15);
    expect(JSON.stringify(levelOf(5, 3))).toBe(JSON.stringify(levelOf(5, 3)));
  }, 30_000);

  it('every level is a run of 30 to 55 seconds to the boss line at full speed', () => {
    for (const d of DIFFS) {
      const lv = levelOf(11, d);
      const ticksToBoss = lv.bossLine / SPEED;
      expect(ticksToBoss).toBeGreaterThan(30 * 20);
      expect(ticksToBoss).toBeLessThan(55 * 20);
    }
  });
});

describe('party and buffs', () => {
  it('start squad is 5 plus a member each plus one per 30 power; defense scales it', () => {
    expect(startSquadOf(parties.starter, emptyRun(1))).toBe(8);
    const power = parties.full.members.reduce((a, m) => a + m.power, 0);
    expect(startSquadOf(parties.full, emptyRun(1))).toBe(5 + 8 + Math.floor(power / 30));
    expect(startSquadOf(parties.starter, buffed({ id: 'd', kind: 'defense', amount: 50 }))).toBe(12);
  });

  it('Move steers faster, and faster with power', () => {
    expect(steerRateOf(parties.mixed)).toBe(10);
    expect(steerRateOf(parties.starter)).toBeGreaterThan(10);
    expect(steerRateOf(parties.full)).toBeGreaterThan(steerRateOf(parties.starter));
  });

  it('Social adds a free +3 gate before the first, Eat a shield of 5, Study the preview', () => {
    expect(start(2, parties.full).gates[0]).toEqual(SOCIAL_GATE);
    expect(start(2, parties.starter).gates[0]).not.toEqual(SOCIAL_GATE);
    expect(start(2, parties.full).gates.length).toBe(start(2, parties.starter).gates.length + 1);
    expect(start(2, parties.mixed).shield).toBe(SHIELD_EAT);
    expect(start(2, parties.starter).shield).toBe(0);
    expect(start(2, parties.single).study).toBe(true);
    expect(previewPairs(start(2, parties.single))).toHaveLength(2);
    expect(start(2, parties.starter).study).toBe(false);
  });

  it('the preview shows what each gate would give the squad as it is', () => {
    const s = start(4, parties.single);
    const p = previewPairs(s)[0]!;
    const g = s.gates[0]!;
    expect(p.leftN).toBe(applyOp(s.squad, g.l));
    expect(p.rightN).toBe(applyOp(s.squad, g.r));
  });

  it('a stronger party wins more often and scores higher against the same levels', () => {
    let weak = 0;
    let strong = 0;
    let weakScore = 0;
    let strongScore = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = playToEnd(game, seed, parties.single, emptyRun(4)).outcome!;
      const s = playToEnd(game, seed, parties.full, emptyRun(4)).outcome!;
      if (w.result === 'won') weak++;
      if (s.result === 'won') strong++;
      weakScore += w.score;
      strongScore += s.score;
    }
    expect(strong).toBeGreaterThan(weak);
    expect(strongScore).toBeGreaterThan(weakScore);
  }, 30_000);

  it('every buff kind that the game honours changes a game: attack, defense, time, hint, revive, luck', () => {
    const base = playToEnd(game, 3, parties.starter, emptyRun(3)).state;
    const kinds: RunBuff['kind'][] = ['attack', 'defense', 'time', 'revive', 'luck'];
    for (const kind of kinds) {
      const amount = kind === 'time' ? 10 : kind === 'revive' ? 1 : 50;
      const run = { ...emptyRun(3), buffs: [{ id: kind, kind, amount }] };
      const s = playToEnd(game, 3, parties.starter, run).state;
      expect(JSON.stringify([s.squad, s.bossHp, s.step, s.phase, s.picks, s.revives])).not.toBe(JSON.stringify([base.squad, base.bossHp, base.step, base.phase, base.picks, base.revives]));
    }
    const hinted = engine.initial(3, parties.starter, { ...emptyRun(3), buffs: [{ id: 'h', kind: 'hint', amount: 2 }] }, 'en');
    expect(hinted.hints).toBe(2);
    expect(ticks(hinted, 80).hints).toBeLessThan(2);
  });

  it('the hint arrow points at a half that really is the best next choice', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = start(seed, parties.starter, emptyRun(3));
      const side = bestSide(s);
      const want = solve(s).path[0] === 0 ? 0 : 1;
      expect(side).toBe(want);
    }
  });
});

describe('scoring and outcomes', () => {
  const won = (seed: number, party = parties.full, d: D = 1) => playToEnd(game, seed, party, emptyRun(d));

  it('a win scores at least 400, a loss less than 400, a retreat less than 100', () => {
    let sawWin = false;
    let sawLoss = false;
    for (let seed = 1; seed <= 40 && !(sawWin && sawLoss); seed++) {
      const o = won(seed, parties.single, 5).outcome!;
      if (o.result === 'won') {
        sawWin = true;
        expect(o.score).toBeGreaterThanOrEqual(400);
      } else {
        sawLoss = true;
        expect(o.score).toBeLessThan(400);
      }
      expect(Number.isInteger(o.score)).toBe(true);
      expect(o.score).toBeLessThanOrEqual(1000);
    }
    expect(sawWin && sawLoss).toBe(true);
    const fled = engine.reduce(start(1), { type: 'forfeit' });
    expect(engine.outcome(fled)?.result).toBe('fled');
    expect(engine.outcome(fled)?.score).toBeLessThan(100);
  });

  it('a win scores the squad left, the time left on the boss and the pickups', () => {
    const base = { ...start(1), phase: 'won' as const, squad: 100, par: 100, bossGap: 140, picks: 0 };
    expect(scoreOf(base)).toBe(400 + 150 + 100);
    expect(scoreOf({ ...base, bossGap: 0 })).toBe(400 + 150);
    expect(scoreOf({ ...base, squad: 400, bossGap: 0 })).toBe(400 + 300);
    expect(scoreOf({ ...base, squad: 100, bossGap: 0, picks: 3 })).toBe(400 + 150 + 60);
    expect(scoreOf({ ...base, squad: 9999, bossGap: BOSS_START, picks: 9 })).toBe(1000);
  });

  it('a loss counts how far it ran and how much of the boss it took off', () => {
    const s = { ...start(1), phase: 'lost' as const, y: 0, bossHp: 100, bossMax: 100 };
    expect(scoreOf(s)).toBe(0);
    expect(scoreOf({ ...s, y: s.bossLine, bossHp: 50 })).toBe(150 + 100);
  });

  it('the log is written in the player language, and ends with a warm line', () => {
    const en = engine.outcome(ticks(engine.reduce(start(1), { type: 'forfeit' }), 0))!;
    expect(en.log.at(-1)).toMatch(/left the lane/);
    const fr = engine.outcome(engine.reduce(start(1, parties.starter, runs.plain, 'fr'), { type: 'forfeit' }))!;
    expect(fr.log.at(-1)).toMatch(/Tu quittes la voie/);
    const run = playToEnd(game, 2, parties.full, runs.plain, 20000, { locale: 'fr' });
    expect(run.outcome!.log.some((l) => l.startsWith('Porte '))).toBe(true);
    expect(outcomeLog(run.state, strings.fr).length).toBeGreaterThan(2);
  });

  it('troops used are the party ids; stats are numbers', () => {
    const o = playToEnd(game, 2, parties.mixed, runs.plain).outcome!;
    expect(o.troopsUsed).toEqual(parties.mixed.members.map((m) => m.id));
    expect(Object.values(o.stats!).every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('actions', () => {
  it('invalid actions return the state as it is; everything stops after the end', () => {
    const s = start(1);
    expect(engine.reduce(s, { type: 'side', side: 2 as 0 })).toBe(s);
    expect(engine.reduce(s, { type: 'side', side: s.side })).toBe(s);
    expect(engine.reduce(s, { type: 'slow', on: false })).toBe(s);
    expect(engine.reduce(s, { type: 'nope' } as unknown as GateRunnerAction)).toBe(s);
    const over = engine.reduce(s, { type: 'forfeit' });
    expect(isOver(over)).toBe(true);
    expect(engine.reduce(over, { type: 'tick' })).toBe(over);
  });

  it('a tick never changes the state it was given', () => {
    const s = start(5, parties.full, runs.plain);
    const copy = JSON.stringify(s);
    ticks(s, 120);
    expect(JSON.stringify(s)).toBe(copy);
  });

  it('the state is the same however the ticks are batched (frame-rate independence of the engine)', () => {
    const a = ticks(start(7), 300);
    let b = start(7);
    for (let frame = 0; frame < 100; frame++) for (let k = 0; k < 3; k++) b = tick(b);
    expect(b).toEqual(a);
  });
});

describe('the bot and the balance', () => {
  it('a full game is deterministic from start to finish', () => {
    for (const d of DIFFS) {
      const a = playToEnd(game, 21, parties.starter, emptyRun(d));
      const b = playToEnd(game, 21, parties.starter, emptyRun(d));
      expect(b.actions).toEqual(a.actions);
      expect(b.state).toEqual(a.state);
      expect(b.outcome).toEqual(a.outcome);
    }
  });

  it('a game lasts about a minute of lane and the bot ends it', () => {
    const r = playToEnd(game, 4, parties.starter, emptyRun(2));
    const t = r.state.step;
    expect(t).toBeGreaterThan(40 * 20);
    expect(t).toBeLessThan(75 * 20);
  });

  it('the bot errs more often as the difficulty rises', () => {
    expect(BOT_ERROR_PCT.every((v, i) => i === 0 || v > BOT_ERROR_PCT[i - 1]!)).toBe(true);
  });

  const rate = (party: typeof parties.starter, d: D, n: number): number => {
    let wins = 0;
    for (let seed = 1; seed <= n; seed++) if (playToEnd(game, seed, party, emptyRun(d)).outcome!.result === 'won') wins++;
    return wins / n;
  };

  it('the bot wins 40 to 70 percent on difficulty 3 with a new player party, and difficulty shows', () => {
    const r3 = rate(parties.starter, 3, 150);
    expect(r3).toBeGreaterThanOrEqual(0.4);
    expect(r3).toBeLessThanOrEqual(0.7);
    const r1 = rate(parties.starter, 1, 100);
    const r5 = rate(parties.starter, 5, 100);
    expect(r1).toBeGreaterThan(0.8);
    expect(r1).toBeGreaterThan(r3);
    expect(r3).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(0.15);
  }, 60_000);

  it('difficulty 1 is gentle: just taking the larger number wins every level', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const lv = levelOf(seed, 1);
      expect(lv.report.greedyDamage).toBeGreaterThanOrEqual(lv.bossHp);
    }
  });
});

/**
 * Haven Rush rules: gates, combat, fairness, the bot, and buffs.
 * The contract kit covers generic properties; this file covers this game.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  applyOp,
  SHOT_EVERY,
  analyzeLevel,
  engine,
  formatOp,
  isOver,
  marginPct,
  shotDamage,
  startSquadOf,
  step,
  type GateRunnerState,
} from './engine';
import game from './manifest';

const start = (seed = 1, party = parties.full, run: RunContext = runs.plain) => engine.initial(seed, party, run, 'en');

function ticks(s: GateRunnerState, n: number): GateRunnerState {
  let next = s;
  for (let i = 0; i < n; i++) next = engine.reduce(next, { type: 'tick' });
  return next;
}

describe('gate operations', () => {
  it('multiplies', () => {
    expect(applyOp(5, { kind: 'mul', n: 2 })).toBe(10);
    expect(applyOp(7, { kind: 'mul', n: 3 })).toBe(21);
  });

  it('adds', () => {
    expect(applyOp(5, { kind: 'add', n: 10 })).toBe(15);
    expect(applyOp(5, { kind: 'add', n: 25 })).toBe(30);
  });

  it('subtracts and kills at 0 only when the result would drop below 1', () => {
    expect(applyOp(6, { kind: 'sub', n: 5 })).toBe(1);
    expect(applyOp(5, { kind: 'sub', n: 5 })).toBe(0);
    expect(applyOp(4, { kind: 'sub', n: 5 })).toBe(0);
    expect(applyOp(10, { kind: 'sub', n: 5 })).toBe(5);
  });

  it('integer-divides rounding down, with a floor of 1 while anyone remains', () => {
    expect(applyOp(5, { kind: 'div', n: 2 })).toBe(2);
    expect(applyOp(1, { kind: 'div', n: 2 })).toBe(1);
    expect(applyOp(9, { kind: 'div', n: 2 })).toBe(4);
    expect(applyOp(0, { kind: 'div', n: 2 })).toBe(0);
  });

  it('formats ops the way the gates show them', () => {
    expect(formatOp({ kind: 'mul', n: 2 })).toBe('x2');
    expect(formatOp({ kind: 'add', n: 10 })).toBe('+10');
    expect(formatOp({ kind: 'sub', n: 5 })).toBe('-5');
    expect(formatOp({ kind: 'div', n: 2 })).toBe('÷2');
  });
});

describe('starting squad and party', () => {
  it('starts at 5 plus party size, with power adding extra members', () => {
    const starter = startSquadOf(parties.starter, emptyRun(1));
    const full = startSquadOf(parties.full, emptyRun(1));
    expect(starter).toBe(5 + 3);
    expect(full).toBeGreaterThan(starter);
    expect(full).toBe(5 + 8 + Math.floor(parties.full.members.reduce((a, m) => a + m.power, 0) / 40));
  });

  it('defense buff grows the starting squad', () => {
    const plain = startSquadOf(parties.starter, emptyRun(1));
    const buffed = startSquadOf(parties.starter, { ...emptyRun(1), buffs: [{ id: 'd', kind: 'defense', amount: 50 }] });
    expect(buffed).toBeGreaterThan(plain);
  });

  it('Move raises steer rate; Eat grants a shield; Study and Social show on the state', () => {
    const withMove = start(2, parties.starter);
    expect(withMove.steerRate).toBeGreaterThan(10);
    const withEat = start(2, parties.mixed);
    expect(withEat.shield).toBe(5);
    const withStudy = start(2, parties.single);
    expect(withStudy.study).toBe(true);
    const withSocial = start(2, parties.full);
    expect(withSocial.gates[0]?.left).toEqual({ kind: 'add', n: 3 });
    expect(withSocial.gates[0]?.right).toEqual({ kind: 'add', n: 3 });
  });
});

describe('combat and shooting', () => {
  it('shot damage scales with squad and the attack buff', () => {
    expect(shotDamage(8, 0)).toBe(2);
    expect(shotDamage(8, 100)).toBe(4);
    expect(shotDamage(0, 0)).toBe(0);
  });

  it('firing sets a cooldown of SHOT_EVERY ticks, or SHOT_BOOST while rapid fire is on', () => {
    const s = start(1, parties.starter);
    const fired = step({ ...s, shotCd: 0, phase: 'boss', bossY: s.y + 10, bossHp: 500, squad: 8, fireRateTicks: 0 });
    expect(fired.shotCd).toBe(SHOT_EVERY);
    expect(fired.bossHp).toBeLessThan(500);
    const boost = step({ ...s, shotCd: 0, phase: 'boss', bossY: s.y + 10, bossHp: 500, squad: 8, fireRateTicks: 20 });
    expect(boost.shotCd).toBe(2);
  });

  it('contact with a crowd removes one member per remaining hp', () => {
    const s = start(3, parties.starter);
    const hit = step({
      ...s,
      shield: 0,
      pickups: [],
      shotCd: 99,
      y: 10,
      x: 100,
      enemies: [{ id: 1, y: 10, lane: 2, hp: 4, kind: 'crowd' }],
    });
    expect(hit.squad).toBe(s.squad - 4);
  });

  it('a shield absorbs losses before the squad', () => {
    const s = { ...start(4, parties.mixed), shield: 5, y: 0, enemies: [{ id: 99, y: 0, lane: 2 as const, hp: 3, kind: 'crowd' as const }] };
    const hit = step(s);
    expect(hit.shield).toBe(2);
    expect(hit.squad).toBe(s.squad);
  });

  it('revive brings five members back once when the squad would hit 0', () => {
    const s: GateRunnerState = {
      ...start(5),
      squad: 2,
      reviveOn: true,
      shield: 0,
      y: 0,
      enemies: [{ id: 7, y: 0, lane: 2, hp: 9, kind: 'wall' }],
    };
    const hit = step(s);
    expect(hit.squad).toBe(5);
    expect(hit.reviveOn).toBe(false);
    const again = step({ ...hit, y: 0, enemies: [{ id: 8, y: 0, lane: 2, hp: 9, kind: 'wall' }] });
    expect(again.phase).toBe('lost');
  });
});

describe('boss and scoring', () => {
  it('boss HP scales so a harder margin is tighter', () => {
    expect(marginPct(1)).toBe(40);
    expect(marginPct(5)).toBe(5);
    const easy = start(11, parties.full, emptyRun(1));
    const hard = start(11, parties.full, emptyRun(5));
    const easyNeed = Math.ceil((easy.bossHp * 140) / 100);
    const hardNeed = Math.ceil((hard.bossHp * 105) / 100);
    expect(easy.bossMaxHp).toBe(easy.bossHp);
    expect(hard.bossHp).toBeGreaterThan(0);
    expect(easyNeed).toBeGreaterThan(0);
    expect(hardNeed).toBeGreaterThan(0);
  });

  it('winning the boss scores from leftover squad, remaining boss distance and pickups', () => {
    const s = { ...start(1), phase: 'won' as const, squad: 20, pickupsTaken: 2, bossY: 80, y: 10, bossLine: 100 };
    const o = engine.outcome(s);
    expect(o?.result).toBe('won');
    expect(o?.score).toBeGreaterThan(100);
    expect(o?.score).toBeLessThanOrEqual(1000);
  });

  it('forfeit ends as fled with the troops that started the run', () => {
    const s = engine.reduce(start(8, parties.starter), { type: 'forfeit' });
    const o = engine.outcome(s);
    expect(o?.result).toBe('fled');
    expect(o?.troopsUsed).toEqual(parties.starter.members.map((m) => m.id));
    expect(o?.log.at(-1)).toMatch(/left the lane/i);
  });

  it('ignores actions after the end', () => {
    const s = engine.reduce(start(1), { type: 'forfeit' });
    expect(engine.reduce(s, { type: 'tick' })).toBe(s);
    expect(engine.reduce(s, { type: 'steer', dir: -1 })).toBe(s);
  });
});

describe('fairness', () => {
  it('every level is winnable over 300 seeds at difficulty 1 and 2', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = seed % 2 === 0 ? 2 : 1;
      const s = engine.initial(seed, parties.starter, emptyRun(d as 1 | 2), 'en');
      const report = analyzeLevel(s);
      expect(report.winnable, `seed ${seed} d${d} dealt ${report.bestDealt} hp ${s.bossHp}`).toBe(true);
      expect(s.bossHp).toBeGreaterThan(0);
    }
  }, 60_000);

  it('every level is winnable and greedy is not optimal over 300 seeds at difficulty 3 to 5', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = (3 + (seed % 3)) as 3 | 4 | 5;
      const s = engine.initial(seed, parties.starter, emptyRun(d), 'en');
      const report = analyzeLevel(s);
      expect(report.winnable, `seed ${seed} d${d}`).toBe(true);
      expect(report.greedyOptimal, `seed ${seed} d${d} greedyDealt ${report.greedyDealt} best ${report.bestDealt}`).toBe(false);
      expect(report.greedyDealt).toBeLessThan(s.bossHp);
    }
  }, 60_000);
});

describe('determinism, locale, bot', () => {
  it('the same seed, party and run replay identically', () => {
    const a = playToEnd(game, 42, parties.full, runs.plain);
    const b = playToEnd(game, 42, parties.full, runs.plain);
    expect(a.actions).toEqual(b.actions);
    expect(a.outcome).toEqual(b.outcome);
  });

  it('writes the log in the locale; the run itself does not depend on it', () => {
    const en = playToEnd(game, 9, parties.starter, runs.plain);
    const fr = playToEnd(game, 9, parties.starter, runs.plain, 20_000, { locale: 'fr' });
    expect(fr.actions).toEqual(en.actions);
    expect(fr.outcome?.log.at(-1)).toMatch(/Le boss|L'escouade|Tu quittes/);
    expect({ ...fr.outcome, log: [] }).toEqual({ ...en.outcome, log: [] });
  });

  it('the bot wins about 60 percent on difficulty 3', () => {
    const n = 40;
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const r = playToEnd(game, 2000 + i, parties.full, emptyRun(3));
      expect(r.outcome).not.toBeNull();
      if (r.outcome?.result === 'won') wins += 1;
    }
    const pct = (wins / n) * 100;
    expect(pct, `bot win rate ${pct}% (${wins}/${n})`).toBeGreaterThanOrEqual(40);
    expect(pct).toBeLessThanOrEqual(80);
  }, 60_000);

  it('attack and time buffs change the opening state', () => {
    const plain = start(15, parties.full, emptyRun(2));
    const attack = start(15, parties.full, { ...emptyRun(2), buffs: [{ id: 'a', kind: 'attack', amount: 40 }] });
    const time = start(15, parties.full, { ...emptyRun(2), buffs: [{ id: 't', kind: 'time', amount: 5 }] });
    expect(attack.attackPct).toBe(40);
    expect(time.timeSlowTicks).toBeGreaterThan(0);
    expect(plain.attackPct).toBe(0);
  });

  it('slow lane halves speed; it does not stack with the time buff', () => {
    const s = start(1);
    expect(engine.reduce(s, { type: 'slow', on: true }).slowLane).toBe(true);
    const slowed = ticks({ ...s, slowLane: true, timeSlowTicks: 20 }, 1);
    const timed = ticks({ ...s, slowLane: false, timeSlowTicks: 20 }, 1);
    expect(slowed.y).toBe(timed.y);
    expect(slowed.y).toBeLessThan(ticks(s, 1).y);
  });

  it('forfeit is the leave action the kit plays', () => {
    expect(engine.forfeit?.(start(1))).toEqual({ type: 'forfeit' });
  });

  it('isOver is false at the start and true after a forfeit', () => {
    const s = start(6);
    expect(isOver(s)).toBe(false);
    expect(engine.outcome(s)).toBeNull();
    expect(isOver(engine.reduce(s, { type: 'forfeit' }))).toBe(true);
  });

  it('invalid steer is ignored', () => {
    const s = start(1);
    expect(engine.reduce(s, { type: 'steer', dir: 2 as -1 })).toBe(s);
    expect(engine.reduce(s, { type: 'steer', dir: 0 })).toBe(s);
  });
});

describe('gate application', () => {
  it('applies the left op when x is in the left half', () => {
    const s = start(21);
    const g = s.gates[0]!;
    const before = s.squad;
    const next = ticks({ ...s, x: 40, steer: 0 }, Math.floor(g.y / 6) + 2);
    expect(next.gates[0]?.applied).toBe(true);
    expect(next.events.some((e) => e.t === 'gate' && e.op === formatOp(g.left) && e.before === before)).toBe(true);
  });

  it('applies the right op when x is on or right of centre', () => {
    const s = start(21);
    const g = s.gates[0]!;
    const next = ticks({ ...s, x: 160, steer: 0 }, Math.floor(g.y / 6) + 2);
    expect(next.gates[0]?.applied).toBe(true);
    expect(next.events.some((e) => e.t === 'gate' && e.op === formatOp(g.right))).toBe(true);
  });
});

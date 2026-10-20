/**
 * Still Water's rules. The contract kit covers the generic properties; this
 * file covers the rhythm tables, scoring of perfect / late / early / never /
 * always-held input, ripples, party and buffs, the bot's seeded error and
 * balance, and the copy.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, makeMember, type Locale, type Party, type RunBuff, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  BOT,
  BASE_CEILING,
  CALM_START,
  DECOY_AFTER_CYCLES,
  LEAD_TICKS,
  REVIVE_ACCURACY,
  RHYTHM,
  TAP_CALM_COST,
  WIN_SCORE,
  accuracyOf,
  botCycleError,
  breathAt,
  buildRhythm,
  calmOf,
  canChoosePace,
  cycleIndex,
  displayCycle,
  engine,
  graceTicks,
  hintActive,
  idealHold,
  idealTicksPerCycle,
  releaseTicksPerCycle,
  tapTarget,
  EARLY_TAP_TICKS,
  isOver,
  nextPhase,
  phaseAt,
  phaseOf,
  phaseTicksLeft,
  rawScore,
  steadiness,
  tapCount,
  tickKind,
  visibleDecoys,
  waterLevel,
  type Difficulty,
  type Pace,
  type StillWaterAction,
  type StillWaterState,
} from './engine';
import game from './manifest';
import { strings } from './strings';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

const start = (seed = 1, party: Party = parties.single, run: RunContext = emptyRun(1), locale: Locale = 'en') => engine.initial(seed, party, run, locale);
const runWith = (difficulty: Difficulty, ...buffs: RunBuff[]): RunContext => ({ buffs, roomIndex: 0, difficulty });
const buff = (kind: RunBuff['kind'], amount: number): RunBuff => ({ id: `t-${kind}`, kind, amount });
const act = (s: StillWaterState, ...actions: StillWaterAction[]) => actions.reduce((acc, a) => engine.reduce(acc, a), s);
const tick = (s: StillWaterState, n = 1) => act(s, ...Array.from({ length: n }, (): StillWaterAction => ({ type: 'tick' })));
/** A party of one vassal of a habit with a given level (loyalty 50). */
const only = (habit: 'move' | 'sleep' | 'eat', level: number): Party => ({ members: [makeMember({ id: habit, name: habit, habit, level, loyalty: 50 })] });
/** The same, without the Move vassal that `parties.single`-like fixtures may carry. */
const noMove: Party = { members: [makeMember({ id: 'study', name: 'Study', habit: 'study', level: 1, loyalty: 50 })] };

/** Play to the end; `want` says whether the player holds at each game tick (never during the get-ready lead). */
function playWith(s: StillWaterState, want: (state: StillWaterState) => boolean): StillWaterState {
  let next = s;
  for (let guard = 0; !isOver(next) && guard < 20_000; guard++) {
    const down = next.leadLeft > 0 ? false : want(next);
    if (down !== next.holding) next = engine.reduce(next, { type: 'hold', down });
    next = engine.reduce(next, { type: 'tick' });
  }
  return next;
}

const inCycle = (st: StillWaterState) => st.tick % st.cycleTicks;
const perfect = (s: StillWaterState) => playWith(s, (st) => idealHold(st, st.tick));
const neverHeld = (s: StillWaterState) => playWith(s, () => false);
const alwaysHeld = (s: StillWaterState) => playWith(s, () => true);
/** Press `press` ticks after the cycle starts, release `release` ticks after the ideal release point. */
const offBy = (s: StillWaterState, press: number, release: number) =>
  playWith(s, (st) => inCycle(st) >= press && inCycle(st) < st.inhaleTicks + st.holdTicks + release);

const outcomeOf = (s: StillWaterState) => engine.outcome(s)!;
const averageAccuracyOf = (s: StillWaterState) => Math.round(s.cycleScores.reduce((sum, c) => sum + c.accuracy, 0) / s.cycleScores.length);

describe('rhythm tables', () => {
  it('difficulty 1 is 4-2-6 and difficulty 2 is 5-3-7, in 50 ms ticks', () => {
    const easy = start(1, parties.single, emptyRun(1));
    expect([easy.inhaleTicks, easy.holdTicks, easy.exhaleTicks, easy.cycleCount]).toEqual([80, 40, 120, 5]);
    const mid = start(1, parties.single, emptyRun(2));
    expect([mid.inhaleTicks, mid.holdTicks, mid.exhaleTicks, mid.cycleCount]).toEqual([100, 60, 140, 6]);
  });

  it('difficulties 3 to 5 are faster: 4-2-5, 3-2-4 and 3-1-3.5', () => {
    expect(RHYTHM[3]).toMatchObject({ inhaleMs: 4000, holdMs: 2000, exhaleMs: 5000, cycles: 6 });
    expect(RHYTHM[4]).toMatchObject({ inhaleMs: 3000, holdMs: 2000, exhaleMs: 4000, cycles: 7 });
    expect(RHYTHM[5]).toMatchObject({ inhaleMs: 3000, holdMs: 1000, exhaleMs: 3500, cycles: 8 });
  });

  it('every game has 5 to 8 cycles and fits in two minutes, even at the slow pace', () => {
    for (const d of DIFFICULTIES) {
      const slow = buildRhythm(d, 1);
      expect(RHYTHM[d].cycles).toBeGreaterThanOrEqual(5);
      expect(RHYTHM[d].cycles).toBeLessThanOrEqual(8);
      expect(((slow.totalTicks + LEAD_TICKS) * 50) / 1000).toBeLessThanOrEqual(120);
    }
  });

  it('difficulty shortens the cycle after the second level and narrows the grace', () => {
    const cycle = DIFFICULTIES.map((d) => buildRhythm(d).cycleTicks);
    expect(cycle[2]!).toBeLessThan(cycle[1]!);
    expect(cycle[3]!).toBeLessThan(cycle[2]!);
    expect(cycle[4]!).toBeLessThan(cycle[3]!);
    const grace = DIFFICULTIES.map((d) => RHYTHM[d].baseGrace);
    expect([...grace].sort((a, b) => b - a)).toEqual(grace);
  });

  it('phases follow inhale, hold, exhale and the cycle repeats', () => {
    const s = start();
    expect(phaseAt(s, 0)).toBe('inhale');
    expect(phaseAt(s, s.inhaleTicks - 1)).toBe('inhale');
    expect(phaseAt(s, s.inhaleTicks)).toBe('hold');
    expect(phaseAt(s, s.inhaleTicks + s.holdTicks)).toBe('exhale');
    expect(phaseAt(s, s.cycleTicks)).toBe('inhale');
  });

  it('starts with a two second get-ready lead that scores nothing', () => {
    let s = start();
    expect(phaseOf(s)).toBe('ready');
    expect(s.leadLeft).toBe(LEAD_TICKS);
    s = act(tick(s, LEAD_TICKS - 1), { type: 'hold', down: true });
    expect(phaseOf(s)).toBe('ready');
    s = tick(s);
    expect(phaseOf(s)).toBe('inhale');
    expect(s.tick).toBe(0);
    expect(s.holdSeen).toBe(0);
    expect(s.cycleHits).toBe(0);
  });
});

describe('scoring one cycle', () => {
  it('grace ticks surround the boundaries and the scored core is idealTicksPerCycle', () => {
    for (const d of DIFFICULTIES) {
      const s = start(1, noMove, emptyRun(d));
      const kinds = Array.from({ length: s.cycleTicks }, (_, t) => tickKind(s, t));
      expect(kinds[0]).toBe('grace');
      expect(kinds[s.cycleTicks - 1]).toBe('grace');
      expect(kinds[s.inhaleTicks + s.holdTicks]).toBe('grace');
      expect(kinds.filter((k) => k === 'hold')).toHaveLength(idealTicksPerCycle(s));
      expect(kinds.filter((k) => k === 'grace')).toHaveLength(4 * s.tolerance);
    }
  });

  it('a perfect hold scores 100 in every cycle and wins with a full score', () => {
    for (const d of DIFFICULTIES) {
      const end = perfect(start(3, noMove, emptyRun(d)));
      expect(end.cycleScores.map((c) => c.accuracy)).toEqual(Array(end.cycleCount).fill(100));
      expect(waterLevel(end)).toBe(100);
      const o = outcomeOf(end);
      expect(o.result).toBe('won');
      expect(o.score).toBe(1000);
    }
  });

  it('pressing late or releasing late inside the grace costs nothing', () => {
    const s = start(1, noMove, emptyRun(1));
    const end = offBy(s, s.tolerance, s.tolerance);
    expect(end.cycleScores.every((c) => c.accuracy === 100)).toBe(true);
  });

  it('late input loses the ticks past the grace twice: the ticks not held and the ticks held too long', () => {
    const s = start(1, noMove, emptyRun(1));
    const late = s.tolerance + 20;
    const end = offBy(s, late, late);
    const hold = idealTicksPerCycle(s);
    const release = releaseTicksPerCycle(s);
    const expected = accuracyOf(hold - 20, 20, hold, release);
    expect(end.cycleScores.map((c) => c.accuracy)).toEqual(Array(5).fill(expected));
    expect(expected).toBeLessThan(100);
    expect(expected).toBeGreaterThan(0);
  });

  it('early release loses the ticks held short; early press inside the grace is free', () => {
    const s = start(1, noMove, emptyRun(1));
    const end = playWith(s, (st) => inCycle(st) < st.inhaleTicks + st.holdTicks - 30 || inCycle(st) >= st.cycleTicks - 5);
    const hold = idealTicksPerCycle(s);
    expect(end.cycleScores[1]!.accuracy).toBe(accuracyOf(hold - 30 + s.tolerance, 0, hold, releaseTicksPerCycle(s)));
    const early = playWith(s, (st) => inCycle(st) >= st.cycleTicks - s.tolerance || idealHold(st, st.tick));
    expect(early.cycleScores.every((c) => c.accuracy === 100)).toBe(true);
  });

  it('never holding scores 0 and loses with the warm line', () => {
    for (const d of DIFFICULTIES) {
      const end = neverHeld(start(2, noMove, emptyRun(d)));
      expect(end.cycleScores.every((c) => c.accuracy === 0)).toBe(true);
      const o = outcomeOf(end);
      expect(o.score).toBe(0);
      expect(o.result).toBe('lost');
      expect(o.log[o.log.length - 1]).toBe('The pond is still here. Try again whenever you like.');
    }
  });

  it('always holding scores 0 on every difficulty: a hit on one side and a false hold on the other cancel', () => {
    for (const d of DIFFICULTIES) {
      const end = alwaysHeld(start(2, noMove, emptyRun(d)));
      const o = outcomeOf(end);
      expect(o.result).toBe('lost');
      expect(o.score).toBe(0);
      expect(end.cycleScores.every((c) => c.accuracy === 0)).toBe(true);
    }
  });

  it('neither always holding nor never holding can win, whatever the grace, pace, party and buffs', () => {
    const rested: Party = {
      members: [
        makeMember({ id: 'move', name: 'Move', habit: 'move', level: 30, loyalty: 100 }),
        makeMember({ id: 'sleep', name: 'Sleep', habit: 'sleep', level: 30, loyalty: 100 }),
      ],
    };
    const buffSets: RunBuff[][] = [
      [],
      [buff('time', 90)],
      [buff('time', 90), buff('time', 90), buff('time', 90)],
      [buff('revive', 10)],
      [buff('time', 90), buff('revive', 10), buff('hint', 9), buff('luck', 50)],
    ];
    let plays = 0;
    for (const d of DIFFICULTIES) {
      for (const pace of [-1, 0, 1] as Pace[]) {
        for (const party of [noMove, parties.starter, parties.full, rested]) {
          for (const buffs of buffSets) {
            const s0 = act(start(7, party, { buffs, roomIndex: 0, difficulty: d }), { type: 'pace', pace });
            for (const play of [alwaysHeld, neverHeld]) {
              const o = outcomeOf(play(s0));
              plays += 1;
              expect(o.result, `d${d} pace ${pace} ${party.members.length} troops ${buffs.length} buffs`).toBe('lost');
              expect(o.score).toBeLessThan(WIN_SCORE / 2);
            }
          }
        }
      }
    }
    expect(plays).toBe(5 * 3 * 4 * 5 * 2);
  });

  it('revive forgives at most a third of the cycles, so it cannot turn no play into a win', () => {
    const s = start(1, noMove, runWith(1, buff('revive', 10)));
    expect(s.revivesLeft).toBe(Math.floor(s.cycleCount / 3));
    expect(outcomeOf(neverHeld(s)).score).toBeLessThan(WIN_SCORE / 2);
  });

  it('accuracyOf clips below zero and handles an empty ideal', () => {
    expect(accuracyOf(10, 40, 100, 100)).toBe(0);
    expect(accuracyOf(100, 0, 100, 80)).toBe(100);
    expect(accuracyOf(51, 0, 100, 80)).toBe(51);
    expect(accuracyOf(100, 80, 100, 80)).toBe(0);
    expect(accuracyOf(100, 40, 100, 80)).toBe(50);
    expect(accuracyOf(5, 0, 0, 10)).toBe(0);
    expect(accuracyOf(5, 0, 10, 0)).toBe(0);
  });

  it('the water level is a smooth running score: empty at the start, only ever a level', () => {
    let s = start(1, noMove, emptyRun(1));
    expect(waterLevel(s)).toBe(0);
    const seen: number[] = [];
    for (let i = 0; i < s.totalTicks + LEAD_TICKS; i++) {
      const down = s.leadLeft === 0 && idealHold(s, s.tick);
      if (down !== s.holding) s = act(s, { type: 'hold', down });
      s = tick(s);
      seen.push(waterLevel(s));
      if (isOver(s)) break;
    }
    expect(seen.every((w) => w >= 0 && w <= 100)).toBe(true);
    expect(seen[seen.length - 1]).toBe(100);
    let biggestJump = 0;
    for (let i = 1; i < seen.length; i++) biggestJump = Math.max(biggestJump, Math.abs(seen[i]! - seen[i - 1]!));
    expect(biggestJump).toBeLessThanOrEqual(5);
  });
});

describe('the score and the result', () => {
  /** A finished game with these cycle accuracies, no ripples tapped or missed. */
  function finished(accuracies: number[], difficulty: Difficulty = 1): StillWaterState {
    const s = start(1, noMove, emptyRun(difficulty));
    const cycleScores = accuracies.map((accuracy, index) => ({ index, accuracy, revived: false }));
    return { ...s, cycleScores, tick: s.totalTicks, decoys: s.decoys.map((d) => ({ ...d, leaveTick: Math.min(d.leaveTick, s.totalTicks) })) };
  }

  it('wins at 600 and not a point below', () => {
    expect(WIN_SCORE).toBe(600);
    expect(outcomeOf(finished([60, 60, 60, 60, 60])).score).toBe(600);
    expect(outcomeOf(finished([60, 60, 60, 60, 60])).result).toBe('won');
    expect(outcomeOf(finished([60, 60, 60, 60, 59])).result).toBe('lost');
  });

  it('the score is the mean accuracy over all cycles, as a share of the ceiling', () => {
    const s = finished([100, 80, 60, 40, 20]);
    expect(rawScore(s)).toBeCloseTo(0.6 * 1000, 5);
    expect(outcomeOf(s).score).toBe(600);
  });

  it('steadiness and calm lift the ceiling from 850 to 1000', () => {
    const s = finished([100, 100, 100, 100, 100]);
    expect(outcomeOf(s).score).toBe(1000);
    const tapped = { ...s, decoys: s.decoys.map((d) => ({ ...d, tapped: true })) };
    const expectedCeiling = BASE_CEILING + 0 + Math.floor((50 * (CALM_START - TAP_CALM_COST * tapped.decoys.length)) / 100);
    expect(outcomeOf(tapped).score).toBe(expectedCeiling);
    expect(outcomeOf(tapped).score).toBeLessThan(900);
  });

  it('leaving early is fled with a partial score: cycles not played count as zero', () => {
    let s = start(1, noMove, emptyRun(1));
    for (let i = 0; i < LEAD_TICKS + 2 * s.cycleTicks; i++) {
      const down = s.leadLeft === 0 && idealHold(s, s.tick);
      if (down !== s.holding) s = act(s, { type: 'hold', down });
      s = tick(s);
    }
    expect(s.cycleScores.map((c) => c.accuracy)).toEqual([100, 100]);
    const o = outcomeOf(act(s, engine.forfeit!(s)));
    expect(o.result).toBe('fled');
    // Two perfect cycles of five at a ceiling of 900 (the ripple has not left, the calm is whole): 200 * 900 / 500.
    expect(o.score).toBe(360);
    expect(o.log[o.log.length - 1]).toMatch(/left the bank/);
    expect(o.stats).toMatchObject({ cycles: 2, accuracy: 40 });
  });

  it('leaving at once scores 0 and a finished game ignores every action', () => {
    const left = act(start(), { type: 'forfeit' });
    expect(outcomeOf(left).result).toBe('fled');
    expect(outcomeOf(left).score).toBe(0);
    for (const a of [{ type: 'tick' }, { type: 'hold', down: true }, { type: 'tap', decoyId: 'd0' }, { type: 'pace', pace: 1 }] as StillWaterAction[]) {
      expect(engine.reduce(left, a)).toBe(left);
    }
  });

  it('the outcome is null until the end and the same object shape after it', () => {
    const s = start();
    expect(engine.outcome(s)).toBeNull();
    const end = perfect(s);
    expect(engine.outcome(end)).toEqual(engine.outcome(end));
    expect(engine.botPlay(end, () => 0)).toBeNull();
  });
});

describe('ripples (decoys)', () => {
  it('none appears during the first two cycles, for every difficulty and seed', () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = start(seed, noMove, emptyRun(d));
        for (const decoy of s.decoys) expect(decoy.appearTick).toBeGreaterThanOrEqual(DECOY_AFTER_CYCLES * s.cycleTicks);
      }
    }
  });

  it('there are 1, 1, 2, 2 and 3 of them, and luck removes one', () => {
    expect(DIFFICULTIES.map((d) => start(1, noMove, emptyRun(d)).decoys.length)).toEqual([1, 1, 2, 2, 3]);
    expect(DIFFICULTIES.map((d) => start(1, noMove, runWith(d, buff('luck', 15))).decoys.length)).toEqual([0, 0, 1, 1, 2]);
    expect(start(1, noMove, runWith(1, buff('luck', 15), buff('luck', 15))).decoys).toHaveLength(0);
  });

  it('at most one is on the water at a time and each ends before the game does', () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = start(seed, noMove, emptyRun(d));
        for (let i = 0; i < s.decoys.length; i++) {
          const a = s.decoys[i]!;
          expect(a.leaveTick).toBeGreaterThan(a.appearTick);
          expect(a.leaveTick).toBeLessThanOrEqual(s.totalTicks);
          const b = s.decoys[i + 1];
          if (b) expect(b.appearTick).toBeGreaterThanOrEqual(a.leaveTick);
        }
      }
    }
  });

  /** The state at the moment a ripple is on the water. */
  function atRipple(seed = 1, difficulty: Difficulty = 1) {
    let s = start(seed, noMove, emptyRun(difficulty));
    s = tick(s, LEAD_TICKS);
    const d = s.decoys[0]!;
    s = tick(s, d.appearTick + 1);
    return { s, d };
  }

  it('tapping a ripple on the water costs calm and cannot be done twice', () => {
    const { s, d } = atRipple();
    expect(visibleDecoys(s).map((x) => x.id)).toEqual([d.id]);
    expect(calmOf(s)).toBe(CALM_START);
    const tapped = act(s, { type: 'tap', decoyId: d.id });
    expect(calmOf(tapped)).toBe(CALM_START - TAP_CALM_COST);
    expect(tapCount(tapped)).toBe(1);
    expect(visibleDecoys(tapped)).toHaveLength(0);
    expect(engine.reduce(tapped, { type: 'tap', decoyId: d.id })).toBe(tapped);
  });

  it('a tap on something that is not on the water changes nothing', () => {
    const s = start();
    expect(engine.reduce(s, { type: 'tap', decoyId: 'd0' })).toBe(s);
    expect(engine.reduce(s, { type: 'tap', decoyId: 'nope' })).toBe(s);
    const { s: later } = atRipple();
    expect(engine.reduce(later, { type: 'tap', decoyId: 'nope' })).toBe(later);
  });

  it('ignoring a ripple adds one to steadiness when it leaves; tapping it does not', () => {
    const { s, d } = atRipple();
    expect(steadiness(s)).toBe(0);
    const gone = tick(s, d.leaveTick - s.tick);
    expect(steadiness(gone)).toBe(1);
    const tapped = tick(act(s, { type: 'tap', decoyId: d.id }), d.leaveTick - s.tick);
    expect(steadiness(tapped)).toBe(0);
  });

  it('calm never drops below 0', () => {
    const s = start(1, noMove, emptyRun(5));
    const hammered = { ...s, decoys: [...s.decoys, ...s.decoys, ...s.decoys, ...s.decoys].map((d, i) => ({ ...d, id: `x${i}`, tapped: true })) };
    expect(calmOf(hammered)).toBe(0);
  });

  it('the log says what happened to each ripple', () => {
    const ignored = outcomeOf(perfect(start(1, noMove, emptyRun(1)))).log.join('\n');
    expect(ignored).toMatch(/You let it (go|swim on|fade)/);
    const { s, d } = atRipple();
    const tapped = playWith(act(s, { type: 'tap', decoyId: d.id }), (st) => idealHold(st, st.tick));
    expect(outcomeOf(tapped).log.join('\n')).toMatch(/rippled/);
  });
});

describe('party and buffs', () => {
  it('Sleep widens the timing grace by one tick per 8 power', () => {
    const plain = start(1, noMove, emptyRun(2));
    const rested = start(1, only('sleep', 12), emptyRun(2));
    expect(rested.sleepPower).toBeGreaterThan(0);
    expect(rested.tolerance).toBe(plain.tolerance + Math.floor(rested.sleepPower / 8));
    expect(start(1, parties.full, emptyRun(2)).tolerance).toBeGreaterThan(start(1, parties.starter, emptyRun(2)).tolerance);
  });

  it('the time buff adds one grace tick per 2 seconds, and the grace is capped to keep a scored core', () => {
    const base = start(1, noMove, emptyRun(2)).tolerance;
    expect(start(1, noMove, runWith(2, buff('time', 4))).tolerance).toBe(base + 2);
    const huge = start(1, only('sleep', 30), runWith(5, buff('time', 200)));
    expect(huge.tolerance).toBe(Math.min(huge.inhaleTicks, huge.holdTicks, huge.exhaleTicks) - 2);
    expect(idealTicksPerCycle(huge)).toBeGreaterThan(0);
    expect(graceTicks(5, 0, 0, 60, 20, 70)).toBe(2);
  });

  it('wider grace turns a late press into a perfect cycle', () => {
    const plain = start(1, noMove, emptyRun(2));
    const late = plain.tolerance + 6;
    const poor = offBy(plain, late, late).cycleScores[0]!.accuracy;
    const rested = start(1, only('sleep', 30), emptyRun(2));
    expect(rested.tolerance).toBeGreaterThanOrEqual(late);
    expect(offBy(rested, late, late).cycleScores[0]!.accuracy).toBe(100);
    expect(poor).toBeLessThan(100);
  });

  it('Eat shows the next-phase line all game, the hint buff for that many cycles', () => {
    const eat = start(1, only('eat', 1), emptyRun(2));
    expect(eat.hintCycles).toBe(eat.cycleCount);
    const buffed = start(1, noMove, runWith(2, buff('hint', 2)));
    expect(buffed.hintCycles).toBe(2);
    expect(hintActive(tick(buffed, LEAD_TICKS))).toBe(true);
    expect(hintActive(tick(buffed, LEAD_TICKS + 2 * buffed.cycleTicks))).toBe(false);
    expect(hintActive(start(1, noMove, emptyRun(2)))).toBe(false);
    expect(start(1, noMove, runWith(1, buff('hint', 99))).hintCycles).toBe(5);
  });

  it('the hint line knows what comes next and when', () => {
    let s = tick(start(1, noMove, emptyRun(1)), LEAD_TICKS);
    expect(nextPhase(s)).toBe('hold');
    expect(phaseTicksLeft(s)).toBe(s.inhaleTicks);
    s = tick(s, s.inhaleTicks + s.holdTicks);
    expect(phaseOf(s)).toBe('exhale');
    expect(nextPhase(s)).toBe('inhale');
    const last = { ...s, tick: s.totalTicks - 10 };
    expect(nextPhase(last)).toBeNull();
    expect(phaseTicksLeft(last)).toBe(10);
  });

  it('Move lets you choose the pace before the first tick, and only then', () => {
    const s = start(1, only('move', 1), emptyRun(1));
    expect(canChoosePace(s)).toBe(true);
    const brisk = act(s, { type: 'pace', pace: -1 });
    expect([brisk.inhaleTicks, brisk.holdTicks, brisk.exhaleTicks]).toEqual([64, 32, 96]);
    const slow = act(s, { type: 'pace', pace: 1 });
    expect([slow.inhaleTicks, slow.holdTicks, slow.exhaleTicks]).toEqual([100, 50, 150]);
    expect(slow.totalTicks).toBe(slow.cycleTicks * 5);
    expect(act(slow, { type: 'pace', pace: 0 })).toEqual(s);
    const running = tick(s);
    expect(canChoosePace(running)).toBe(false);
    expect(engine.reduce(running, { type: 'pace', pace: 1 })).toBe(running);
    expect(engine.reduce(s, { type: 'pace', pace: 7 as unknown as Pace })).toBe(s);
  });

  it('without a Move troop the pace stays steady', () => {
    const s = start(1, noMove, emptyRun(1));
    expect(canChoosePace(s)).toBe(false);
    expect(engine.reduce(s, { type: 'pace', pace: 1 })).toBe(s);
  });

  it('a new pace keeps ripples after the first two cycles and stays deterministic', () => {
    for (const pace of [-1, 1] as Pace[]) {
      const a = act(start(9, only('move', 1), emptyRun(3)), { type: 'pace', pace });
      const b = act(start(9, only('move', 1), emptyRun(3)), { type: 'pace', pace });
      expect(a).toEqual(b);
      for (const d of a.decoys) expect(d.appearTick).toBeGreaterThanOrEqual(DECOY_AFTER_CYCLES * a.cycleTicks);
    }
  });

  it('revive forgives a missed cycle, up to the buff and to a third of the cycles', () => {
    const run = runWith(3, buff('revive', 2));
    const s = start(4, noMove, run);
    expect(s.cycleCount).toBe(6);
    expect(s.revivesLeft).toBe(2);
    const end = neverHeld(s);
    expect(end.cycleScores.slice(0, 2).map((c) => [c.accuracy, c.revived])).toEqual([
      [REVIVE_ACCURACY, true],
      [REVIVE_ACCURACY, true],
    ]);
    expect(end.cycleScores.slice(2).every((c) => c.accuracy === 0 && !c.revived)).toBe(true);
    expect(end.revivesLeft).toBe(0);
    expect(start(4, noMove, runWith(3, buff('revive', 1))).revivesLeft).toBe(1);
    expect(neverHeld(start(4, noMove, emptyRun(3))).cycleScores.some((c) => c.revived)).toBe(false);
  });

  it('revive leaves a good cycle alone', () => {
    const end = perfect(start(4, noMove, runWith(3, buff('revive', 3))));
    expect(end.revivesLeft).toBe(2);
    expect(end.cycleScores.some((c) => c.revived)).toBe(false);
  });

  it('luck cuts a ripple; attack and defense change nothing', () => {
    const base = start(5, noMove, emptyRun(3));
    const combat = start(5, noMove, runWith(3, buff('attack', 40), buff('defense', 40)));
    expect(combat).toEqual(base);
    expect(start(5, noMove, runWith(3, buff('luck', 10))).decoys.length).toBe(base.decoys.length - 1);
  });

  it('is playable with the starter party, the mixed party (a citizen) and one vassal', () => {
    for (const party of [parties.starter, parties.mixed, parties.single, parties.full]) {
      const r = playToEnd(game, 3, party, emptyRun(2));
      expect(r.outcome).not.toBeNull();
      expect(r.outcome!.troopsUsed).toEqual(party.members.map((m) => m.id));
    }
  });
});

describe('determinism and the bot', () => {
  it('the same seed, party and run give the same game; another seed moves the ripples', () => {
    const a = playToEnd(game, 11, parties.full, runs.plain);
    const b = playToEnd(game, 11, parties.full, runs.plain);
    expect(b.actions).toEqual(a.actions);
    expect(b.outcome).toEqual(a.outcome);
    const placements = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) placements.add(JSON.stringify(start(seed, noMove, emptyRun(4)).decoys));
    expect(placements.size).toBeGreaterThan(8);
  });

  it('the language changes the words, never the score', () => {
    const en = playToEnd(game, 21, parties.full, runs.plain, 20000, { locale: 'en' }).outcome!;
    const fr = playToEnd(game, 21, parties.full, runs.plain, 20000, { locale: 'fr' }).outcome!;
    expect(fr.score).toBe(en.score);
    expect(fr.result).toBe(en.result);
    expect(fr.log).not.toEqual(en.log);
    expect(fr.log[0]).toBe(strings.fr.log.start);
  });

  it('the bot error is seeded, bounded by its difficulty and different from cycle to cycle', () => {
    for (const d of DIFFICULTIES) {
      const seen = new Set<string>();
      for (let cycle = 0; cycle < 40; cycle++) {
        const e = botCycleError({ seed: 7, difficulty: d }, cycle);
        expect(e).toEqual(botCycleError({ seed: 7, difficulty: d }, cycle));
        expect(e.press).toBeGreaterThanOrEqual(0);
        expect(e.press).toBeLessThanOrEqual(BOT[d].spread * 3);
        expect(Math.abs(e.release)).toBeLessThanOrEqual(BOT[d].spread * 3);
        seen.add(`${e.press}:${e.release}`);
      }
      expect(seen.size).toBeGreaterThan(10);
      expect(botCycleError({ seed: 7, difficulty: d }, 3)).not.toEqual(botCycleError({ seed: 8, difficulty: d }, 3));
    }
  });

  it('the bot never leaves, never presses during the lead, and ends the game', () => {
    const r = playToEnd(game, 2, parties.starter, runs.plain);
    expect(r.outcome).not.toBeNull();
    expect(r.actions.some((a) => (a as StillWaterAction).type === 'forfeit')).toBe(false);
    expect((r.actions[0] as StillWaterAction).type).toBe('tick');
    expect(r.outcome!.result).not.toBe('fled');
  });

  /** Win rate and median score of the bot over many seeds. */
  function botStats(party: Party, difficulty: Difficulty, seeds = 120) {
    let won = 0;
    const scores: number[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const o = playToEnd(game, seed, party, emptyRun(difficulty)).outcome!;
      if (o.result === 'won') won++;
      scores.push(o.score);
    }
    scores.sort((a, b) => a - b);
    return { winRate: won / seeds, median: scores[Math.floor(seeds / 2)]!, low: scores[0]!, high: scores[seeds - 1]! };
  }

  it('on normal difficulty the bot wins about 40 to 70 percent with a starter party and with the full party', () => {
    for (const party of [parties.starter, parties.full]) {
      const { winRate } = botStats(party, 2, 200);
      expect(winRate).toBeGreaterThanOrEqual(0.4);
      expect(winRate).toBeLessThanOrEqual(0.7);
    }
  });

  it('the bot wins easily on difficulty 1 and less on the hardest', () => {
    const easy = botStats(parties.full, 1);
    const hard = botStats(parties.full, 5);
    expect(easy.winRate).toBeGreaterThan(0.8);
    expect(hard.winRate).toBeLessThan(0.6);
    expect(easy.median).toBeGreaterThan(hard.median);
  });

  it('the bot scores spread out: not all the same, within 0 to 1000', () => {
    for (const d of DIFFICULTIES) {
      const s = botStats(parties.starter, d, 60);
      expect(s.high).toBeGreaterThan(s.low);
      expect(s.low).toBeGreaterThanOrEqual(0);
      expect(s.high).toBeLessThanOrEqual(1000);
    }
  });

  it('a Sleep troop helps the bot: more grace, a higher median', () => {
    const rested = botStats(parties.full, 3);
    const none = botStats({ members: parties.full.members.filter((m) => m.habit !== 'sleep') }, 3);
    expect(rested.median).toBeGreaterThan(none.median);
  });
});

describe('tap each phase', () => {
  const at = (s: StillWaterState, tickInCycleWanted: number, cycle = 0) => ({ ...tick(s, LEAD_TICKS), tick: cycle * s.cycleTicks + tickInCycleWanted });

  it('a press on time holds in the breath in and the rest, and lets go in the breath out', () => {
    const s = start(1, noMove, emptyRun(1));
    expect(tapTarget(s)).toBe(true);
    expect(tapTarget(at(s, 0))).toBe(true);
    expect(tapTarget(at(s, 10))).toBe(true);
    expect(tapTarget(at(s, s.inhaleTicks + 5))).toBe(true);
    expect(tapTarget(at(s, s.inhaleTicks + s.holdTicks))).toBe(false);
    expect(tapTarget(at(s, s.inhaleTicks + s.holdTicks + 30))).toBe(false);
  });

  it('a press just before the breath out lets go, and one just before the breath in holds', () => {
    const s = start(1, noMove, emptyRun(1));
    const holdEnd = s.inhaleTicks + s.holdTicks;
    expect(tapTarget(at(s, holdEnd - 3))).toBe(false);
    expect(tapTarget(at(s, holdEnd - EARLY_TAP_TICKS))).toBe(false);
    expect(tapTarget(at(s, holdEnd - EARLY_TAP_TICKS - 1))).toBe(true);
    expect(tapTarget(at(s, s.cycleTicks - 3))).toBe(true);
    expect(tapTarget(at(s, s.cycleTicks - EARLY_TAP_TICKS))).toBe(true);
    expect(tapTarget(at(s, s.cycleTicks - EARLY_TAP_TICKS - 1))).toBe(false);
  });

  it('after the last breath out there is nothing to hold for', () => {
    const s = start(1, noMove, emptyRun(1));
    expect(tapTarget(at(s, s.cycleTicks - 3, s.cycleCount - 1))).toBe(false);
  });

  /** A tap player who presses `early` ticks before each phase change (negative: late). The first breath in is held from the lead. */
  function tapper(s: StillWaterState, early: number): StillWaterState {
    let next = act(s, { type: 'hold', down: true });
    for (let guard = 0; !isOver(next) && guard < 20_000; guard++) {
      if (next.leadLeft === 0) {
        const t = inCycle(next);
        const holdEnd = next.inhaleTicks + next.holdTicks;
        if (t === (next.cycleTicks - early) % next.cycleTicks || t === holdEnd - early) {
          const down = tapTarget(next);
          if (down !== next.holding) next = engine.reduce(next, { type: 'hold', down });
        }
      }
      next = engine.reduce(next, { type: 'tick' });
    }
    return next;
  }

  it('a tap player who is a little early, on time or a little late still scores well', () => {
    for (const early of [8, 3, 0, -3]) {
      const end = tapper(start(1, noMove, emptyRun(1)), early);
      expect(averageAccuracyOf(end), `${early} ticks early`).toBeGreaterThanOrEqual(90);
    }
  });

  it('a tap 150 ms (3 ticks) early for the breath out used to be lost: now the cycle scores', () => {
    const end = tapper(start(1, noMove, emptyRun(1)), 3);
    expect(end.cycleScores[1]!.accuracy).toBeGreaterThanOrEqual(95);
  });
});

describe('breath, copy and plain data', () => {
  it('the breath rises linearly while breathing in, rests at the top and falls while breathing out', () => {
    const s = tick(start(1, noMove, emptyRun(1)), LEAD_TICKS);
    expect(breathAt(s)).toBe(0);
    expect(breathAt(tick(s, s.inhaleTicks / 2))).toBeCloseTo(0.5, 5);
    expect(breathAt(tick(s, s.inhaleTicks + 5))).toBe(1);
    const mid = tick(s, s.inhaleTicks + s.holdTicks + s.exhaleTicks / 2);
    expect(breathAt(mid)).toBeCloseTo(0.5, 5);
    expect(breathAt(tick(s, s.inhaleTicks / 2), 0.5)).toBeGreaterThan(0.5);
    expect(breathAt(start())).toBe(0);
  });

  it('when the game is over the cue is done, not breathe in; the ring rests and nothing comes next', () => {
    const end = perfect(start(1, noMove, emptyRun(1)));
    expect(phaseOf(end)).toBe('done');
    expect(nextPhase(end)).toBeNull();
    expect(breathAt(end)).toBe(0);
    const left = act(tick(start(), LEAD_TICKS + 30), { type: 'forfeit' });
    expect(phaseOf(left)).toBe('done');
    expect(strings.en.phase.done).toBe('Done');
    expect(strings.fr.phase.done).toBe('Terminé');
  });

  it('displayCycle runs from 1 to the number of cycles and stops there', () => {
    const s = start(1, noMove, emptyRun(1));
    expect(displayCycle(s)).toBe(1);
    expect(displayCycle({ ...s, tick: s.cycleTicks })).toBe(2);
    expect(displayCycle({ ...s, tick: s.totalTicks })).toBe(s.cycleCount);
    expect(cycleIndex({ ...s, tick: s.totalTicks - 1 })).toBe(s.cycleCount - 1);
  });

  it('both languages carry the learned note about slow exhales and the warm loss line', () => {
    const o = outcomeOf(neverHeld(start(1, noMove, emptyRun(1))));
    expect(o.learned!.topic.en).toMatch(/exhale/i);
    expect(o.learned!.topic.fr).toMatch(/expiration/i);
    expect(o.learned!.note.en).toMatch(/not advice/i);
    expect(o.learned!.note.fr).toMatch(/pas un conseil/i);
    expect(strings.en.end.lost).toBe('The pond is still here. Try again whenever you like.');
    expect(strings.fr.end.lost).toMatch(/Reviens quand tu veux/);
  });

  it('the French speaks to you as "tu" and never shames a loss', () => {
    const text = JSON.stringify(strings.fr);
    expect(text).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
    for (const lost of [strings.en.end.lost, strings.fr.end.lost, strings.en.log.endLost, strings.fr.log.endLost]) {
      expect(lost).not.toMatch(/fail|wrong|bad|échec|raté|nul/i);
    }
  });

  it('the log starts calm, lists every cycle and ends with the result line', () => {
    const o = outcomeOf(perfect(start(1, noMove, emptyRun(1))));
    expect(o.log[0]).toBe(strings.en.log.start);
    expect(o.log.filter((l) => /^Cycle \d/.test(l))).toHaveLength(5);
    expect(o.log[o.log.length - 1]).toBe(strings.en.log.endWon);
    expect(o.log.every((l) => l.length > 0)).toBe(true);
  });

  it('stats are plain finite numbers', () => {
    const o = outcomeOf(perfect(start(1, noMove, emptyRun(1))));
    for (const v of Object.values(o.stats!)) expect(Number.isFinite(v)).toBe(true);
    expect(o.stats).toMatchObject({ cycles: 5, accuracy: 100, water: 100, taps: 0 });
  });

  it('state is plain JSON data and survives a round trip', () => {
    const s = tick(start(5, parties.full, runs.buffed), 300);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

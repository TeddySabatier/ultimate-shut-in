/**
 * Still Water's rules. The contract kit covers generic properties; this
 * file covers scoring, decoys, party, buffs, the bot and the copy.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type Party, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  CALM_START,
  HINT_BONUS,
  RHYTHM,
  REVIVE_ACCURACY,
  TAP_CALM_COST,
  WIN_SCORE,
  botDesiredHold,
  breathProgress,
  buildRhythm,
  currentAccuracy,
  displayCycle,
  engine,
  graceTicks,
  habitPower,
  idealHold,
  isOver,
  outcomeLog,
  phaseOf,
  rawScore,
  tickKind,
  visibleDecoys,
  waterLevel,
  type StillWaterAction,
  type StillWaterState,
} from './engine';
import game from './manifest';
import { strings } from './strings';

const start = (seed = 1, party: Party = parties.full, run: RunContext = emptyRun(1), locale: 'en' | 'fr' = 'en') =>
  engine.initial(seed, party, run, locale);

const apply = (s: StillWaterState, ...actions: StillWaterAction[]) => actions.reduce((acc, a) => engine.reduce(acc, a), s);

const tick = (s: StillWaterState, n = 1) => {
  let next = s;
  for (let i = 0; i < n; i++) next = engine.reduce(next, { type: 'tick' });
  return next;
};

const hold = (s: StillWaterState, down: boolean) => engine.reduce(s, { type: 'hold', down });

/** Play to the end with a hold predicate evaluated before each tick. */
function playWith(s: StillWaterState, want: (state: StillWaterState) => boolean): StillWaterState {
  let next = s;
  let guard = 0;
  while (!isOver(next) && guard < 20_000) {
    const down = want(next);
    if (down !== next.holding) next = hold(next, down);
    next = engine.reduce(next, { type: 'tick' });
    guard += 1;
  }
  return next;
}

const perfect = (s: StillWaterState) => playWith(s, (st) => idealHold(st, st.tick));
const neverHeld = (s: StillWaterState) => playWith(s, () => false);
const alwaysHeld = (s: StillWaterState) => playWith(s, () => true);

describe('still water engine', () => {
  it('uses the 4-2-6 table on difficulty 1 and 5-3-7 on difficulty 2', () => {
    const easy = start(1, parties.single, emptyRun(1));
    expect(easy.inhaleTicks).toBe(80);
    expect(easy.holdTicks).toBe(40);
    expect(easy.exhaleTicks).toBe(120);
    expect(easy.cycleCount).toBe(5);
    const mid = start(1, parties.single, emptyRun(2));
    expect(mid.inhaleTicks).toBe(100);
    expect(mid.holdTicks).toBe(60);
    expect(mid.exhaleTicks).toBe(140);
    expect(mid.cycleCount).toBe(6);
  });

  it('uses faster patterns and more cycles on higher difficulties', () => {
    const hard = start(1, parties.single, emptyRun(5));
    expect(hard.inhaleTicks).toBe(60);
    expect(hard.holdTicks).toBe(20);
    expect(hard.exhaleTicks).toBe(70);
    expect(hard.cycleCount).toBe(8);
    expect(hard.totalTicks).toBeLessThan(start(1, parties.single, emptyRun(2)).totalTicks);
    expect(hard.cycleTicks).toBeLessThan(start(1, parties.single, emptyRun(1)).cycleTicks);
  });

  it('Move power stretches every phase by floor(power / 10) ticks', () => {
    const alone = start(1, parties.single, emptyRun(1));
    const full = start(1, parties.full, emptyRun(1));
    const stretch = Math.floor(habitPower(parties.full, 'move') / 10);
    expect(stretch).toBeGreaterThan(0);
    expect(full.inhaleTicks).toBe(alone.inhaleTicks + stretch);
    expect(full.holdTicks).toBe(alone.holdTicks + stretch);
    expect(full.exhaleTicks).toBe(alone.exhaleTicks + stretch);
  });

  it('Sleep power and the time buff widen grace; attack does not', () => {
    const starter = start(1, parties.starter, emptyRun(1));
    const full = start(1, parties.full, emptyRun(1));
    expect(full.tolerance).toBeGreaterThan(starter.tolerance);
    const timed = start(1, parties.full, { ...emptyRun(1), buffs: [{ id: 't', kind: 'time', amount: 20 }] });
    expect(timed.tolerance).toBeGreaterThan(full.tolerance);
    const attacked = start(1, parties.full, { ...emptyRun(1), buffs: [{ id: 'a', kind: 'attack', amount: 15 }] });
    expect(attacked.tolerance).toBe(full.tolerance);
    expect(graceTicks(1, 0, 0, 80, 40, 120)).toBe(RHYTHM[1].baseTol);
  });

  it('Eat or a hint buff turns the guide on; defense is ignored', () => {
    expect(start(1, parties.starter, emptyRun(1)).showHint).toBe(false);
    expect(start(1, parties.full, emptyRun(1)).showHint).toBe(true);
    const hinted = start(1, parties.starter, { ...emptyRun(1), buffs: [{ id: 'h', kind: 'hint', amount: 2 }] });
    expect(hinted.showHint).toBe(true);
    const defended = start(1, parties.starter, { ...emptyRun(1), buffs: [{ id: 'd', kind: 'defense', amount: 15 }] });
    expect(defended.showHint).toBe(false);
  });

  it('phases walk inhale, hold, then exhale, then the next cycle', () => {
    const s = start(1, parties.single, emptyRun(1));
    expect(phaseOf(s)).toBe('inhale');
    expect(phaseOf(tick(s, s.inhaleTicks))).toBe('hold');
    expect(phaseOf(tick(s, s.inhaleTicks + s.holdTicks))).toBe('exhale');
    expect(displayCycle(tick(s, s.cycleTicks))).toBe(2);
  });

  it('breath progress grows, stays, then shrinks', () => {
    const s = start(1, parties.single, emptyRun(1));
    expect(breathProgress(s)).toBe(0);
    expect(breathProgress(tick(s, s.inhaleTicks))).toBe(100);
    expect(breathProgress(tick(s, s.inhaleTicks + s.holdTicks))).toBe(100);
    expect(breathProgress(tick(s, s.cycleTicks - 1))).toBeLessThan(10);
  });

  it('perfect hold scores at or near 1000 and wins', () => {
    const o = engine.outcome(perfect(start(1, parties.single, emptyRun(1))));
    expect(o?.result).toBe('won');
    expect(o?.score).toBeGreaterThanOrEqual(900);
    expect(o?.stats?.cycles).toBe(5);
  });

  it('never-held scores poorly and loses', () => {
    const s = neverHeld(start(1, parties.single, emptyRun(1)));
    const o = engine.outcome(s);
    expect(s.cycleScores.every((c) => c.accuracy === 0)).toBe(true);
    expect(o?.result).toBe('lost');
    expect(o?.score).toBeLessThan(WIN_SCORE);
    expect(o?.log.at(-1)).toMatch(/still here/);
  });

  it('always-held is near half and loses on a clean party', () => {
    const s = alwaysHeld(start(1, parties.single, emptyRun(1)));
    const o = engine.outcome(s);
    expect(s.cycleScores.every((c) => c.accuracy > 30 && c.accuracy < 70)).toBe(true);
    expect(o?.result).toBe('lost');
  });

  it('a late hold scores below a perfect one and above never-held', () => {
    const s0 = start(1, parties.single, emptyRun(1));
    const late = playWith(s0, (st) => idealHold(st, Math.max(0, st.tick - 20)));
    const good = perfect(start(1, parties.single, emptyRun(1)));
    const none = neverHeld(start(1, parties.single, emptyRun(1)));
    expect(averageish(late)).toBeLessThan(averageish(good));
    expect(averageish(late)).toBeGreaterThan(averageish(none));
  });

  it('an early hold scores below a perfect one', () => {
    const s0 = start(1, parties.single, emptyRun(1));
    const early = playWith(s0, (st) => idealHold(st, st.tick + 20));
    expect(averageish(early)).toBeLessThan(averageish(perfect(start(1, parties.single, emptyRun(1)))));
    expect(averageish(early)).toBeGreaterThan(0);
  });

  it('grace ticks forgive a small late start that would otherwise miss', () => {
    const tight = start(1, parties.single, emptyRun(1));
    expect(tickKind(tight, 0)).toBe('grace');
    expect(tickKind(tight, tight.tolerance)).toBe('hold');
    const wide = start(1, parties.full, { ...emptyRun(1), buffs: [{ id: 't', kind: 'time', amount: 20 }] });
    expect(wide.tolerance).toBeGreaterThan(tight.tolerance);
    expect(tickKind(wide, tight.tolerance)).toBe('grace');
  });

  it('tapping a visible decoy costs calm; ignoring it adds steadiness', () => {
    const s0 = start(7, parties.full, emptyRun(5));
    expect(s0.decoys.length).toBeGreaterThan(0);
    const d = s0.decoys[0]!;
    const at = tick(s0, d.appearTick);
    expect(visibleDecoys(at).some((x) => x.id === d.id)).toBe(true);
    const tapped = engine.reduce(at, { type: 'tap', decoyId: d.id });
    expect(tapped.calm).toBe(CALM_START - TAP_CALM_COST);
    expect(tapped.decoys.find((x) => x.id === d.id)?.tapped).toBe(true);
    expect(engine.reduce(at, { type: 'tap', decoyId: 'nope' })).toBe(at);
    const ignored = tick(at, d.leaveTick - at.tick);
    expect(ignored.steadiness).toBeGreaterThan(at.steadiness);
  });

  it('decoys never appear during the first two cycles', () => {
    const s = start(3, parties.full, emptyRun(5));
    expect(s.decoys.every((d) => d.appearTick >= s.cycleTicks * 2)).toBe(true);
  });

  it('luck removes one decoy; a luck-less hard run has more', () => {
    const plain = start(4, parties.full, emptyRun(5));
    const lucky = start(4, parties.full, { ...emptyRun(5), buffs: [{ id: 'l', kind: 'luck', amount: 15 }] });
    expect(lucky.decoys.length).toBe(plain.decoys.length - 1);
  });

  it('a revive forgives one missed cycle', () => {
    const run: RunContext = { ...emptyRun(1), buffs: [{ id: 'r', kind: 'revive', amount: 1 }] };
    const s = neverHeld(start(1, parties.single, run));
    expect(s.cycleScores[0]?.revived).toBe(true);
    expect(s.cycleScores[0]?.accuracy).toBe(REVIVE_ACCURACY);
    expect(s.cycleScores.filter((c) => c.revived)).toHaveLength(1);
    expect(s.revivesLeft).toBe(0);
  });

  it('hint bonus raises the score; water tracks the running average', () => {
    const hinted = start(1, parties.full, emptyRun(1));
    const bare = start(1, parties.single, emptyRun(1));
    expect(hinted.showHint).toBe(true);
    const h = perfect(hinted);
    const b = perfect(bare);
    expect(rawScore(h) - rawScore(b)).toBeGreaterThanOrEqual(HINT_BONUS - 2);
    const mid = tick(hold(bare, true), 40);
    expect(waterLevel(mid)).toBeGreaterThan(0);
    expect(waterLevel(mid)).toBeLessThanOrEqual(100);
  });

  it('same seed, party and run are deterministic; different seeds differ', () => {
    const a = start(11, parties.full, runs.plain);
    const b = start(11, parties.full, runs.plain);
    expect(a).toEqual(b);
    const p1 = playToEnd(game, 11, parties.full, runs.plain);
    const p2 = playToEnd(game, 11, parties.full, runs.plain);
    expect(p1.actions).toEqual(p2.actions);
    expect(p1.outcome).toEqual(p2.outcome);
    const other = playToEnd(game, 99, parties.full, runs.plain);
    expect(other.outcome?.stats?.gusts !== p1.outcome?.stats?.gusts || other.outcome?.log.join() !== p1.outcome?.log.join()).toBe(true);
  });

  it('the locale changes only the log language', () => {
    const en = playToEnd(game, 9, parties.starter, runs.plain);
    const fr = playToEnd(game, 9, parties.starter, runs.plain, 20_000, { locale: 'fr' });
    expect(en.outcome?.log).toEqual(outcomeLog(en.state, strings.en));
    expect(fr.outcome?.log[0]).toMatch(/étang/i);
    expect(fr.actions).toEqual(en.actions);
    expect({ ...fr.outcome, log: [] }).toEqual({ ...en.outcome, log: [] });
  });

  it('forfeit ends as fled and keeps the score so far; later actions do nothing', () => {
    const s = apply(tick(start(2, parties.single, emptyRun(1)), 10), { type: 'forfeit' });
    const o = engine.outcome(s);
    expect(o?.result).toBe('fled');
    expect(o?.log.at(-1)).toMatch(/left the bank/i);
    expect(engine.reduce(s, { type: 'tick' })).toBe(s);
    expect(engine.forfeit?.(s)).toEqual({ type: 'forfeit' });
  });

  it('invalid hold and tap do not throw and leave the state unchanged when they do nothing', () => {
    const s = start(1, parties.single, emptyRun(1));
    expect(hold(s, false)).toBe(s);
    expect(engine.reduce(s, { type: 'tap', decoyId: 'd0' })).toBe(s);
    expect(engine.reduce(s, { type: 'hold', down: true }).holding).toBe(true);
  });

  it('the bot holds late, sits out gusts, never taps, and is null when over', () => {
    const s = start(1, parties.full, runs.plain);
    expect(engine.botPlay(s, () => 0)?.type).toBe('tick');
    const later = tick(s, RHYTHM[s.difficulty].late);
    const act = engine.botPlay(later, () => 0);
    expect(act).toEqual({ type: 'hold', down: botDesiredHold(later) });
    const done = playToEnd(game, 1, parties.full, runs.plain);
    expect(engine.botPlay(done.state, () => 0)).toBeNull();
    expect(done.actions.some((a) => a.type === 'tap')).toBe(false);
    expect(done.actions.some((a) => a.type === 'forfeit')).toBe(false);
  });

  it('the bot wins more often on difficulty 1 than on 5, and lands in a sensible band on 2', () => {
    const seeds = [1, 7, 42, 1337, 90210, 3, 8, 21, 55, 89];
    const rate = (run: RunContext) => {
      const wins = seeds.filter((seed) => playToEnd(game, seed, parties.full, run).outcome?.result === 'won').length;
      return wins / seeds.length;
    };
    const easy = rate(emptyRun(1));
    const normal = rate(runs.plain);
    const hard = rate(emptyRun(5));
    expect(easy).toBeGreaterThanOrEqual(0.6);
    expect(normal).toBeGreaterThanOrEqual(0.3);
    expect(normal).toBeLessThanOrEqual(0.9);
    expect(hard).toBeLessThan(easy);
  });

  it('every string key exists in French and English, including the learned note', () => {
    expect(Object.keys(strings.en)).toEqual(Object.keys(strings.fr));
    expect(strings.en.learned.note.length).toBeGreaterThan(20);
    expect(strings.fr.learned.note.length).toBeGreaterThan(20);
    expect(strings.en.disclaimer).toMatch(/not therapy/i);
    expect(strings.fr.disclaimer).toMatch(/pas une thérapie/i);
  });

  it('outcome lists every troop and the learned practice tip', () => {
    const o = engine.outcome(perfect(start(1, parties.mixed, emptyRun(1))));
    expect(o?.troopsUsed).toEqual(parties.mixed.members.map((m) => m.id));
    expect(o?.learned?.topic.en).toBe(strings.en.learned.topic);
    expect(o?.learned?.note.fr).toBe(strings.fr.learned.note);
  });

  it('a finished game ignores hold, tap and tick', () => {
    const s = perfect(start(1, parties.single, emptyRun(1)));
    expect(isOver(s)).toBe(true);
    expect(engine.reduce(s, { type: 'hold', down: true })).toBe(s);
    expect(engine.reduce(s, { type: 'tick' })).toBe(s);
    expect(engine.outcome(s)).toEqual(engine.outcome(engine.reduce(s, { type: 'forfeit' })));
  });

  it('currentAccuracy is 100 on an empty cycle and water stays in 0..100', () => {
    const s = start(1, parties.single, emptyRun(1));
    expect(currentAccuracy(s)).toBe(100);
    expect(waterLevel(s)).toBeGreaterThanOrEqual(0);
    expect(buildRhythm(3, 0).cycleCount).toBe(6);
  });
});

function averageish(s: StillWaterState): number {
  if (s.cycleScores.length === 0) return 0;
  return s.cycleScores.reduce((n, c) => n + c.accuracy, 0) / s.cycleScores.length;
}

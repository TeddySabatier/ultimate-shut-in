/**
 * Coin Duel's rules, one behaviour per test. The contract kit
 * (contract.test.ts) covers the generic properties; this file covers what
 * only this game does.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import { FATIGUE, MAX_CHANCE, MIN_CHANCE, chanceFor, engine, outcomeLog, tally, type CoinDuelState } from './engine';
import game from './manifest';
import { strings } from './strings';

const start = (seed = 1, run: RunContext = runs.plain) => engine.initial(seed, parties.full, run);
const send = (s: CoinDuelState, memberId: string) => engine.reduce(s, { type: 'send', memberId });

describe('coin duel engine', () => {
  it('sets three rival powers from the seed and the difficulty', () => {
    const a = start(1);
    expect(a.rivals).toHaveLength(3);
    expect(start(1).rivals).toEqual(a.rivals);
    const hard = engine.initial(1, parties.full, emptyRun(5));
    expect(hard.rivals.every((p, i) => p > (a.rivals[i] ?? 0))).toBe(true);
  });

  it('weights the coin by the gap in power, clamped to 10..90', () => {
    const s = start(1);
    const d = s.duelists[0]!;
    expect(chanceFor(s, d)).toBe(Math.max(MIN_CHANCE, Math.min(MAX_CHANCE, 50 + d.power - s.rivals[0]!)));
    expect(chanceFor({ ...s, edge: 500 }, d)).toBe(MAX_CHANCE);
    expect(chanceFor({ ...s, edge: -500 }, d)).toBe(MIN_CHANCE);
  });

  it('records a flip per round and tires the ally sent', () => {
    const s1 = send(start(3), 'move');
    expect(s1.flips).toHaveLength(1);
    expect(s1.duelists.find((d) => d.id === 'move')?.uses).toBe(1);
    const s2 = send(s1, 'move');
    expect(s2.flips[1]?.power).toBe(parties.full.members[0]!.power - FATIGUE);
  });

  it('ends at two wins or two losses, and ignores actions afterwards', () => {
    const r = playToEnd(game, 5, parties.full, runs.plain);
    const { wins, losses } = tally(r.state);
    expect(Math.max(wins, losses)).toBe(2);
    expect(engine.reduce(r.state, { type: 'send', memberId: 'move' })).toBe(r.state);
  });

  it('ignores unknown members', () => {
    const s = start(2);
    expect(send(s, 'nobody')).toBe(s);
  });

  it('forfeit ends the duel as fled with the troops used so far', () => {
    const s = engine.reduce(send(start(4), 'study'), { type: 'forfeit' });
    const o = engine.outcome(s);
    expect(o?.result).toBe('fled');
    expect(o?.troopsUsed).toEqual(['study']);
    expect(o?.log.at(-1)).toMatch(/stepped away/);
  });

  it('scores 1000 for a clean win, 750 with one loss, 200 per round won in a loss', () => {
    const won = (flips: boolean[]) =>
      engine.outcome({ ...start(1), flips: flips.map((w, round) => ({ round, memberId: 'move', name: 'Pell', power: 44, rival: 40, chance: 54, roll: 0, won: w, revived: false })) });
    expect(won([true, true])?.score).toBe(1000);
    expect(won([true, false, true])?.score).toBe(750);
    expect(won([true, false, false])).toMatchObject({ result: 'lost', score: 200 });
  });

  it('attack and luck buffs raise every chance; a revive re-flips one lost round', () => {
    const buffed = start(1, { ...runs.plain, buffs: [{ id: 'a', kind: 'attack', amount: 10 }, { id: 'l', kind: 'luck', amount: 5 }, { id: 'r', kind: 'revive', amount: 1 }] });
    expect(buffed.edge).toBe(15);
    expect(buffed.revivesLeft).toBe(1);
    // Find a seed whose first flip is lost without help: with a revive it is re-flipped.
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => !send(start(n), 'move').flips[0]!.won)!;
    const withRevive = send(start(seed, { ...runs.plain, buffs: [{ id: 'r', kind: 'revive', amount: 1 }] }), 'move');
    expect(withRevive.flips[0]?.revived).toBe(true);
    expect(withRevive.revivesLeft).toBe(0);
  });

  it('writes the log in both languages from the same state', () => {
    const r = playToEnd(game, 9, parties.starter, runs.plain);
    expect(outcomeLog(r.state, strings.en)).toEqual(r.outcome?.log);
    const fr = outcomeLog(r.state, strings.fr);
    expect(fr).toHaveLength(r.outcome?.log.length ?? 0);
    expect(fr[0]).toMatch(/^Manche 1/);
  });

  it('the bot picks the ally with the best odds', () => {
    const s = start(11);
    const action = engine.botPlay(s, () => 0);
    const best = Math.max(...s.duelists.map((d) => chanceFor(s, d)));
    expect(action?.type).toBe('send');
    const picked = s.duelists.find((d) => action?.type === 'send' && d.id === action.memberId)!;
    expect(chanceFor(s, picked)).toBeGreaterThanOrEqual(best - 2);
  });
});

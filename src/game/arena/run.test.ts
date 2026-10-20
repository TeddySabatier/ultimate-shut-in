import { describe, expect, it } from 'vitest';
import { arenaContent } from '../content';
import { fresh, deepFreeze } from '../testUtils';
import { settleWave, waveDefense } from '../wave';
import { entryFee } from './economics';
import { abandonRun, bankOptions, bankRun, continueRun, enterRun, eligibleGames, pickBuff, pickGame, resolveGame, runContext, type GameCandidate } from './run';
import { requestGame } from './requests';
import { overDailySuggestion, runsToday } from './state';
import { T0 } from '../testUtils';
import type { SaveFile } from '../types';

const GAMES: GameCandidate[] = [
  { id: 'alpha', minRing: 1, rosterMin: 1 },
  { id: 'bravo', minRing: 1, rosterMin: 3 },
  { id: 'gamma', minRing: 3, rosterMin: 1 },
];
const ONE: GameCandidate[] = [{ id: 'alpha', minRing: 1, rosterMin: 1 }];

function richSave(coins = 1000): SaveFile {
  const s = fresh();
  s.player.coins = coins;
  return s;
}

function mustOk(r: { save: SaveFile; error?: string }): SaveFile {
  expect(r.error).toBeUndefined();
  return r.save;
}

/** Enter, win the game, return the save at the lottery. */
function winOne(save: SaveFile, score = 800): SaveFile {
  return mustOk(resolveGame(save, T0, { result: 'won', score }));
}

describe('entering a run', () => {
  it('charges the fee, opens a run in the playing phase and picks a game', () => {
    const save = richSave();
    const fee = entryFee(1, 'steady');
    const r = enterRun(save, T0, GAMES);
    expect(r.error).toBeUndefined();
    expect(r.save.player.coins).toBe(1000 - fee);
    const run = r.save.arena.run!;
    expect(run).toMatchObject({ id: 'r1', phase: 'playing', room: 0, fee, buffs: [], offers: [], pending: { coins: 0, wins: 0 } });
    expect(['alpha', 'bravo']).toContain(run.current!.gameId); // gamma needs ring 3
    expect(run.current).toMatchObject({ roomIndex: 0, difficulty: 1 });
    expect(r.events).toEqual([{ type: 'arenaRunStarted', runId: 'r1', fee }]);
    expect(r.save.arena.stats.runs).toBe(1);
    expect(runsToday(r.save, r.save.lastOpenDay)).toBe(1);
    expect(r.save.arena.nextSeq).toBe(2);
  });

  it('refuses when short of coins, and nothing moves', () => {
    const save = richSave(entryFee(1, 'steady') - 1);
    const r = enterRun(save, T0, GAMES);
    expect(r.error).toBe('not enough coins');
    expect(r.save).toBe(save);
    expect(r.events).toEqual([]);
  });

  it('accepts exactly the fee', () => {
    const save = richSave(entryFee(1, 'steady'));
    const r = enterRun(save, T0, GAMES);
    expect(r.error).toBeUndefined();
    expect(r.save.player.coins).toBe(0);
  });

  it('refuses before charging when no game is listed or none fits the ring and roster', () => {
    const save = richSave();
    expect(enterRun(save, T0, []).error).toBe('no games');
    expect(enterRun(save, T0, [{ id: 'late', minRing: 4, rosterMin: 1 }]).error).toBe('no games');
    expect(enterRun(save, T0, [{ id: 'big', minRing: 1, rosterMin: 9 }]).error).toBe('no games');
  });

  it('refuses a second run and a run with no troops', () => {
    const save = mustOk(enterRun(richSave(), T0, GAMES));
    expect(enterRun(save, T0, GAMES).error).toBe('run in progress');
    const none = richSave();
    none.settings.enabledHabits = ['move'];
    none.vassals.move.away = true;
    expect(enterRun(none, T0, GAMES).error).toBe('no troops');
  });

  it('never mutates its input', () => {
    const save = deepFreeze(richSave());
    expect(() => enterRun(save, T0, GAMES)).not.toThrow();
  });

  it('counts runs per game day and resets the counter on the next day', () => {
    let save = richSave();
    save = mustOk(enterRun(save, T0, ONE));
    save = mustOk(abandonRun(save, T0));
    save = mustOk(enterRun(save, T0, ONE));
    expect(runsToday(save, save.lastOpenDay)).toBe(2);
    save = mustOk(abandonRun(save, T0));
    save = mustOk(enterRun(save, T0 + 24 * 3_600_000, ONE));
    expect(runsToday(save, save.lastOpenDay + 1)).toBe(1);
    expect(runsToday(save, save.lastOpenDay)).toBe(2);
  });
});

describe('game selection', () => {
  it('filters by ring and roster, and sorts by id so the listing order never matters', () => {
    expect(eligibleGames(GAMES, 1, 3).map((g) => g.id)).toEqual(['alpha', 'bravo']);
    expect(eligibleGames(GAMES, 3, 8).map((g) => g.id)).toEqual(['alpha', 'bravo', 'gamma']);
    expect(eligibleGames(GAMES, 1, 2).map((g) => g.id)).toEqual(['alpha']);
    expect(eligibleGames([...GAMES].reverse(), 3, 8).map((g) => g.id)).toEqual(['alpha', 'bravo', 'gamma']);
  });

  it('is seeded and never repeats the last game when there is a choice', () => {
    for (let seed = 0; seed < 60; seed++) {
      const next = pickGame(GAMES, 3, 8, seed, 1, 'bravo');
      expect(next).not.toBeNull();
      expect(next!.id).not.toBe('bravo');
      expect(pickGame(GAMES, 3, 8, seed, 1, 'bravo')).toEqual(next);
    }
  });

  it('repeats the only eligible game, and returns null when none is eligible', () => {
    expect(pickGame(ONE, 1, 3, 5, 1, 'alpha')!.id).toBe('alpha');
    expect(pickGame([], 1, 3, 5, 0, null)).toBeNull();
  });

  it('uses every eligible game over many seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) seen.add(pickGame(GAMES, 3, 8, seed, 0, null)!.id);
    expect([...seen].sort()).toEqual(['alpha', 'bravo', 'gamma']);
  });

  it('chains games without repeating while others are eligible', () => {
    let save = mustOk(enterRun(richSave(), T0, GAMES));
    let last = save.arena.run!.current!.gameId;
    for (let i = 0; i < 4; i++) {
      save = winOne(save);
      save = mustOk(pickBuff(save, T0, save.arena.run!.offers[0]!.id));
      save = mustOk(continueRun(save, T0, GAMES));
      const id = save.arena.run!.current!.gameId;
      expect(id).not.toBe(last);
      last = id;
    }
  });
});

describe('a win', () => {
  it('adds spoils scaled by the score and opens the lottery with three offers', () => {
    const save = mustOk(enterRun(richSave(), T0, GAMES));
    const lowScore = winOne(save, 100).arena.run!;
    const highScore = winOne(save, 900).arena.run!;
    expect(highScore.pending.coins).toBeGreaterThan(lowScore.pending.coins);
    expect(highScore.pending.wins).toBe(1);
    expect(highScore).toMatchObject({ phase: 'lottery', room: 1, current: null });
    expect(highScore.offers).toHaveLength(3);
    expect(new Set(highScore.offers.map((o) => o.id)).size).toBe(3);
    expect(highScore.lastGameId).toBe(save.arena.run!.current!.gameId);
    expect(highScore.games).toHaveLength(1);
    expect(highScore.games[0]).toMatchObject({ result: 'won', score: 900, room: 0 });
  });

  it('keeps the learned note of the game in the run and later in the log', () => {
    const save = mustOk(enterRun(richSave(), T0, ONE));
    const learned = { topic: { en: 'Rewards', fr: 'Récompenses' }, note: { en: 'A reward shapes behaviour.', fr: 'Une récompense façonne le comportement.' } };
    const won = mustOk(resolveGame(save, T0, { result: 'won', score: 500, learned }));
    expect(won.arena.run!.games[0]!.learned).toEqual(learned);
    const banked = mustOk(bankRun(won, T0, 'coins'));
    expect(banked.arena.log[0]!.games[0]!.learned).toEqual(learned);
  });

  it('drops a malformed learned note instead of trusting it', () => {
    const save = mustOk(enterRun(richSave(), T0, ONE));
    const bad = { topic: { en: 'x' }, note: 5 } as unknown as never;
    const won = mustOk(resolveGame(save, T0, { result: 'won', score: 500, learned: bad }));
    expect(won.arena.run!.games[0]!.learned).toBeUndefined();
  });

  it('clamps nonsense scores and treats an unknown result as leaving', () => {
    const save = mustOk(enterRun(richSave(), T0, ONE));
    expect(mustOk(resolveGame(save, T0, { result: 'won', score: 99999 })).arena.run!.games[0]!.score).toBe(1000);
    expect(mustOk(resolveGame(save, T0, { result: 'won', score: Number.NaN })).arena.run!.games[0]!.score).toBe(0);
    const weird = resolveGame(save, T0, { result: 'draw' as unknown as 'won', score: 10 });
    expect(weird.save.arena.run).toBeNull();
    expect(weird.save.arena.log[0]!.end).toBe('fled');
  });

  it('refuses an outcome when no game is in progress, so a double apply cannot pay twice', () => {
    const save = mustOk(enterRun(richSave(), T0, GAMES));
    const won = winOne(save);
    expect(resolveGame(won, T0, { result: 'won', score: 500 }).error).toBe('no game in progress');
    expect(resolveGame(richSave(), T0, { result: 'won', score: 500 }).error).toBe('no game in progress');
  });

  it('ends the chain at the last room with no offers: only banking remains', () => {
    let save = mustOk(enterRun(richSave(), T0, GAMES));
    const max = arenaContent.run.maxRooms;
    for (let i = 0; i < max; i++) {
      save = winOne(save);
      if (i < max - 1) {
        save = mustOk(pickBuff(save, T0, save.arena.run!.offers[0]!.id));
        save = mustOk(continueRun(save, T0, GAMES));
      }
    }
    const run = save.arena.run!;
    expect(run).toMatchObject({ phase: 'decide', offers: [], room: max });
    expect(continueRun(save, T0, GAMES).error).toBe('chain complete');
    expect(bankRun(save, T0, 'coins').error).toBeUndefined();
  });

  it('raises the difficulty with the room and passes the buffs through the run context', () => {
    let save = mustOk(enterRun(richSave(), T0, GAMES));
    expect(runContext(save.arena.run!)).toMatchObject({ roomIndex: 0, difficulty: 1, buffs: [] });
    save = winOne(save);
    const picked = save.arena.run!.offers[1]!;
    save = mustOk(pickBuff(save, T0, picked.id));
    save = mustOk(continueRun(save, T0, GAMES));
    const ctx = runContext(save.arena.run!)!;
    expect(ctx.roomIndex).toBe(1);
    expect(ctx.buffs).toEqual([picked]);
    for (let i = 0; i < 3; i++) {
      save = winOne(save);
      save = mustOk(pickBuff(save, T0, save.arena.run!.offers[0]!.id));
      save = mustOk(continueRun(save, T0, GAMES));
    }
    expect(runContext(save.arena.run!)).toMatchObject({ roomIndex: 4, difficulty: 3 });
    expect(runContext({ ...save.arena.run!, current: null })).toBeNull();
  });
});

describe('the lottery pick', () => {
  it('keeps exactly the chosen buff, closes the offers and moves to decide', () => {
    const save = winOne(mustOk(enterRun(richSave(), T0, GAMES)));
    const offers = save.arena.run!.offers;
    const r = pickBuff(save, T0, offers[2]!.id);
    expect(r.error).toBeUndefined();
    expect(r.save.arena.run).toMatchObject({ phase: 'decide', offers: [], buffs: [offers[2]] });
    expect(r.events).toEqual([{ type: 'arenaBuffPicked', runId: 'r1', buffId: offers[2]!.id }]);
  });

  it('refuses a buff that was not offered and a pick outside the lottery', () => {
    const save = winOne(mustOk(enterRun(richSave(), T0, GAMES)));
    expect(pickBuff(save, T0, 'attack-s@0-nope').error).toBe('not on offer');
    expect(pickBuff(mustOk(enterRun(richSave(), T0, GAMES)), T0, 'x').error).toBe('no lottery open');
  });

  it('refuses to continue before a buff is picked, and outside a run', () => {
    const save = winOne(mustOk(enterRun(richSave(), T0, GAMES)));
    expect(continueRun(save, T0, GAMES).error).toBe('nothing to continue');
    expect(continueRun(richSave(), T0, GAMES).error).toBe('nothing to continue');
  });

  it('keeps the run when no game is listed any more, so the player can still bank', () => {
    let save = winOne(mustOk(enterRun(richSave(), T0, GAMES)));
    save = mustOk(pickBuff(save, T0, save.arena.run!.offers[0]!.id));
    const r = continueRun(save, T0, []);
    expect(r.error).toBe('no games');
    expect(r.save.arena.run!.phase).toBe('decide');
    expect(bankRun(r.save, T0, 'coins').error).toBeUndefined();
  });
});

describe('a loss', () => {
  function afterTwoWins(): SaveFile {
    let save = mustOk(enterRun(richSave(), T0, GAMES));
    for (let i = 0; i < 2; i++) {
      save = winOne(save);
      save = mustOk(pickBuff(save, T0, save.arena.run!.offers[0]!.id));
      save = mustOk(continueRun(save, T0, GAMES));
    }
    return save;
  }

  it('ends the run, clears every buff, keeps gear and earlier banked rewards, and carries a share of the spoils home', () => {
    const save = afterTwoWins();
    save.arena.gear.move.weapon = 'practice_baton';
    save.arena.defense = { period: save.week.index, amount: 3 };
    save.arena.stash = ['moonlit_pike'];
    const pending = save.arena.run!.pending.coins;
    expect(save.arena.run!.buffs).toHaveLength(2);
    const coinsBefore = save.player.coins;
    const r = resolveGame(save, T0, { result: 'lost', score: 120 });
    expect(r.error).toBeUndefined();
    const after = r.save;
    expect(after.arena.run).toBeNull();
    expect(after.player.coins).toBe(coinsBefore + Math.floor(pending * arenaContent.run.carryHome));
    expect(after.arena.gear.move.weapon).toBe('practice_baton');
    expect(after.arena.defense).toEqual({ period: save.week.index, amount: 3 });
    expect(after.arena.stash).toEqual(['moonlit_pike']);
    const rec = after.arena.log[0]!;
    expect(rec).toMatchObject({ id: 'r1', end: 'lost', bank: null, wins: 2, defense: 0, itemId: null });
    expect(rec.games.map((g) => g.result)).toEqual(['won', 'won', 'lost']);
    expect(after.arena.stats).toMatchObject({ runs: 1, gamesWon: 2, gamesLost: 1, bestChain: 2 });
    expect(r.events.map((e) => e.type)).toEqual(['arenaGameResolved', 'arenaRunEnded']);
  });

  it('leaving a game ends the run the same way (fled)', () => {
    const save = afterTwoWins();
    const r = abandonRun(save, T0);
    expect(r.save.arena.run).toBeNull();
    expect(r.save.arena.log[0]).toMatchObject({ end: 'fled', wins: 2 });
    expect(r.save.arena.stats.gamesLost).toBe(0);
  });

  it('a first-game loss costs the fee and nothing else', () => {
    const save = mustOk(enterRun(richSave(), T0, GAMES));
    const lost = mustOk(resolveGame(save, T0, { result: 'lost', score: 0 }));
    expect(lost.player.coins).toBe(1000 - entryFee(1, 'steady'));
    expect(lost.arena.run).toBeNull();
  });

  it('the next run starts clean: no buffs, room 0, a new id', () => {
    const lost = mustOk(resolveGame(afterTwoWins(), T0, { result: 'lost', score: 0 }));
    const next = mustOk(enterRun(lost, T0, GAMES)).arena.run!;
    expect(next).toMatchObject({ id: 'r2', buffs: [], room: 0, pending: { coins: 0, wins: 0 } });
  });

  it('never touches streaks, loyalty, utilities, Domain Points, XP or the board', () => {
    const save = afterTwoWins();
    const lost = mustOk(resolveGame(save, T0, { result: 'lost', score: 0 }));
    expect({ ...lost.player, coins: 0 }).toEqual({ ...save.player, coins: 0 });
    expect(lost.vassals).toEqual(save.vassals);
    expect(lost.utilities).toEqual(save.utilities);
    expect(lost.stats).toEqual(save.stats);
    expect(lost.board).toEqual(save.board);
    expect(lost.week).toEqual(save.week);
    expect(lost.map).toEqual(save.map);
  });
});

describe('banking', () => {
  function atDecide(wins: number, score = 800): SaveFile {
    let save = mustOk(enterRun(richSave(), T0, GAMES));
    for (let i = 0; i < wins; i++) {
      save = winOne(save, score);
      if (i < wins - 1) {
        save = mustOk(pickBuff(save, T0, save.arena.run!.offers[0]!.id));
        save = mustOk(continueRun(save, T0, GAMES));
      }
    }
    return save;
  }

  it('offers nothing while a game is playing or with no run', () => {
    expect(bankOptions(mustOk(enterRun(richSave(), T0, GAMES)))).toBeNull();
    expect(bankOptions(richSave())).toBeNull();
    expect(bankRun(richSave(), T0, 'coins').error).toBe('nothing to bank');
  });

  it('coins: pays the spoils, ends the run, clears the buffs, logs it', () => {
    const save = atDecide(2);
    const pending = save.arena.run!.pending.coins;
    const before = save.player.coins;
    const r = bankRun(save, T0, 'coins');
    expect(r.error).toBeUndefined();
    expect(r.save.player.coins).toBe(before + pending);
    expect(r.save.arena.run).toBeNull();
    expect(r.save.arena.log[0]).toMatchObject({ end: 'banked', bank: 'coins', coins: pending, wins: 2 });
    expect(r.save.arena.stats.coinsBanked).toBe(pending);
    expect(r.events.map((e) => e.type)).toEqual(['arenaBanked', 'arenaRunEnded']);
    expect(r.save.log[r.save.log.length - 1]!.kind).toBe('arena');
  });

  it('can bank straight from the lottery without picking a buff', () => {
    const save = atDecide(1);
    expect(save.arena.run!.phase).toBe('lottery');
    expect(bankRun(save, T0, 'coins').error).toBeUndefined();
  });

  it('defense: one point per win, capped per period, never Domain Points or coins', () => {
    const save = atDecide(3);
    const r = bankRun(save, T0, 'defense');
    expect(r.error).toBeUndefined();
    expect(r.save.arena.defense).toEqual({ period: save.week.index, amount: 3 });
    expect(r.save.player.domainPoints).toBe(save.player.domainPoints);
    expect(r.save.player.coins).toBe(save.player.coins);
    expect(r.save.arena.log[0]).toMatchObject({ bank: 'defense', defense: 3, coins: 0 });
    // A second run in the same period tops up, then hits the cap.
    const again = atDecide(5);
    again.arena.defense = r.save.arena.defense;
    const second = bankRun(again, T0, 'defense');
    expect(second.save.arena.defense!.amount).toBe(arenaContent.bank.defenseCapPerPeriod);
    const third = atDecide(2);
    third.arena.defense = { period: third.week.index, amount: arenaContent.bank.defenseCapPerPeriod };
    expect(bankRun(third, T0, 'defense').error).toBe('defense capped');
    expect(bankOptions(third)!.defense).toBe(0);
  });

  it('a defense bonus banked for an older period is replaced, not added', () => {
    const save = atDecide(2);
    save.arena.defense = { period: save.week.index - 1, amount: 5 };
    expect(bankOptions(save)!.defense).toBe(2);
  });

  it('rare item: needs enough wins, goes to the stash, never twice the same', () => {
    expect(bankRun(atDecide(2), T0, 'item').error).toBe('chain too short');
    const save = atDecide(3);
    expect(bankOptions(save)!.item).toBe(true);
    const r = bankRun(save, T0, 'item');
    expect(r.error).toBeUndefined();
    expect(r.save.arena.stash).toHaveLength(1);
    expect(r.save.arena.log[0]).toMatchObject({ bank: 'item', itemId: r.save.arena.stash[0] });
    const all = arenaContent.armory.items.filter((i) => i.rare === true).map((i) => i.id);
    const full = atDecide(3);
    full.arena.stash = [...all];
    expect(bankOptions(full)!.item).toBe(false);
    expect(bankRun(full, T0, 'item').error).toBe('no rare item left');
    // Items worn count as owned too.
    const worn = atDecide(3);
    worn.arena.gear.move.weapon = 'moonlit_pike';
    worn.arena.stash = all.filter((id) => id !== 'moonlit_pike' && id !== 'ladle_of_ages');
    const got = bankRun(worn, T0, 'item');
    expect(got.save.arena.stash).toContain('ladle_of_ages');
    expect(got.save.arena.stash).not.toContain('moonlit_pike');
  });

  it('the item pick is deterministic for the run', () => {
    const a = bankRun(atDecide(3), T0, 'item').save.arena.stash;
    const b = bankRun(atDecide(3), T0, 'item').save.arena.stash;
    expect(a).toEqual(b);
  });

  it('input is never mutated by banking or by a loss', () => {
    const save = deepFreeze(atDecide(3));
    expect(() => bankRun(save, T0, 'item')).not.toThrow();
    expect(() => bankRun(save, T0, 'defense')).not.toThrow();
    const playing = deepFreeze(mustOk(enterRun(richSave(), T0, GAMES)));
    expect(() => resolveGame(playing, T0, { result: 'lost', score: 0 })).not.toThrow();
  });

  it('keeps the run log to its limit, newest last', () => {
    let save = richSave(100_000);
    for (let i = 0; i < arenaContent.log.keep + 5; i++) {
      save = mustOk(enterRun(save, T0, ONE));
      save = mustOk(abandonRun(save, T0));
    }
    expect(save.arena.log).toHaveLength(arenaContent.log.keep);
    expect(save.arena.log[save.arena.log.length - 1]!.id).toBe(`r${arenaContent.log.keep + 5}`);
  });
});

describe('the banked defense reaches the wave', () => {
  function withBank(amount: number): SaveFile {
    const save = fresh();
    save.arena.defense = { period: save.week.index, amount };
    return save;
  }

  it('adds one arena term for the period it was banked in, and only that one', () => {
    const save = withBank(4);
    expect(waveDefense(save).breakdown.arena).toBe(4);
    expect(waveDefense(save, save.week.index + 1).breakdown.arena).toBe(0);
    const base = waveDefense(fresh());
    expect(waveDefense(save).total).toBe(base.total + 4);
  });

  it('is spent by the settlement, and the record shows it', () => {
    const save = withBank(4);
    save.vassals.move.trust = 3;
    const settled = settleWave(save, 0, T0, save.lastOpenDay + 7).save;
    expect(settled.week.history[0]!.breakdown.arena).toBe(4);
    expect(settled.arena.defense).toBeNull();
    expect(settled.week.history[0]!.log.some((l) => l.includes('Arena spoils'))).toBe(true);
  });

  it('a quiet week (no trust) keeps the bonus for the next wave', () => {
    const save = withBank(4);
    const settled = settleWave(save, 0, T0, save.lastOpenDay + 7).save;
    expect(settled.week.history[0]!.result).toBe('quiet');
    expect(settled.week.history[0]!.breakdown.arena).toBe(0);
    expect(settled.arena.defense).toEqual({ period: 1, amount: 4 });
  });

  it('Domain Points come only from the wave result: a quiet week gets none, and a real wave gets at most the next result up', () => {
    const quiet = settleWave(withBank(6), 0, T0, 10).save;
    expect(quiet.player.domainPoints).toBe(0);
    // One trust point, attack 18: defense 16 (a win) becomes decisive only with enough Arena defense.
    const base = fresh();
    base.vassals.move.trust = 1;
    base.vassals.move.level = 5;
    const plain = settleWave(base, 0, T0, 10).save.week.history[0]!;
    const boosted = base;
    boosted.arena.defense = { period: 0, amount: 6 };
    const withArena = settleWave(boosted, 0, T0, 10).save.week.history[0]!;
    expect(withArena.defense - plain.defense).toBe(6);
    expect(withArena.dpAwarded).toBeGreaterThanOrEqual(plain.dpAwarded);
    // The one route from the Arena to Domain Points is the wave's own result, capped at +6 defense per period.
    expect(withArena.dpAwarded - plain.dpAwarded).toBeLessThanOrEqual(7);
  });

  it('a stale bonus from an older period is dropped when a later wave settles', () => {
    const save = fresh();
    save.arena.defense = { period: 0, amount: 4 };
    save.vassals.move.trust = 2;
    const settled = settleWave(save, 3, T0, 30).save;
    expect(settled.arena.defense).toBeNull();
    expect(settled.week.history[0]!.breakdown.arena).toBe(0);
  });
});

describe('requests and runs share the sequence counter', () => {
  it('request ids and run ids never collide', () => {
    let save = richSave();
    save = mustOk(requestGame(save, T0, 'A game about gardening and patience'));
    save = mustOk(enterRun(save, T0, ONE));
    expect(save.arena.requests[0]!.id).toBe('q1');
    expect(save.arena.run!.id).toBe('r2');
  });
});

describe('the daily suggestion and a changed reset hour', () => {
  it('counts runs from their start times, so moving the reset hour cannot shift them', () => {
    let save = richSave();
    save = mustOk(enterRun(save, T0, ONE));
    save = mustOk(abandonRun(save, T0));
    const day = save.lastOpenDay;
    expect(runsToday(save, day)).toBe(1);
    expect(overDailySuggestion(save, day)).toBe(false);
    save = { ...save, settings: { ...save.settings, resetHour: 0 } };
    // 12:00 UTC is the same real day under both reset hours.
    expect(runsToday(save, day)).toBe(1);
  });

  it('the suggestion appears after the suggested number of runs and never blocks one', () => {
    let save = richSave(10_000);
    for (let i = 0; i < arenaContent.run.suggestedRunsPerDay; i++) {
      save = mustOk(enterRun(save, T0, ONE));
      save = mustOk(abandonRun(save, T0));
    }
    expect(overDailySuggestion(save, save.lastOpenDay)).toBe(true);
    expect(enterRun(save, T0, ONE).error).toBeUndefined();
  });
});

/**
 * The host against every game the registry lists (the dev-only sample included):
 * each one is played headlessly with the Lab's bot, with the party and run the
 * Arena would build, and its outcome must be one the host accepts and the
 * engine can apply. It keeps working as games merge: a new game is covered
 * the moment its folder exists.
 */
import { describe, expect, it } from 'vitest';
import { buildParty, enterRun, resolveGame, type GameCandidate } from '../../../game';
import { createNewSave } from '../../../game';
import { fitParty, type Locale } from '../../../games/contract';
import { listGames } from '../../../games/registry';
import { playToEnd } from '../../../games/testing/play';
import { outcomeProblems } from '../../../games/testing/validate';
import { resolveHostOutcome } from './outcome';

const games = listGames({ includeDev: true });
const NOW = Date.UTC(2026, 0, 5, 12);

function strongSave() {
  const save = createNewSave(NOW, 'Bots');
  save.player.coins = 1000;
  save.player.ring = 7;
  save.player.highestRing = 7;
  for (const v of Object.values(save.vassals)) {
    v.level = 8;
    v.loyalty = 70;
  }
  return save;
}

describe('every registered game through the host', () => {
  it('lists at least the dev-only sample game when dev games are included', () => {
    expect(games.length).toBeGreaterThanOrEqual(1);
  });

  it.each(games.map((g) => [g.manifest.id, g] as const))('%s: a bot play ends in an outcome the host accepts and the engine applies', (_id, game) => {
    const save = strongSave();
    const candidate: GameCandidate = { id: game.manifest.id, minRing: game.manifest.minRing, rosterMin: game.manifest.rosterSize.min };
    const entered = enterRun(save, NOW, [candidate]);
    expect(entered.error).toBeUndefined();
    const run = entered.save.arena.run!;
    const party = fitParty(buildParty(entered.save), game.manifest);
    expect(party.members.length).toBeGreaterThanOrEqual(game.manifest.rosterSize.min);
    expect(party.members.length).toBeLessThanOrEqual(game.manifest.rosterSize.max);
    for (const locale of ['en', 'fr'] as Locale[]) {
      const played = playToEnd(game, run.current!.seed, party, { buffs: [], roomIndex: 0, difficulty: run.current!.difficulty }, 20000, { locale });
      expect(played.outcome, `${game.manifest.id} (${locale}) ended`).not.toBeNull();
      const ids = party.members.map((m) => m.id);
      expect(outcomeProblems(played.outcome, ids)).toEqual([]);
      const hosted = resolveHostOutcome(played.outcome, ids);
      expect(hosted.problems).toEqual([]);
      const applied = resolveGame(entered.save, NOW, { result: hosted.outcome.result, score: hosted.outcome.score, ...(hosted.outcome.learned ? { learned: hosted.outcome.learned } : {}) });
      expect(applied.error).toBeUndefined();
    }
  });
});

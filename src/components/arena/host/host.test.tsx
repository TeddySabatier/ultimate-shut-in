import { describe, expect, it } from 'vitest';
import { applyRunOutcome, startRun } from '../../../game';
import { clone } from '../../../game/draft';
import { emptyRun, fitParty } from '../../../games/contract';
import { parties } from '../../../games/testing/fixtures';
import { playToEnd } from '../../../games/testing/play';
import { outcomeProblems } from '../../../games/testing/validate';
import { currentSave, seedStore } from '../../../test/storeUtils';
import { listGames } from './catalog';
import { resolveHostOutcome } from './outcome';

describe('Arena host outcomes', () => {
  it('every registered game’s bot returns an Outcome the host can apply', () => {
    const games = listGames({ includeDev: true });
    expect(games.length).toBeGreaterThan(0);
    for (const game of games) {
      const party = fitParty(parties.full, game.manifest);
      const played = playToEnd(game, 7, party, emptyRun(1));
      expect(played.outcome, game.manifest.id).not.toBeNull();
      const ids = party.members.map((m) => m.id);
      expect(outcomeProblems(played.outcome, ids), game.manifest.id).toEqual([]);
      const resolved = resolveHostOutcome(played.outcome, game.manifest.id, ids);
      expect(resolved.invalid, game.manifest.id).toBe(false);
      expect(resolved.input.result).toMatch(/^(won|lost|fled)$/);

      seedStore();
      const save = clone(currentSave());
      save.player.coins = 500;
      const started = startRun(save, Date.now());
      expect(started.error).toBeUndefined();
      const applied = applyRunOutcome(started.save, resolved.input, Date.now());
      expect(applied.error, game.manifest.id).toBeUndefined();
    }
  });

  it('treats an invalid outcome as fled with score 0', () => {
    const resolved = resolveHostOutcome({ result: 'won', score: -3, log: [], troopsUsed: ['nope'] } as never, 'sample', ['move']);
    expect(resolved.invalid).toBe(true);
    expect(resolved.input).toEqual({ gameId: 'sample', result: 'fled', score: 0 });
  });
});

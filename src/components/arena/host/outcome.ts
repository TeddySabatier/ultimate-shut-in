/**
 * Never trust a game's answer (docs/design/ARENA.md 7.4). A game hands the
 * host an `Outcome`; the host validates it with the contract kit's
 * `outcomeProblems` before the engine sees it. An invalid one is logged and
 * becomes a `fled` outcome with score 0, so a buggy game can never pay.
 */
import { fledOutcome, type Outcome } from '../../../games/contract';
import { outcomeProblems } from '../../../games/testing/validate';

export interface HostOutcome {
  outcome: Outcome;
  /** What was wrong with the game's answer; empty when it was accepted as given. */
  problems: string[];
}

export function resolveHostOutcome(raw: unknown, partyIds: readonly string[], leftLine = 'Left the game.'): HostOutcome {
  const problems = outcomeProblems(raw as Outcome, partyIds);
  if (problems.length === 0) return { outcome: raw as Outcome, problems };
  console.error('[arena] invalid game outcome, treated as fled:', problems, raw);
  return { outcome: fledOutcome([leftLine]), problems };
}

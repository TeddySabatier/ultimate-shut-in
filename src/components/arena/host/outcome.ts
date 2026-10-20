/**
 * Host-side Outcome handling: validate with `outcomeProblems`, never trust an
 * invalid payload. Invalid results become a `fled` of score 0.
 */
import type { Outcome } from '../../../games/contract';
import { outcomeProblems } from '../../../games/testing/validate';
import type { RunOutcomeInput } from '../../../game';

export interface HostOutcome {
  input: RunOutcomeInput;
  /** True when the game's payload was replaced with a homecoming (fled, score 0). */
  invalid: boolean;
  problems: string[];
  learnedTopic?: string;
}

/** Map a Screen's Outcome into an engine input. Invalid payloads are logged as fled. */
export function resolveHostOutcome(outcome: Outcome | null | undefined, gameId: string, partyIds: readonly string[]): HostOutcome {
  const problems = outcomeProblems(outcome, partyIds);
  if (problems.length > 0 || !outcome) {
    return {
      input: { gameId, result: 'fled', score: 0 },
      invalid: true,
      problems: problems.length > 0 ? problems : ['outcome missing'],
    };
  }
  const learnedTopic = outcome.learned?.topic.en;
  return {
    input: {
      gameId,
      result: outcome.result,
      score: outcome.score,
      ...(learnedTopic ? { learnedTopic } : {}),
    },
    invalid: false,
    problems: [],
    ...(learnedTopic ? { learnedTopic } : {}),
  };
}

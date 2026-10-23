/**
 * Every installed subject deck, by id. Adding a subject: write
 * `src/games/shared/decks/<subject>.ts` from `docs/learning/sources/<subject>.md`,
 * add its id to `SUBJECT_IDS` in `schema.ts`, list it here. `decks.test.ts`
 * validates every deck listed.
 */
import { EBPF_DECK } from './ebpf';
import { KUBERNETES_DECK } from './kubernetes';
import type { Card, Deck, SubjectId } from './schema';

export const DECKS: Readonly<Record<SubjectId, Deck>> = {
  kubernetes: KUBERNETES_DECK,
  ebpf: EBPF_DECK,
};

const BY_ID: Readonly<Record<string, Card>> = Object.fromEntries(Object.values(DECKS).flatMap((d) => d.cards.map((c) => [c.id, c])));

/** One card by id, or undefined. */
export function getCard(id: string): Card | undefined {
  return BY_ID[id];
}

/** The cards of the given subjects, in deck order. */
export function cardsOf(subjects: readonly SubjectId[]): Card[] {
  return subjects.flatMap((s) => DECKS[s]?.cards ?? []);
}

export * from './schema';

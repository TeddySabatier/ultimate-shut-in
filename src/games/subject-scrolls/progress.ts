/**
 * The player's study table across runs: which decks are selected and what
 * each card did last time. Pure parsing and merging; the Screen reads and
 * writes it under the game's own localStorage key (v1, no SaveFile change).
 */
// eslint-disable-next-line no-restricted-imports -- src/games/shared holds cross-game helpers (CONTRACT.md section 2); eslint.config.js does not list it yet, see docs/review/notes/game-subject-scrolls.md
import { DECKS, SUBJECT_IDS, type SubjectId } from '../shared/decks';
import type { CardHistory, ScrollState } from './engine';

/** The game's own storage key (see the notes file for the Armory "Study table" follow-up). */
export const STORAGE_KEY = 'haven.games.subject-scrolls';

export interface Stored {
  v: 1;
  decks: SubjectId[];
  cards: Record<string, { seen: number; wrongs: number; lastRight: boolean }>;
}

export function emptyStored(): Stored {
  return { v: 1, decks: [...SUBJECT_IDS], cards: {} };
}

/** A `Stored` from the raw JSON text, tolerant of junk; every subject selected when nothing valid is stored. */
export function parseStored(raw: string | null): Stored {
  if (!raw) return emptyStored();
  try {
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || typeof parsed !== 'object') return emptyStored();
    const wanted = Array.isArray(parsed.decks) ? (parsed.decks as unknown[]) : [];
    const decks = SUBJECT_IDS.filter((s) => wanted.includes(s));
    const cards: Stored['cards'] = {};
    if (parsed.cards && typeof parsed.cards === 'object') {
      for (const [id, v] of Object.entries(parsed.cards as Record<string, Partial<Stored['cards'][string]>>)) {
        if (v && typeof v === 'object' && Number.isFinite(v.seen) && Number.isFinite(v.wrongs)) {
          cards[id] = { seen: Number(v.seen), wrongs: Number(v.wrongs), lastRight: Boolean(v.lastRight) };
        }
      }
    }
    return { v: 1, decks: decks.length > 0 ? decks : [...SUBJECT_IDS], cards };
  } catch {
    return emptyStored();
  }
}

export function historyOf(stored: Stored): CardHistory[] {
  return Object.entries(stored.cards).map(([id, c]) => ({ id, ...c }));
}

/** Fold a finished run into the stored progress (the run's decks become the selection). */
export function mergeRun(stored: Stored, state: ScrollState): Stored {
  const cards = { ...stored.cards };
  const last = new Map<string, number>();
  for (const m of state.marks) last.set(m.id, m.credit);
  for (const p of state.progress) {
    const prev = cards[p.id] ?? { seen: 0, wrongs: 0, lastRight: false };
    cards[p.id] = { seen: prev.seen + p.shows, wrongs: prev.wrongs + p.wrongs, lastRight: (last.get(p.id) ?? 0) >= 0.5 };
  }
  return { v: 1, decks: state.decks, cards };
}

/** Cards of a deck the player has read, and those settled (right last time, seen at least twice). */
export function deckStats(stored: Stored, subject: SubjectId): { total: number; seen: number; mastered: number } {
  const deck = DECKS[subject];
  let seen = 0;
  let mastered = 0;
  for (const c of deck.cards) {
    const h = stored.cards[c.id];
    if (!h || h.seen === 0) continue;
    seen += 1;
    if (h.lastRight && h.seen >= 2) mastered += 1;
  }
  return { total: deck.cards.length, seen, mastered };
}

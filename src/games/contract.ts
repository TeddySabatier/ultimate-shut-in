/**
 * The mini-game plug-in contract (docs/design/games/CONTRACT.md).
 *
 * Types only, plus a few tiny pure helpers. Every game under
 * `src/games/<id>/` implements `GameModule`; the Arena (and the Games Lab)
 * talk to a game only through these types. A game never imports the Haven
 * store, the screens or the router: it receives a `Party` and a `RunContext`
 * and answers with an `Outcome`.
 *
 * Nothing in this file may import React or touch the DOM: it is loaded with
 * every manifest.
 */
import { fnv1a, mulberry32, type Rng } from '../game/rng';
import type { HabitId } from '../game/types';

// ---------------------------------------------------------------------------
// Identity and text
// ---------------------------------------------------------------------------

/** Kebab-case id, equal to the game's folder name: `roguelike-chess`. */
export type GameId = string;

/** Kebab-case: lowercase letters and digits, single dashes, starts with a letter. */
export const GAME_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Folder names under `src/games/` that are not games. A game id may not be one of these. */
export const RESERVED_FOLDERS: readonly string[] = ['lab', 'testing', 'ui', 'host', 'shared'];

/** Listing order of the categories (the Arena and the Lab sort by it). */
export const GAME_CATEGORIES = ['strategy', 'ai-learning', 'self-development', 'puzzle', 'arcade', 'defense'] as const;
export type GameCategory = 'strategy' | 'ai-learning' | 'self-development' | 'puzzle' | 'arcade' | 'defense';

export const LOCALES = ['en', 'fr'] as const;
export type Locale = 'en' | 'fr';

/** One piece of player-facing text in every supported language. */
export type LocalizedText = { en: string; fr: string };

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface GameManifest {
  /** Kebab-case, equal to the folder name. */
  id: GameId;
  /** Shown on the Arena card and the Lab list. At most 32 characters. */
  name: LocalizedText;
  /** One line under the name. At most 100 characters. */
  tagline: LocalizedText;
  category: GameCategory;
  /** The ring the player must have reached before the Arena offers the game. */
  minRing: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** How many party members the game uses. `1 <= min <= 3`, `min <= max <= 8`. */
  rosterSize: { min: number; max: number };
  /** Typical length of one game, in minutes, 1 to 5. */
  estMinutes: number;
  /** Every game honours `GameScreenProps.reducedMotion`; this is a promise, not a flag. */
  supportsReducedMotion: true;
  /** What the player practises. Required for the `ai-learning` category. */
  learning?: { skill: LocalizedText; concepts: string[] };
  /** Hidden from the Arena (`listGames()`); still listed in the Games Lab. */
  devOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Party: the troops the player brings
// ---------------------------------------------------------------------------

export interface PartyMember {
  /** Stable id. Vassals use their habit id (`move`); later citizens use their own ids. */
  id: string;
  /** Display name (`Pell`). Never translated. */
  name: string;
  /** The habit this member stands for; `null` for members that are not vassals. */
  habit: HabitId | null;
  /** 1 to 30. */
  level: number;
  /** 0 to 100. */
  loyalty: number;
  /** 1 to 100, derived: `derivePower(level, loyalty)`. Games read it, never recompute it. */
  power: number;
  /** Ids of earned titles (`src/game/content/titles.json`) the member carries, for passives. */
  traits: string[];
}

export interface Party {
  members: PartyMember[];
}

/** Power of a member: three points per level plus a loyalty bonus (up to 10), clamped to 1..100. */
export function derivePower(level: number, loyalty: number): number {
  const raw = Math.round(level * 3 + loyalty / 10);
  return Math.max(1, Math.min(100, raw));
}

/** Build a member with its derived power. */
export function makeMember(m: Omit<PartyMember, 'power' | 'traits'> & { traits?: string[] }): PartyMember {
  return { id: m.id, name: m.name, habit: m.habit, level: m.level, loyalty: m.loyalty, power: derivePower(m.level, m.loyalty), traits: m.traits ?? [] };
}

/**
 * The party a game actually receives: the first `rosterSize.max` members.
 * The host calls this before mounting the game; the contract tests do the same.
 */
export function fitParty(party: Party, manifest: Pick<GameManifest, 'rosterSize'>): Party {
  return { members: party.members.slice(0, manifest.rosterSize.max) };
}

// ---------------------------------------------------------------------------
// Run: the Arena run the game is played in
// ---------------------------------------------------------------------------

export const BUFF_KINDS = ['attack', 'defense', 'time', 'hint', 'revive', 'luck'] as const;
export type RunBuffKind = 'attack' | 'defense' | 'time' | 'hint' | 'revive' | 'luck';

/**
 * A buff won in the Arena lottery. Units of `amount` by kind:
 * attack, defense, luck: percentage points (15 means +15%); time: seconds;
 * hint, revive: a count.
 */
export interface RunBuff {
  id: string;
  kind: RunBuffKind;
  amount: number;
}

export interface RunContext {
  buffs: RunBuff[];
  /** 0 for the first game of a run, then 1, 2, ... */
  roomIndex: number;
  /** 1 (gentle) to 5 (hard). The Arena raises it with the room index. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

/** Sum of the amounts of every buff of `kind` (0 when there is none). */
export function buffAmount(run: RunContext, kind: RunBuffKind): number {
  let total = 0;
  for (const b of run.buffs) if (b.kind === kind) total += b.amount;
  return total;
}

/** A run with no buffs, first room. */
export function emptyRun(difficulty: RunContext['difficulty'] = 1): RunContext {
  return { buffs: [], roomIndex: 0, difficulty };
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export const GAME_RESULTS = ['won', 'lost', 'fled'] as const;
export type GameResult = 'won' | 'lost' | 'fled';

export const MAX_SCORE = 1000;

export interface Outcome {
  result: GameResult;
  /** Integer, 0 to 1000. */
  score: number;
  /** What happened, one line per entry, for the results panel. Non-empty strings. */
  log: string[];
  /** Ids of the party members that took part (a subset of `party.members[].id`). */
  troopsUsed: string[];
  /** Wall time of the game; set by the Screen (`useEngine` does it), never by the engine. */
  durationMs?: number;
  /** One thing the player learned, for learning games. */
  learned?: { topic: LocalizedText; note: LocalizedText };
  /** Free numbers or words for the results panel. */
  stats?: Record<string, number | string>;
}

/** Clamp and round a raw score into the 0..1000 integer range. */
export function clampScore(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.round(raw)));
}

/** The outcome a host records when the player leaves (`onExit`) before the game ended. */
export function fledOutcome(log: string[] = ['Left the game.']): Outcome {
  return { result: 'fled', score: 0, log, troopsUsed: [] };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * The pure rules of a game. `S` and `A` must be plain JSON data (no functions,
 * classes, Map, Set, Date). Every function is pure: same input, same output,
 * input never mutated, no `Math.random`, no clock, no storage, no DOM.
 *
 * Real-time games model time as a `tick` action with a fixed step
 * (`FIXED_DT_MS`); the Screen dispatches ticks, the engine never reads a clock.
 */
export interface GameEngine<S, A> {
  /**
   * The starting state. All randomness derives from `seed` (see `turnRng`).
   * `locale` is the player's language: an engine whose content depends on it
   * (word lists, passages) uses it; any other engine ignores it, and may
   * declare only three parameters. Never read `navigator` instead. Every
   * caller passes it; tests default to 'en' and also play 'fr'.
   */
  initial(seed: number, party: Party, run: RunContext, locale: Locale): S;
  /** Apply one action. Invalid actions, and any action once the game is over, return the state unchanged; never throw. */
  reduce(state: S, action: A): S;
  /** `null` while the game is running; the final outcome once it is over (and from then on). */
  outcome(state: S): Outcome | null;
  /**
   * The next action of a simple competent bot, or `null` when the game is over.
   * It exists so the contract tests and the Lab can play any game headlessly.
   * Use `rng` for the bot's own choices (never `Math.random`).
   */
  botPlay(state: S, rng: () => number): A | null;
  /**
   * Optional: the game's own leave action for `state` (for example
   * `{ type: 'forfeit' }`). Reducing it must end the game as `fled` with a
   * valid outcome (a partial score is fine). The contract kit plays it on a
   * game in progress and validates that outcome, since the bot never leaves.
   */
  forfeit?(state: S): A;
}

/** Fixed time step for real-time games: one `tick` action is 50 ms of game time. */
export const FIXED_DT_MS = 50;

/**
 * A fresh PRNG for one step of the game, derived from the state's seed and a
 * step counter kept in the state. Use it inside `reduce` so the state holds
 * only numbers, never a generator: `const rng = turnRng(state.seed, state.turn)`.
 */
export function turnRng(seed: number, step: number): Rng {
  return mulberry32(fnv1a(`${seed >>> 0}:${step}`));
}

// ---------------------------------------------------------------------------
// Strings and Screen
// ---------------------------------------------------------------------------

/** The game's own text, same key tree in both languages. Leaves are strings or arrays of strings. */
export type GameStrings = { en: Record<string, unknown>; fr: Record<string, unknown> };

/**
 * Type-checks that `fr` has exactly the shape of `en` (a missing key is a
 * compile error): `export const strings = defineStrings({ en: {...}, fr: {...} })`.
 */
export function defineStrings<T extends Record<string, unknown>>(strings: { en: T; fr: NoInfer<T> }): { en: T; fr: T } {
  return strings;
}

/** Replace `{name}` placeholders: `formatText('Round {n}', { n: 2 })`. Unknown placeholders stay as written. */
export function formatText(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = params[key];
    return v === undefined ? whole : String(v);
  });
}

/** Pick the text for a locale. */
export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale];
}

/** What the host gives the game's Screen. Props are read once at mount; the host remounts for a new game. */
export interface GameScreenProps {
  party: Party;
  seed: number;
  run: RunContext;
  locale: 'en' | 'fr';
  /** True when the player or the OS asks for reduced motion: no movement, same layout. */
  reducedMotion: boolean;
  /** Call exactly once, when the engine's outcome becomes non-null (`useEngine` does it). */
  onFinish(outcome: Outcome): void;
  /** The player leaves. If `onFinish` was not called yet, the host records `fledOutcome()`. */
  onExit(): void;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/** What `src/games/<id>/manifest.ts` exports by default. The Screen is loaded separately and lazily. */
export interface GameModule<S = unknown, A = unknown> {
  manifest: GameManifest;
  engine: GameEngine<S, A>;
  strings: GameStrings;
}

/** Identity helper so `S` and `A` are inferred from the engine: `export default defineGame({ ... })`. */
export function defineGame<S, A>(module: GameModule<S, A>): GameModule<S, A> {
  return module;
}

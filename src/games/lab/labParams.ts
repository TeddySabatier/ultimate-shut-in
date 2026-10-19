/**
 * The Games Lab keeps every setting in the URL so a link, an e2e spec or a
 * screenshot reproduces a game exactly:
 *
 *   #/lab/<id>?seed=7&lang=fr&party=starter&run=buffed&difficulty=4&rm=1
 *
 * party: full | starter | single | mixed (the fixtures); run: plain | buffed | hard;
 * difficulty: 1..5, overriding the run's own (plain and buffed are 2, hard is 5).
 */
import type { Locale, RunContext } from '../contract';

export const LAB_PARTIES = ['full', 'starter', 'single', 'mixed'] as const;
export const LAB_RUNS = ['plain', 'buffed', 'hard'] as const;
export type LabParty = (typeof LAB_PARTIES)[number];
export type LabRun = (typeof LAB_RUNS)[number];
export type Difficulty = RunContext['difficulty'];

export interface LabParams {
  seed: number | null;
  locale: Locale;
  party: LabParty;
  run: LabRun;
  /** `null`: the run's own difficulty. */
  difficulty: Difficulty | null;
  reducedMotion: boolean;
}

export interface LabEnv {
  /** `navigator.language`. */
  language: string;
  /** `prefers-reduced-motion: reduce`. */
  prefersReducedMotion: boolean;
}

export function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function parseLabParams(search: URLSearchParams, env: LabEnv): LabParams {
  const rawSeed = search.get('seed');
  const seed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed.trim()) ? Number(rawSeed) >>> 0 : null;
  const lang = search.get('lang');
  const rm = search.get('rm');
  const d = Number(search.get('difficulty'));
  return {
    seed,
    locale: lang === 'fr' || lang === 'en' ? lang : localeFromLanguage(env.language),
    party: oneOf(search.get('party'), LAB_PARTIES, 'full'),
    run: oneOf(search.get('run'), LAB_RUNS, 'plain'),
    difficulty: Number.isInteger(d) && d >= 1 && d <= 5 ? (d as Difficulty) : null,
    reducedMotion: rm === '1' ? true : rm === '0' ? false : env.prefersReducedMotion,
  };
}

export function toSearch(p: LabParams): URLSearchParams {
  const s = new URLSearchParams();
  if (p.seed !== null) s.set('seed', String(p.seed));
  s.set('lang', p.locale);
  s.set('party', p.party);
  s.set('run', p.run);
  if (p.difficulty !== null) s.set('difficulty', String(p.difficulty));
  s.set('rm', p.reducedMotion ? '1' : '0');
  return s;
}

/** The run the Lab plays: the fixture run, with the difficulty override applied. */
export function labRun(base: RunContext, difficulty: Difficulty | null): RunContext {
  return difficulty === null ? base : { ...base, difficulty };
}

/** A fresh seed for "New seed" (the Lab may use Math.random; engines never do). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** What the browser says, read safely. */
export function browserEnv(): LabEnv {
  const language = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { language, prefersReducedMotion };
}

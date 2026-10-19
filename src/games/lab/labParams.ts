/**
 * The Games Lab keeps every setting in the URL (`#/lab/<id>?seed=7&lang=fr&party=starter&run=buffed&rm=1`)
 * so a link, an e2e spec or a screenshot reproduces a game exactly.
 */
import type { Locale } from '../contract';

export interface LabParams {
  seed: number | null;
  locale: Locale;
  party: 'full' | 'starter';
  run: 'plain' | 'buffed';
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

export function parseLabParams(search: URLSearchParams, env: LabEnv): LabParams {
  const rawSeed = search.get('seed');
  const seed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed.trim()) ? Number(rawSeed) >>> 0 : null;
  const lang = search.get('lang');
  const rm = search.get('rm');
  return {
    seed,
    locale: lang === 'fr' || lang === 'en' ? lang : localeFromLanguage(env.language),
    party: search.get('party') === 'starter' ? 'starter' : 'full',
    run: search.get('run') === 'buffed' ? 'buffed' : 'plain',
    reducedMotion: rm === '1' ? true : rm === '0' ? false : env.prefersReducedMotion,
  };
}

export function toSearch(p: LabParams): URLSearchParams {
  const s = new URLSearchParams();
  if (p.seed !== null) s.set('seed', String(p.seed));
  s.set('lang', p.locale);
  s.set('party', p.party);
  s.set('run', p.run);
  s.set('rm', p.reducedMotion ? '1' : '0');
  return s;
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

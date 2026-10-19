import { describe, expect, it } from 'vitest';
import { runs } from '../testing/fixtures';
import { labRun, localeFromLanguage, parseLabParams, toSearch, type LabParams } from './labParams';

const env = { language: 'en-GB', prefersReducedMotion: false };

describe('lab params', () => {
  it('reads every setting from the query string', () => {
    const p = parseLabParams(new URLSearchParams('seed=42&lang=fr&party=starter&run=buffed&difficulty=4&rm=1'), env);
    expect(p).toEqual({ seed: 42, locale: 'fr', party: 'starter', run: 'buffed', difficulty: 4, reducedMotion: true });
  });

  it('accepts every fixture party and run', () => {
    for (const party of ['full', 'starter', 'single', 'mixed']) expect(parseLabParams(new URLSearchParams(`party=${party}`), env).party).toBe(party);
    for (const run of ['plain', 'buffed', 'hard']) expect(parseLabParams(new URLSearchParams(`run=${run}`), env).run).toBe(run);
    expect(parseLabParams(new URLSearchParams('party=everyone&run=nightmare'), env)).toMatchObject({ party: 'full', run: 'plain' });
  });

  it('falls back to the browser language and motion setting, full party, plain run, the run difficulty', () => {
    expect(parseLabParams(new URLSearchParams(''), { language: 'fr-CA', prefersReducedMotion: true })).toEqual({
      seed: null,
      locale: 'fr',
      party: 'full',
      run: 'plain',
      difficulty: null,
      reducedMotion: true,
    });
    expect(parseLabParams(new URLSearchParams('lang=de'), env).locale).toBe('en');
  });

  it('rejects seeds that are not unsigned integers and difficulties outside 1..5', () => {
    expect(parseLabParams(new URLSearchParams('seed=-3'), env).seed).toBeNull();
    expect(parseLabParams(new URLSearchParams('seed=1.5'), env).seed).toBeNull();
    expect(parseLabParams(new URLSearchParams('seed=abc'), env).seed).toBeNull();
    for (const d of ['0', '6', '2.5', 'x']) expect(parseLabParams(new URLSearchParams(`difficulty=${d}`), env).difficulty).toBeNull();
  });

  it('round-trips through toSearch', () => {
    const p: LabParams = { seed: 7, locale: 'en', party: 'mixed', run: 'hard', difficulty: 3, reducedMotion: false };
    expect(parseLabParams(toSearch(p), env)).toEqual(p);
    expect(parseLabParams(toSearch({ ...p, difficulty: null }), env).difficulty).toBeNull();
  });

  it('the difficulty overrides the run, other run fields stay', () => {
    expect(labRun(runs.buffed, 4)).toEqual({ ...runs.buffed, difficulty: 4 });
    expect(labRun(runs.hard, null)).toBe(runs.hard);
  });

  it('maps languages to locales', () => {
    expect(localeFromLanguage('FR')).toBe('fr');
    expect(localeFromLanguage('en-US')).toBe('en');
    expect(localeFromLanguage('')).toBe('en');
  });
});

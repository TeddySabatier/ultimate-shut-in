import { describe, expect, it } from 'vitest';
import { localeFromLanguage, parseLabParams, toSearch } from './labParams';

const env = { language: 'en-GB', prefersReducedMotion: false };

describe('lab params', () => {
  it('reads every setting from the query string', () => {
    const p = parseLabParams(new URLSearchParams('seed=42&lang=fr&party=starter&run=buffed&rm=1'), env);
    expect(p).toEqual({ seed: 42, locale: 'fr', party: 'starter', run: 'buffed', reducedMotion: true });
  });

  it('falls back to the browser language and motion setting, full party and plain run', () => {
    expect(parseLabParams(new URLSearchParams(''), { language: 'fr-CA', prefersReducedMotion: true })).toEqual({
      seed: null,
      locale: 'fr',
      party: 'full',
      run: 'plain',
      reducedMotion: true,
    });
    expect(parseLabParams(new URLSearchParams('lang=de'), env).locale).toBe('en');
  });

  it('rejects seeds that are not unsigned integers', () => {
    expect(parseLabParams(new URLSearchParams('seed=-3'), env).seed).toBeNull();
    expect(parseLabParams(new URLSearchParams('seed=1.5'), env).seed).toBeNull();
    expect(parseLabParams(new URLSearchParams('seed=abc'), env).seed).toBeNull();
  });

  it('round-trips through toSearch', () => {
    const p = { seed: 7, locale: 'en' as const, party: 'full' as const, run: 'buffed' as const, reducedMotion: false };
    expect(parseLabParams(toSearch(p), env)).toEqual(p);
  });

  it('maps languages to locales', () => {
    expect(localeFromLanguage('FR')).toBe('fr');
    expect(localeFromLanguage('en-US')).toBe('en');
    expect(localeFromLanguage('')).toBe('en');
  });
});

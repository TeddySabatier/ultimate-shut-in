import { describe, expect, it } from 'vitest';
import { gradeTyped, levenshtein, normalizeAnswer } from './typedAnswer';

describe('shared typed-answer checker', () => {
  it.each([
    ['café', 'café', true, 'right'],
    ['  CAFÉ ', 'café', true, 'right'],
    ['cafe', 'café', true, 'right'],
    ['cafe', 'café', false, 'almost'],
    ['oeuf', 'œuf', false, 'right'],
    ['eleve', 'élève', false, 'almost'],
    ['pommes', 'pomme', true, 'almost'],
    ['week end', 'week-end', true, 'almost'],
    ['', 'pomme', true, 'wrong'],
    ['zzzz', 'pomme', true, 'wrong'],
    ['kubectl', 'kubectl', true, 'right'],
    ['kubectl get pods', 'kubectl  get   pods', true, 'right'],
  ])('%s vs %s (strip %s) is %s', (got, want, strip, verdict) => {
    expect(gradeTyped(got, want, strip).verdict).toBe(verdict);
  });

  it('folds apostrophes, dashes and ligatures', () => {
    expect(normalizeAnswer('S’il te plaît', true)).toBe("s'il te plait");
    expect(normalizeAnswer('week—end', false)).toBe('week-end');
    expect(normalizeAnswer('Œuf', false)).toBe('oeuf');
  });

  it('computes edit distances', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

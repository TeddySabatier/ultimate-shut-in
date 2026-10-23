/**
 * The typed-answer checker, lifted from Word Forge: a forgiving but exact
 * comparison of what the player typed with the expected answer. Pure.
 */

export type Verdict = 'right' | 'almost' | 'wrong';

const APOSTROPHES = /['‘’ʼ`]/g;
const HYPHENS = /[‐-—−]/g;
const MARKS = /\p{M}/gu;

/** NFC, trim, collapse spaces, lower case, fold apostrophes, dashes and the ligatures oe/ae. Optionally strip accents. */
export function normalizeAnswer(raw: string, stripAccents: boolean): string {
  let s = raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  // Ligatures are not accents and are hard to type: oe/ae always count.
  s = s.replace(APOSTROPHES, "'").replace(HYPHENS, '-').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  if (stripAccents) {
    s = s.normalize('NFD').replace(MARKS, '').normalize('NFC');
  }
  return s;
}

/** Edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (cur[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      cur.push(Math.min(del, ins, sub));
    }
    prev = cur;
  }
  return prev[n] ?? n;
}

/**
 * Grade a typed answer: right when equal after normalisation; almost (half
 * credit) when only accents differ in strict mode, or when the expected text
 * has at least 3 characters and is one edit away; wrong otherwise. Empty is wrong.
 */
export function gradeTyped(answer: string, expected: string, stripAccents: boolean): { verdict: Verdict; credit: number } {
  const got = normalizeAnswer(answer, stripAccents);
  const want = normalizeAnswer(expected, stripAccents);
  if (got.length === 0) return { verdict: 'wrong', credit: 0 };
  if (got === want) return { verdict: 'right', credit: 1 };
  // Strict mode: the right letters with accents missing or wrong are "almost", however many accents.
  if (!stripAccents && normalizeAnswer(answer, true) === normalizeAnswer(expected, true)) return { verdict: 'almost', credit: 0.5 };
  if (want.length >= 3 && levenshtein(got, want) <= 1) return { verdict: 'almost', credit: 0.5 };
  return { verdict: 'wrong', credit: 0 };
}

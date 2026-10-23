/**
 * Plain text helpers shared by the Screen and the tests. The engine does not
 * import them: it reads the generated `meta.ts` instead.
 */

/** Split a passage into words (any run of whitespace separates two words). */
export function wordList(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Indices where a new sentence begins. A word that ends in `.`, `!` or `?`
 * (then an optional closing quote) ends a sentence; the next word starts one.
 */
export function sentenceStartsOf(words: readonly string[]): number[] {
  const starts = [0];
  for (let i = 0; i < words.length - 1; i++) {
    if (/[.!?]["»”’']?$/.test(words[i] ?? '')) starts.push(i + 1);
  }
  return starts;
}

/** Exclusive end index of the first sentence (the topic sentence). */
export function topicEndOf(words: readonly string[]): number {
  return sentenceStartsOf(words)[1] ?? words.length;
}

/**
 * Where the eye rests in a word (the "optimal recognition point"): a little
 * left of the middle. Showing every word with this letter on the same spot is
 * what makes one-word-at-a-time reading comfortable.
 */
export function pivotIndex(word: string): number {
  const letters = Array.from(word);
  const n = letters.length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

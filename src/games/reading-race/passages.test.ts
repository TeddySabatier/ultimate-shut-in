/**
 * The passages and questions are the heart of this game: counts, lengths,
 * answers, balance, parity between English and French, and the generated
 * `meta.ts` the engine reads (it must match the words exactly).
 */
import { describe, expect, it } from 'vitest';
import type { Locale } from '../contract';
import { META } from './meta';
import { MAX_WORDS, MIN_WORDS, OPTIONS_PER_QUESTION, PASSAGES, QUESTIONS_PER_PASSAGE } from './passages';
import { pivotIndex, sentenceStartsOf, topicEndOf, wordList } from './text';

const LOCALES: Locale[] = ['en', 'fr'];

describe('passages: counts and lengths', () => {
  it('has ten passages in each language, with unique ids', () => {
    for (const l of LOCALES) {
      expect(PASSAGES[l]).toHaveLength(10);
      expect(new Set(PASSAGES[l].map((p) => p.id)).size).toBe(10);
    }
  });

  it('keeps every passage between 110 and 170 words', () => {
    for (const l of LOCALES) {
      for (const p of PASSAGES[l]) {
        const n = wordList(p.text).length;
        expect(n, `${l}:${p.id}`).toBeGreaterThanOrEqual(MIN_WORDS);
        expect(n, `${l}:${p.id}`).toBeLessThanOrEqual(MAX_WORDS);
      }
    }
  });

  it('tags every passage with a reading level 1 to 3 and uses all three levels', () => {
    for (const l of LOCALES) {
      const levels = PASSAGES[l].map((p) => p.level);
      expect(levels.every((v) => v === 1 || v === 2 || v === 3)).toBe(true);
      for (const lv of [1, 2, 3]) expect(levels.filter((v) => v === lv).length, `${l} level ${lv}`).toBeGreaterThanOrEqual(2);
      // Difficulty 1 and 5 each draw three passages from one level, so each needs at least three.
      expect(levels.filter((v) => v === 1).length).toBeGreaterThanOrEqual(3);
      expect(levels.filter((v) => v === 3).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('is written as clean text: no double spaces, no dashes standing alone, capital letters start sentences', () => {
    for (const l of LOCALES) {
      for (const p of PASSAGES[l]) {
        expect(p.text, `${l}:${p.id}`).not.toMatch(/ {2}|\n/);
        expect(wordList(p.text).includes('-'), `${l}:${p.id}`).toBe(false);
        const words = wordList(p.text);
        for (const start of sentenceStartsOf(words)) {
          const first = Array.from(words[start]!)[0]!;
          expect(first === first.toUpperCase(), `${l}:${p.id} sentence at ${start} starts with "${words[start]}"`).toBe(true);
        }
        expect(p.text.trim().endsWith('.'), `${l}:${p.id} ends with a full stop`).toBe(true);
      }
    }
  });

  it('gives each passage a topic title', () => {
    for (const l of LOCALES) for (const p of PASSAGES[l]) expect(p.topic.length, `${l}:${p.id}`).toBeGreaterThan(5);
  });
});

describe('passages: questions', () => {
  it('has one literal, one inference and one detail question per passage, in that order', () => {
    for (const l of LOCALES) for (const p of PASSAGES[l]) expect(p.questions.map((q) => q.kind)).toEqual(['literal', 'inference', 'detail']);
  });

  it('gives every question four distinct options and exactly one correct answer', () => {
    for (const l of LOCALES) {
      for (const p of PASSAGES[l]) {
        expect(p.questions).toHaveLength(QUESTIONS_PER_PASSAGE);
        for (const q of p.questions) {
          expect(q.options).toHaveLength(OPTIONS_PER_QUESTION);
          expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(OPTIONS_PER_QUESTION);
          expect(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < OPTIONS_PER_QUESTION).toBe(true);
          for (const o of q.options) expect(o.trim().length, `${l}:${p.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('does not repeat a question prompt in a language', () => {
    for (const l of LOCALES) {
      const prompts = PASSAGES[l].flatMap((p) => p.questions.map((q) => q.prompt));
      expect(prompts).toHaveLength(30);
      expect(new Set(prompts).size).toBe(30);
    }
  });

  it('spreads the right answer over the four positions, so position gives nothing away', () => {
    for (const l of LOCALES) {
      const counts = [0, 0, 0, 0];
      for (const p of PASSAGES[l]) for (const q of p.questions) counts[q.correct]! += 1;
      for (const c of counts) {
        expect(c, `${l} ${counts.join(',')}`).toBeGreaterThanOrEqual(5);
        expect(c, `${l} ${counts.join(',')}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('does not make the right answer the longest option most of the time', () => {
    for (const l of LOCALES) {
      let longest = 0;
      for (const p of PASSAGES[l]) {
        for (const q of p.questions) {
          const len = q.options.map((o) => o.length);
          if (len[q.correct] === Math.max(...len) && len.filter((x) => x === len[q.correct]).length === 1) longest += 1;
        }
      }
      expect(longest, `${l}: ${longest} of 30`).toBeLessThanOrEqual(10);
    }
  });

  it('asks questions that end in a question mark (a space before it in French)', () => {
    for (const l of LOCALES) for (const p of PASSAGES[l]) for (const q of p.questions) expect(q.prompt.trim().endsWith(l === 'fr' ? ' ?' : '?'), `${l}: ${q.prompt}`).toBe(true);
  });
});

describe('passages: parity between English and French', () => {
  it('has the same structure in both languages: levels, question kinds, option counts', () => {
    const shape = (l: Locale) => PASSAGES[l].map((p) => `${p.level}:${p.questions.map((q) => `${q.kind}${q.options.length}`).join('/')}`).sort();
    expect(shape('fr')).toEqual(shape('en'));
    const levelCount = (l: Locale, lv: number) => PASSAGES[l].filter((p) => p.level === lv).length;
    for (const lv of [1, 2, 3]) expect(levelCount('fr', lv)).toBe(levelCount('en', lv));
  });

  it('is written for each language, not copied: no French passage shares a sentence with an English one', () => {
    const en = new Set(PASSAGES.en.flatMap((p) => p.text.split(/(?<=[.!?])\s+/)));
    for (const p of PASSAGES.fr) for (const sentence of p.text.split(/(?<=[.!?])\s+/)) expect(en.has(sentence)).toBe(false);
  });

  it('uses natural French typography: a space before ? and :', () => {
    for (const p of PASSAGES.fr) {
      expect(p.text, p.id).not.toMatch(/\S\?/);
      expect(p.text, p.id).not.toMatch(/\S:/);
    }
  });
});

describe('meta.ts matches the words', () => {
  it('lists every passage in the same order, with the same level and topic', () => {
    for (const l of LOCALES) {
      expect(META[l].map((m) => m.id)).toEqual(PASSAGES[l].map((p) => p.id));
      expect(META[l].map((m) => `${m.level}|${m.topic}`)).toEqual(PASSAGES[l].map((p) => `${p.level}|${p.topic}`));
    }
  });

  it('has the right word counts, sentence starts, topic sentence and answers', () => {
    for (const l of LOCALES) {
      PASSAGES[l].forEach((p, i) => {
        const words = wordList(p.text);
        const m = META[l][i]!;
        expect(m.wordCount, `${l}:${p.id} wordCount`).toBe(words.length);
        expect(m.sentenceStarts, `${l}:${p.id} sentenceStarts`).toEqual(sentenceStartsOf(words));
        expect(m.topicEnd, `${l}:${p.id} topicEnd`).toBe(topicEndOf(words));
        expect(m.answers, `${l}:${p.id} answers`).toEqual(p.questions.map((q) => q.correct));
      });
    }
  });
});

describe('text helpers', () => {
  it('finds sentence starts after . ! ? and a closing quote', () => {
    const w = wordList('Hello there. Is it? "Yes!" She said so.');
    expect(sentenceStartsOf(w)).toEqual([0, 2, 4, 5]);
    expect(topicEndOf(w)).toBe(2);
  });

  it('puts the pivot a little left of the middle of a word', () => {
    expect(pivotIndex('a')).toBe(0);
    expect(pivotIndex('the')).toBe(1);
    expect(pivotIndex('reading')).toBe(2);
    expect(pivotIndex('comprehension')).toBe(3);
    expect(pivotIndex('extraordinarily')).toBe(4);
  });
});

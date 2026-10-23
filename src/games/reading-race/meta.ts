/**
 * Engine-side facts about each passage: the words themselves live in
 * content/<locale>.json and load with the Screen only. Generated from those
 * files; `passages.test.ts` fails if they drift apart, and prints the fix.
 */
import type { Locale } from '../contract';

export type ReadingLevel = 1 | 2 | 3;

export interface PassageMeta {
  id: string;
  topic: string;
  level: ReadingLevel;
  wordCount: number;
  /** Indices of the words that start a sentence (the first is 0). */
  sentenceStarts: number[];
  /** Exclusive end index of the first sentence (the topic sentence). */
  topicEnd: number;
  /** Index of the correct option of each of the three questions. */
  answers: [number, number, number];
}

export const META: Record<Locale, PassageMeta[]> = {
  en: [
    { id: "extra-loaf", topic: "The extra loaf", level: 1, wordCount: 142, sentenceStarts: [0, 14, 29, 35, 52, 65, 77, 87, 93, 107, 114, 131], topicEnd: 14, answers: [1, 3, 2] },
    { id: "autumn-leaves", topic: "Why leaves change colour", level: 1, wordCount: 134, sentenceStarts: [0, 12, 25, 38, 42, 55, 65, 86, 91, 113, 123], topicEnd: 12, answers: [0, 1, 2] },
    { id: "zipper", topic: "How a zipper works", level: 1, wordCount: 135, sentenceStarts: [0, 9, 19, 33, 52, 60, 67, 85, 99, 110], topicEnd: 9, answers: [0, 3, 0] },
    { id: "moon-phases", topic: "Why the Moon changes shape", level: 1, wordCount: 138, sentenceStarts: [0, 8, 25, 34, 52, 68, 87, 93, 108, 130], topicEnd: 8, answers: [1, 0, 3] },
    { id: "waggle-dance", topic: "The waggle dance", level: 2, wordCount: 162, sentenceStarts: [0, 20, 48, 54, 74, 83, 101, 117, 144], topicEnd: 20, answers: [2, 1, 3] },
    { id: "penny-post", topic: "The penny post", level: 2, wordCount: 155, sentenceStarts: [0, 9, 34, 50, 78, 106, 116, 120, 133, 141], topicEnd: 9, answers: [0, 1, 2] },
    { id: "tide-pool", topic: "A tide pool after the storm", level: 3, wordCount: 165, sentenceStarts: [0, 11, 27, 51, 57, 74, 80, 107, 133, 141], topicEnd: 11, answers: [1, 3, 0] },
    { id: "rag-paper", topic: "Paper made from rags", level: 3, wordCount: 168, sentenceStarts: [0, 10, 38, 44, 65, 88, 108, 112, 131, 141, 156], topicEnd: 10, answers: [3, 0, 2] },
    { id: "lighthouse-lens", topic: "The lighthouse lens", level: 3, wordCount: 165, sentenceStarts: [0, 14, 33, 51, 72, 101, 129, 147], topicEnd: 14, answers: [1, 2, 2] },
    { id: "night-ferry", topic: "The last ferry", level: 3, wordCount: 157, sentenceStarts: [0, 6, 23, 38, 43, 55, 68, 78, 85, 124, 142], topicEnd: 6, answers: [1, 0, 3] },
  ],
  fr: [
    { id: "chat-gare", topic: "Le chat de la gare", level: 1, wordCount: 140, sentenceStarts: [0, 11, 29, 49, 62, 69, 73, 86, 99, 110, 120, 128], topicEnd: 11, answers: [2, 1, 3] },
    { id: "ciel-bleu", topic: "Pourquoi le ciel est bleu", level: 1, wordCount: 145, sentenceStarts: [0, 15, 26, 42, 58, 76, 88, 102, 111, 130], topicEnd: 15, answers: [1, 3, 0] },
    { id: "cadenas", topic: "Comment marche un cadenas", level: 1, wordCount: 137, sentenceStarts: [0, 8, 20, 30, 51, 72, 82, 97, 107, 119], topicEnd: 8, answers: [3, 2, 0] },
    { id: "herisson", topic: "Le hérisson de la nuit", level: 1, wordCount: 138, sentenceStarts: [0, 6, 26, 42, 67, 81, 93, 109, 122], topicEnd: 6, answers: [1, 2, 2] },
    { id: "braille", topic: "Les six points de Louis Braille", level: 2, wordCount: 147, sentenceStarts: [0, 18, 49, 67, 70, 95, 107, 125], topicEnd: 18, answers: [0, 1, 2] },
    { id: "pont-du-gard", topic: "Le pont du Gard", level: 2, wordCount: 145, sentenceStarts: [0, 28, 33, 59, 74, 91, 103, 116, 131], topicEnd: 28, answers: [3, 0, 1] },
    { id: "tournee-de-lina", topic: "La tournée de Lina", level: 3, wordCount: 153, sentenceStarts: [0, 16, 36, 66, 87, 101, 116, 135, 138], topicEnd: 16, answers: [3, 0, 0] },
    { id: "metre", topic: "Inventer le mètre", level: 3, wordCount: 152, sentenceStarts: [0, 22, 39, 69, 103, 116, 132], topicEnd: 22, answers: [2, 0, 0] },
    { id: "fourmis-champignon", topic: "Les fourmis jardinières", level: 3, wordCount: 145, sentenceStarts: [0, 29, 37, 61, 68, 102, 121], topicEnd: 29, answers: [2, 1, 3] },
    { id: "marais-salants", topic: "Le sel des marais", level: 3, wordCount: 145, sentenceStarts: [0, 21, 41, 48, 66, 81, 123, 136], topicEnd: 21, answers: [1, 1, 3] },
  ],
};

/**
 * The passages and their questions, original to this game. Only the Screen
 * imports this file, so the words load with the Screen's own chunk; the engine
 * works from the small generated `meta.ts`.
 */
import type { Locale } from '../contract';
import en from './content/en.json';
import fr from './content/fr.json';
import type { ReadingLevel } from './meta';

export const MIN_WORDS = 110;
export const MAX_WORDS = 170;
export const QUESTIONS_PER_PASSAGE = 3;
export const OPTIONS_PER_QUESTION = 4;

export type QuestionKind = 'literal' | 'inference' | 'detail';

export interface Question {
  kind: QuestionKind;
  prompt: string;
  options: [string, string, string, string];
  /** Index of the one correct option. */
  correct: number;
}

export interface Passage {
  id: string;
  topic: string;
  level: ReadingLevel;
  text: string;
  questions: [Question, Question, Question];
}

export const PASSAGES: Record<Locale, readonly Passage[]> = {
  en: en as unknown as Passage[],
  fr: fr as unknown as Passage[],
};

export function passageById(locale: Locale, id: string): Passage | undefined {
  return PASSAGES[locale].find((p) => p.id === id);
}

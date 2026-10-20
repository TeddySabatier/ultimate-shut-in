/**
 * All the scenes, by language. Imported by the Screen (and the tests) only:
 * the engine never reads a word of them.
 */
import type { Locale } from '../contract';
import type { ScenarioText } from './content';
import { EN } from './texts-en';
import { FR } from './texts-fr';

export const TEXTS: Record<Locale, Record<string, ScenarioText>> = { en: EN, fr: FR };

export function getText(locale: Locale, id: string): ScenarioText | undefined {
  return TEXTS[locale][id];
}

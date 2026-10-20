/**
 * Decision Dungeon: the shape of the 18 scenarios, shared by both languages.
 *
 * The engine reads only this file (ids, mood, topic, ease and the style tag of
 * every option, in source order), so the registry chunk stays small. The words
 * live in `texts-en.ts` and `texts-fr.ts`, which only the Screen imports; they
 * list the options in the same order as `styles` below (a test enforces it).
 * The English and French scenes are written separately, not translated line by
 * line, but every scenario has the same structure in both.
 */

/** The hidden style of a door. Only `constructive` and `boundary` count as good choices. */
export const STYLES = ['reactive', 'avoidant', 'constructive', 'boundary', 'curious'] as const;
export type StyleTag = (typeof STYLES)[number];

export const MOODS = ['frustration', 'awkward', 'delay', 'disappointment', 'mistake', 'money', 'family'] as const;
export type MoodTag = (typeof MOODS)[number];

export const TOPICS = ['transport', 'work', 'procrastination', 'social', 'failure', 'money', 'family'] as const;
export type Topic = (typeof TOPICS)[number];

/** 1 is the gentlest scene, 3 the subtlest. Rooms are walked from 1 up to 3. */
export type Ease = 1 | 2 | 3;

export interface ScenarioShape {
  id: string;
  mood: MoodTag;
  topic: Topic;
  ease: Ease;
  /** The style of each option, in source order. The player sees them shuffled by the seed. */
  styles: readonly StyleTag[];
}

export const SCENARIOS: readonly ScenarioShape[] = [
  { id: 's01', mood: 'frustration', topic: 'transport', ease: 1, styles: ['constructive', 'reactive', 'avoidant'] },
  { id: 's02', mood: 'mistake', topic: 'work', ease: 1, styles: ['reactive', 'constructive', 'avoidant'] },
  { id: 's03', mood: 'delay', topic: 'procrastination', ease: 1, styles: ['avoidant', 'curious', 'constructive'] },
  { id: 's04', mood: 'disappointment', topic: 'social', ease: 1, styles: ['boundary', 'constructive', 'avoidant', 'reactive'] },
  { id: 's05', mood: 'money', topic: 'money', ease: 1, styles: ['constructive', 'avoidant', 'reactive'] },
  { id: 's06', mood: 'family', topic: 'family', ease: 1, styles: ['reactive', 'constructive', 'avoidant', 'constructive'] },
  { id: 's07', mood: 'frustration', topic: 'family', ease: 2, styles: ['reactive', 'constructive', 'boundary'] },
  { id: 's08', mood: 'frustration', topic: 'work', ease: 2, styles: ['constructive', 'reactive', 'boundary', 'avoidant'] },
  { id: 's09', mood: 'awkward', topic: 'social', ease: 2, styles: ['reactive', 'constructive', 'curious', 'avoidant'] },
  { id: 's10', mood: 'delay', topic: 'procrastination', ease: 2, styles: ['curious', 'avoidant', 'constructive', 'reactive'] },
  { id: 's11', mood: 'disappointment', topic: 'social', ease: 2, styles: ['constructive', 'reactive', 'curious'] },
  { id: 's12', mood: 'money', topic: 'money', ease: 2, styles: ['reactive', 'avoidant', 'constructive', 'boundary'] },
  { id: 's13', mood: 'mistake', topic: 'failure', ease: 3, styles: ['constructive', 'avoidant', 'reactive', 'constructive'] },
  { id: 's14', mood: 'family', topic: 'family', ease: 3, styles: ['boundary', 'constructive', 'reactive', 'avoidant'] },
  { id: 's15', mood: 'frustration', topic: 'transport', ease: 3, styles: ['curious', 'reactive', 'avoidant', 'constructive'] },
  { id: 's16', mood: 'delay', topic: 'work', ease: 3, styles: ['reactive', 'constructive', 'avoidant', 'boundary'] },
  { id: 's17', mood: 'disappointment', topic: 'failure', ease: 3, styles: ['constructive', 'curious', 'avoidant', 'reactive'] },
  { id: 's18', mood: 'awkward', topic: 'social', ease: 3, styles: ['avoidant', 'reactive', 'constructive', 'boundary'] },
];

export function getShape(id: string): ScenarioShape | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Only these two styles count towards the score and the win. */
export function isGoodStyle(style: StyleTag): boolean {
  return style === 'constructive' || style === 'boundary';
}

// ---------------------------------------------------------------------------
// The words (written in texts-en.ts and texts-fr.ts, read by the Screen)
// ---------------------------------------------------------------------------

export interface OptionText {
  /** Repeated from `SCENARIOS[i].styles` so the text can be audited on its own; a test keeps them equal. */
  style: StyleTag;
  /** What the door says: one action, in the imperative, 6 to 25 words. */
  label: string;
  /** A short plain description of the move, shown only on the easy difficulties (1 and 2). */
  cue: string;
  /** Warm, 20 to 40 words, never shaming. */
  reflection: string;
}

export interface ScenarioText {
  /** 25 to 50 words. */
  situation: string;
  /** The question the Study troop shows. */
  reframe: string;
  options: readonly OptionText[];
}

/** Count the words of a text (spaces and non-breaking spaces separate words). */
export function wordCount(text: string): number {
  return text.trim().split(/[\s\u00a0]+/).filter(Boolean).length;
}

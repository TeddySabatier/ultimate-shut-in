/**
 * On-device quest parser: a transcript in, a `ParsedQuestDraft` out.
 *
 * Rule-based and pure (no network, no model, no clock). English and French
 * grammars are always both tried; `locale` only breaks ties. The pipeline,
 * each step consuming the words it understood so the rest becomes the title:
 *
 *   1. number words to digits ("twenty five", "vingt cinq"), ranges, "twice"
 *   2. frequency: "3 times a week", "tous les jours", "weekdays", "every Monday"
 *   3. clock times and time-of-day words ("at 7pm", "before bed", "le matin")
 *   4. duration: "30 minutes", "1h30", "half an hour", "un quart d'heure"
 *   5. count: a number followed by a noun ("20 pushups", "8 glasses of water")
 *   6. habit: weighted keyword tables (`keywords.ts`), default Move with low confidence
 *   7. title: what is left, trimmed, imperative, Title Case, at most 40 characters
 *
 * Kind: a duration makes a timer; else a count of 2..99 makes a counter;
 * else a check. Every field carries a 0..1 confidence and low-confidence
 * fields raise a question for the Compose sheet to ask.
 */
import { getHabit } from '../content';
import { DESCRIPTION_MAX, TITLE_MAX, effortTier, maxTier } from '../template';
import type { HabitId, QuestKind, Recurrence, Tier, TimeSlot } from '../types';
import { HABIT_IDS } from '../types';
import { HABIT_KEYWORDS, type KeywordEntry } from './keywords';

export type QuestionId = 'habit' | 'amount' | 'title' | 'empty';

/** Something the UI should ask because the parser was not sure. */
export interface ComposeQuestion {
  id: QuestionId;
  /** The draft field the answer goes to. */
  field: 'habit' | 'amount' | 'title' | 'transcript';
}

export interface FieldConfidence {
  habit: number;
  kind: number;
  amount: number;
  title: number;
  recurrence: number;
  timeSlot: number;
}

export interface ParsedQuestDraft {
  transcript: string;
  habit: HabitId;
  kind: QuestKind;
  durationMin?: number;
  targetCount?: number;
  title: string;
  description: string;
  recurrence: Recurrence;
  /** 0 (Sunday) .. 6; set when the sentence names a weekday that repeats. */
  pinWeekday?: number;
  timeSlot: TimeSlot;
  /** Tier the effort deserves. */
  tier: Tier;
  /** Highest tier this kind and duration may claim. */
  maxTier: Tier;
  confidence: FieldConfidence;
  questions: ComposeQuestion[];
}

export interface ParseOptions {
  /** `navigator.language`; French biases ties, nothing else. */
  locale?: string | undefined;
}

/** Confidence below which the parser asks instead of guessing. */
export const ASK_BELOW = 0.6;

/* ------------------------------ Folding ------------------------------ */

/** Lower-case, accent-free, hyphens and apostrophes as spaces; same length as the input. */
function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch.length !== 1) {
      out += ' '.repeat(ch.length);
      continue;
    }
    let c = ch.toLowerCase();
    if (c.length !== 1) c = ch;
    if (c === 'œ') c = 'o';
    else if (c === 'æ') c = 'a';
    else if (c === '-' || c === '_' || c === "'" || c === '’' || c === '‘') c = ' ';
    else if (c.charCodeAt(0) > 127) c = c.normalize('NFD').charAt(0) || c;
    out += c;
  }
  return out;
}

/* ------------------------------ Number words ------------------------------ */

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15,
  seize: 16,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};
/** "one", "un", "une" only count as numbers before these words ("one hour", "une fois"). */
const ONE_BEFORE = new Set(['hour', 'hours', 'minute', 'minutes', 'min', 'mins', 'heure', 'heures', 'time', 'times', 'fois']);

interface Tok {
  start: number;
  end: number;
  f: string;
}

function numberAt(toks: Tok[], i: number, text: string): { value: number; len: number } | null {
  const w = (k: number): string => toks[k]?.f ?? '';
  const gap = (k: number): boolean => k + 1 < toks.length && /^[\s-]+$/.test(text.slice(toks[k]?.end ?? 0, toks[k + 1]?.start ?? 0));
  const f0 = w(i);
  if (f0 === 'quatre' && gap(i) && (w(i + 1) === 'vingt' || w(i + 1) === 'vingts')) {
    const u = gap(i + 1) ? UNITS[w(i + 2)] : undefined;
    return u !== undefined && u >= 1 ? { value: 80 + u, len: 3 } : { value: 80, len: 2 };
  }
  const tens = TENS[f0];
  if (tens !== undefined) {
    if (gap(i) && w(i + 1) === 'et' && gap(i + 1) && ['un', 'une', 'onze'].includes(w(i + 2))) {
      return { value: tens + (w(i + 2) === 'onze' ? 11 : 1), len: 3 };
    }
    const u = gap(i) ? UNITS[w(i + 1)] : undefined;
    if (u !== undefined && u >= 1 && (u <= 9 || (f0 === 'soixante' && u <= 19))) return { value: tens + u, len: 2 };
    return { value: tens, len: 1 };
  }
  if (f0 === 'dix' && gap(i) && ['sept', 'huit', 'neuf'].includes(w(i + 1))) return { value: 10 + (UNITS[w(i + 1)] ?? 0), len: 2 };
  const u = UNITS[f0];
  if (u === undefined) return null;
  if ((f0 === 'one' || f0 === 'un' || f0 === 'une') && !ONE_BEFORE.has(w(i + 1))) return null;
  return { value: u, len: 1 };
}

function numberWordsToDigits(text: string): string {
  const toks: Tok[] = [];
  for (const m of text.matchAll(/[\p{L}]+/gu)) toks.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, f: fold(m[0]) });
  let out = '';
  let cursor = 0;
  for (let i = 0; i < toks.length; ) {
    const hit = numberAt(toks, i, text);
    const first = toks[i];
    if (!hit || !first) {
      i += 1;
      continue;
    }
    const last = toks[i + hit.len - 1] ?? first;
    out += text.slice(cursor, first.start) + String(hit.value);
    cursor = last.end;
    i += hit.len;
  }
  return out + text.slice(cursor);
}

/* ------------------------------ Normalising ------------------------------ */

function prepare(raw: string): string {
  let t = raw.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  t = t.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  t = numberWordsToDigits(t);
  // ranges keep their lower bound: "20-30 minutes", "20 to 30 min", "20 a 30 min"
  t = t.replace(/(\d+)\s*(?:-|–|—|to|or|a|à|ou)\s*(\d+)(?=\s*(?:min|mn|minutes?|h\b|hrs?\b|hours?|heures?|times|fois|x\b))/gi, '$1');
  t = t.replace(/\btwice\b/gi, '2 times').replace(/\bthrice\b/gi, '3 times');
  t = t.replace(/\bonce\s+(?=(?:a|per|each|every|this)\s+(?:day|week|month))/gi, '1 times ');
  t = t.replace(/\bune\s+fois\b/gi, '1 fois');
  return t;
}

/* ------------------------------ Working text ------------------------------ */

/** The sentence twice: `o` keeps case and accents (for the title), `f` is folded (for matching). Same length, so spans carry over. */
class Work {
  o: string;
  f: string;
  constructor(text: string) {
    this.o = text;
    this.f = fold(text);
  }
  find(re: RegExp): RegExpExecArray | null {
    return re.exec(this.f);
  }
  blank(m: RegExpExecArray): void {
    const a = m.index;
    const b = a + m[0].length;
    const pad = ' '.repeat(b - a);
    this.o = this.o.slice(0, a) + pad + this.o.slice(b);
    this.f = this.f.slice(0, a) + pad + this.f.slice(b);
  }
  /** Find and blank the first match. */
  take(re: RegExp): RegExpExecArray | null {
    const m = this.find(re);
    if (m) this.blank(m);
    return m;
  }
  squeeze(): void {
    const keep: number[] = [];
    let prevSpace = true;
    for (let i = 0; i < this.f.length; i++) {
      const isSpace = /\s/.test(this.f.charAt(i));
      if (isSpace && prevSpace) continue;
      keep.push(i);
      prevSpace = isSpace;
    }
    this.o = keep.map((i) => this.o.charAt(i)).join('').trim();
    this.f = keep.map((i) => this.f.charAt(i)).join('').trim();
  }
  /** Drop a match anchored at an edge (after `squeeze`); returns whether anything went. */
  strip(re: RegExp): boolean {
    const m = re.exec(this.f);
    if (!m || m[0].length === 0) return false;
    if (m.index === 0) {
      this.o = this.o.slice(m[0].length);
      this.f = this.f.slice(m[0].length);
    } else {
      this.o = this.o.slice(0, m.index);
      this.f = this.f.slice(0, m.index);
    }
    this.squeeze();
    return true;
  }
}

/* ------------------------------ Grammar ------------------------------ */

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

const RE = {
  nTimes: /\b(\d{1,2})\s*(?:x|times?|fois)\b(?:\s+(?:a|an|per|each|every|par|this|cette|ce|chaque|in the|dans la|over the|sur la)\s+(day|week|jour|semaine|month|mois)\b)?/,
  daysPerWeek: /\b(\d)\s*(?:days?|jours?)\s*(?:a|per|each|every|par)\s*(?:week|semaine)\b/,
  slotDaily: /\b(?:(?:every|each)\s+(morning|afternoon|evening|night)|(?:tous\s+les|toutes\s+les|chaque)\s+(matins?|soirs?|apres\s+midis?|nuits?))\b/,
  daily: /\b(?:every\s+single\s+day|every\s*day|everyday|each\s+day|daily|tous\s+les\s+jours|chaque\s+jour|quotidien\w*|journalier\w*|(?:a|per|par)\s+(?:day|jour))\b/,
  weekdays: /\b(?:every\s+weekday|on\s+weekdays|weekdays?|monday\s+(?:to|through|thru)\s+friday|mon\s+fri|du\s+lundi\s+au\s+vendredi|en\s+semaine|jours?\s+ouvres?|jours?\s+ouvrables?|jours?\s+de\s+semaine)\b/,
  weekly: /\b(?:weekly|every\s+week|each\s+week|chaque\s+semaine|toutes\s+les\s+semaines|hebdomadaire\w*|(?:a|per|par)\s+(?:week|semaine))\b/,
  weekdayName: /\b(?:(every|each|on|this|next|chaque|tous\s+les|toutes\s+les|le|ce|du)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(s?)\b/,
  onceMarker: /\b(?:this\s+(morning|afternoon|evening)|tonight|today|now|tomorrow|this\s+week(?:end)?|this\s+month|aujourd\s*hui|ce\s+(soir|matin)|cet\s+apres\s+midi|demain|cette\s+semaine|ce\s+week\s*end)\b/,
  clockAmPm: /\b(?:(?:at|by|around|vers|before|after)\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm)\b/,
  clockH: /\b(?:at|by|around|vers|a)\s+(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?![a-z0-9])/,
  morning: /\b(?:in\s+the\s+morning|morning|before\s+breakfast|at\s+dawn|first\s+thing|au\s+reveil|des\s+le\s+reveil|le\s+matin|matin|avant\s+le\s+petit\s+dej\w*)\b/,
  afternoon: /\b(?:in\s+the\s+afternoon|afternoon|after\s+lunch|lunch\s*time|apres\s+midi|l\s+apres\s+midi|apres\s+le\s+dejeuner|at\s+noon|noon)\b/,
  evening: /\b(?:in\s+the\s+evening|evening|tonight|at\s+night|before\s+bed(?:\s*time)?|before\s+sleep(?:ing)?|after\s+dinner|after\s+supper|after\s+work|le\s+soir|soir|avant\s+de\s+dormir|avant\s+de\s+(?:me|se)\s+coucher|avant\s+le\s+coucher|apres\s+le\s+diner|apres\s+le\s+travail|avant\s+d\s+aller\s+au\s+lit)\b/,
};

const DURATION: { re: RegExp; minutes: (m: RegExpExecArray) => number }[] = [
  { re: /\b(?:an|1|one|une)\s+(?:hour|heure)\s+(?:and\s+a\s+half|et\s+demie?)\b/, minutes: () => 90 },
  { re: /\b(?:half\s+(?:an\s+)?hour|a\s+half\s+hour|(?:une\s+)?demi\s+heure)\b/, minutes: () => 30 },
  { re: /\b(?:(?:a\s+)?quarter\s+(?:of\s+an\s+hour|hour)|(?:un\s+)?quart\s+d\s+heure)\b/, minutes: () => 15 },
  { re: /\b(?:an|a)\s+hour\b/, minutes: () => 60 },
  { re: /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|heures?)\s*(?:and\s+|et\s+)?(\d{1,2})\s*(?:min|mins|minutes?|mn)(?![a-z])/, minutes: (m) => Number((m[1] ?? '0').replace(',', '.')) * 60 + Number(m[2] ?? 0) },
  { re: /\b(\d+)\s*h\s*(\d{2})(?![a-z0-9])/, minutes: (m) => Number(m[1]) * 60 + Number(m[2]) },
  { re: /\b(\d+(?:[.,]\d+)?)\s*(?:h|hrs?|hours?|heures?)(?![a-z0-9])/, minutes: (m) => Number((m[1] ?? '0').replace(',', '.')) * 60 },
  { re: /\b(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutes?|mn|mns)(?![a-z0-9])/, minutes: (m) => Number((m[1] ?? '0').replace(',', '.')) },
  { re: /\b(\d+)\s*(?:sec|secs|seconds?|secondes?)(?![a-z])/, minutes: (m) => Math.max(1, Math.ceil(Number(m[1]) / 60)) },
];

/** Words after a number that are not things to count. */
const NOT_A_NOUN = new Set([
  'am', 'pm', 'th', 'st', 'nd', 'rd', 'times', 'time', 'x', 'o', 'oclock', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'h', 'hr',
  'hrs', 'min', 'mins', 'minute', 'minutes', 'hour', 'hours', 'jour', 'jours', 'semaine', 'semaines', 'mois', 'an', 'ans', 'fois', 'heure', 'heures',
  'sec', 'secs', 'seconds', 'second', 'a', 'to', 'of',
]);

const FILLER_LEAD = new RegExp(
  '^(?:' +
    [
      "(?:please|pls|hey|ok|okay|so|um|uh|well|and|then|also|et|puis|alors|bon|euh)\\s+",
      "i\\s+(?:really\\s+)?(?:want|need|have|would\\s+like|d\\s+like|ought|should|must|wanna|gotta)\\s+(?:to\\s+)?",
      "i\\s+(?:am|m)\\s+going\\s+to\\s+",
      "i\\s+(?:will|ll)\\s+",
      "let\\s+s\\s+|lets\\s+",
      "remind\\s+me\\s+to\\s+",
      "(?:add|create|new)\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?(?:quest|task|goal)\\s*(?:to\\s+|for\\s+|called\\s+|named\\s+)?",
      "(?:quest|goal|objectif)\\s*:?\\s+",
      "my\\s+(?:goal|quest)\\s+is\\s+(?:to\\s+)?",
      "try\\s+to\\s+",
      "je\\s+(?:veux|voudrais|dois|vais|souhaite|compte)\\s+(?:vraiment\\s+)?",
      "j\\s+(?:aimerais|voudrais)\\s+",
      "il\\s+faut\\s+(?:que\\s+je\\s+)?|faut\\s+que\\s+je\\s+",
      "rappelle\\s+moi\\s+de\\s+",
      "ajoute(?:r)?\\s+(?:une\\s+)?(?:quete|tache|objectif)?\\s*(?:de\\s+|pour\\s+)?",
      "mon\\s+objectif\\s+est\\s+de\\s+",
      "nouvelle\\s+quete\\s*:?\\s*",
      "(?:to|de|d|of|for|pour|about)\\s+",
    ].join('|') +
    ')',
);
const CONNECTOR_TRAIL = /\s+(?:for|in|during|pendant|per|par|a|an|at|de|d|on|le|la|les|the|and|et|then|puis|to|about|of|with|avec|by|every|each|chaque|dans|sur|apres|after|before|avant|from|du|des|au|aux|en|vers|around|within|my|mon|ma|mes|your|every|also|aussi)$/;
const PUNCT_EDGE = /^[\s.,;:!?"()[\]“”«»]+|[\s.,;:!?"()[\]“”«»]+$/;
const ARTICLE_LEAD = /^(?:a|an|the|un|une|le|la|les|l|du|des|my|mon|ma|mes|some)\s+/;
const MINOR = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'with', 'by', 'from', 'de', 'la', 'le', 'les', 'du', 'des', 'un', 'une', 'et', 'ou', 'au', 'aux', 'en', 'sur', 'sous', 'dans', 'par', 'pour', 'avec', 'sans', 'vers']);
const ELIDED = /^(?:l|d|j|qu|n|s|m|t|c)'/i;

/* ------------------------------ Habit ------------------------------ */

interface Compiled {
  habit: HabitId;
  lang: 'en' | 'fr';
  re: RegExp;
  weight: number;
}

function compile(entries: readonly KeywordEntry[], habit: HabitId, lang: 'en' | 'fr'): Compiled[] {
  return entries.map(([pattern, weight]) => ({ habit, lang, weight, re: new RegExp(`\\b(?:${pattern})\\b`) }));
}

const COMPILED: Compiled[] = HABIT_IDS.flatMap((h) => [...compile(HABIT_KEYWORDS[h].en, h, 'en'), ...compile(HABIT_KEYWORDS[h].fr, h, 'fr')]);

/** Habit scores for a folded sentence; the player's language adds a 0.1 tie-breaker per hit. */
export function scoreHabits(folded: string, lang: 'en' | 'fr'): Record<HabitId, number> {
  const score = Object.fromEntries(HABIT_IDS.map((h) => [h, 0])) as Record<HabitId, number>;
  for (const c of COMPILED) if (c.re.test(folded)) score[c.habit] += c.weight + (c.lang === lang ? 0.1 : 0);
  return score;
}

function habitConfidence(s1: number, s2: number): number {
  if (s1 <= 0) return 0.15;
  return Math.round((0.35 + (0.6 * (s1 - s2)) / (s1 + s2 + 1)) * 100) / 100;
}

/* ------------------------------ Title ------------------------------ */

function titleCase(text: string): string {
  return text
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && MINOR.has(fold(lower))) return lower;
      if (ELIDED.test(w)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function limit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space >= 12 ? cut.slice(0, space) : cut).trim();
}

function buildTitle(w: Work): string {
  w.o = w.o.replace(/[.,;:!?"()[\]“”«»]/g, ' ');
  w.f = w.f.replace(/[.,;:!?"()[\]“”«»]/g, ' ');
  w.squeeze();
  for (let guard = 0; guard < 8; guard++) {
    const changed = w.strip(new RegExp(FILLER_LEAD.source)) || w.strip(CONNECTOR_TRAIL);
    if (!changed) break;
  }
  const words = w.f.split(' ').filter(Boolean).length;
  if (words >= 2) w.strip(ARTICLE_LEAD);
  w.o = w.o.replace(PUNCT_EDGE, '');
  return limit(titleCase(w.o), TITLE_MAX);
}

function describe(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean === '') return '';
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
  const end = /[.!?…]$/.test(cap) ? cap : `${cap}.`;
  return limit(end, DESCRIPTION_MAX);
}

/* ------------------------------ Parse ------------------------------ */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Parse one sentence into a quest draft. Never throws; an empty sentence yields a blank, all-questions draft. */
export function parseQuestDraft(transcript: string, opts: ParseOptions = {}): ParsedQuestDraft {
  const lang: 'en' | 'fr' = (opts.locale ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const w = new Work(prepare(transcript));
  const questions: ComposeQuestion[] = [];

  if (w.f.trim() === '') {
    const habit: HabitId = 'move';
    return {
      transcript: '',
      habit,
      kind: 'check',
      title: '',
      description: '',
      recurrence: 'once',
      timeSlot: 'any',
      tier: 1,
      maxTier: maxTier('check'),
      confidence: { habit: 0, kind: 0, amount: 0, title: 0, recurrence: 0, timeSlot: 0 },
      questions: [{ id: 'empty', field: 'transcript' }],
    };
  }

  let recurrence: Recurrence = 'once';
  let recurrenceConf = 0.6;
  let pinWeekday: number | undefined;
  let slot: TimeSlot = 'any';
  let slotConf = 0.5;
  let perDayCount: number | undefined;
  let countFromTimes: number | undefined;

  const setSlot = (word: string): void => {
    if (/^(?:morning|matin)/.test(word)) slot = 'morning';
    else if (/^(?:afternoon|apres)/.test(word)) slot = 'afternoon';
    else if (/^(?:evening|night|soir|nuit)/.test(word)) slot = 'evening';
    slotConf = 0.85;
  };

  /* 2. frequency */
  const times = w.take(RE.nTimes);
  if (times) {
    const n = Number(times[1]);
    const period = times[2];
    if (period === 'day' || period === 'jour') {
      perDayCount = n;
      recurrence = 'daily';
      recurrenceConf = 0.9;
    } else if (period === 'week' || period === 'semaine') {
      recurrence = n >= 7 ? 'daily' : n <= 1 ? 'weekly:1' : (`weekly:${n}` as Recurrence);
      recurrenceConf = 0.9;
    } else if (period === 'month' || period === 'mois') {
      recurrence = 'once';
    } else {
      countFromTimes = n;
    }
  }
  if (recurrence === 'once') {
    const dpw = w.take(RE.daysPerWeek);
    if (dpw) {
      const n = Number(dpw[1]);
      recurrence = n >= 7 ? 'daily' : n <= 1 ? 'weekly:1' : (`weekly:${n}` as Recurrence);
      recurrenceConf = 0.9;
    }
  }
  if (recurrence === 'once') {
    const sd = w.take(RE.slotDaily);
    if (sd) {
      recurrence = 'daily';
      recurrenceConf = 0.9;
      setSlot(sd[1] ?? sd[2] ?? '');
    }
  }
  if (recurrence === 'once' && w.take(RE.weekdays)) {
    recurrence = 'weekdays';
    recurrenceConf = 0.9;
  }
  if (recurrence === 'once' && w.take(RE.daily)) {
    recurrence = 'daily';
    recurrenceConf = 0.9;
  }
  if (recurrence === 'once') {
    const named: { day: number | undefined; repeats: boolean }[] = [];
    for (let m = w.take(RE.weekdayName); m; m = w.take(RE.weekdayName)) {
      const prefix = (m[1] ?? '').replace(/\s+/g, ' ');
      named.push({ day: WEEKDAYS[m[2] ?? ''], repeats: m[3] === 's' || /^(?:every|each|chaque|tous les|toutes les|le)$/.test(prefix) });
    }
    const days = new Set(named.map((d) => d.day));
    if (named.length >= 2 && days.size >= 2) {
      // "on Tuesdays and Fridays": no single weekday to pin, so N times a week.
      recurrence = `weekly:${Math.min(6, days.size)}` as Recurrence;
      recurrenceConf = 0.8;
    } else if (named.some((d) => d.repeats)) {
      recurrence = 'weekly:1';
      pinWeekday = named[0]?.day;
      recurrenceConf = 0.9;
    }
  }
  if (recurrence === 'once' && w.take(RE.weekly)) {
    recurrence = 'weekly:1';
    recurrenceConf = 0.85;
  }
  const once = w.take(RE.onceMarker);
  if (once) {
    const word = once[1] ?? once[2] ?? (once[0].includes('tonight') ? 'evening' : once[0].includes('apres') ? 'afternoon' : '');
    if (word !== '') setSlot(word);
    if (recurrence === 'once') recurrenceConf = 0.8;
  }

  /* 3. clock time, then time-of-day words */
  let clockSlot: TimeSlot | null = null;
  let clock = w.take(RE.clockAmPm);
  if (!clock) {
    // "a 2h walk" is a duration, not "at 2": the bare "a" prefix only counts from 6 o'clock.
    const h = w.find(RE.clockH);
    if (h && (!/^a\s/.test(h[0]) || Number(h[1]) >= 6)) {
      w.blank(h);
      clock = h;
    }
  }
  if (clock) {
    let h = Number(clock[1]);
    const suffix = clock[3];
    if (suffix === 'pm' && h < 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
    clockSlot = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'evening';
  }
  const spoken: TimeSlot[] = [];
  for (const [name, re] of [['morning', RE.morning], ['afternoon', RE.afternoon], ['evening', RE.evening]] as const) {
    if (w.take(re)) spoken.push(name);
  }
  if (slot === 'any' && spoken.length === 1) {
    slot = spoken[0] ?? 'any';
    slotConf = 0.85;
  } else if (slot === 'any' && spoken.length > 1) {
    // "morning and evening": more than once a day, no single slot.
    if (recurrence === 'once') {
      recurrence = 'daily';
      recurrenceConf = 0.7;
    }
    slotConf = 0.6;
  }
  if (slot === 'any' && clockSlot) {
    slot = clockSlot;
    slotConf = 0.6;
  }

  /* 4. duration */
  let durationMin: number | undefined;
  let amountConf = 0.7;
  for (const d of DURATION) {
    const m = w.take(d.re);
    if (!m) continue;
    const raw = Math.round(d.minutes(m));
    durationMin = clamp(raw, 1, 240);
    amountConf = raw >= 1 && raw <= 240 ? 0.95 : 0.5;
    break;
  }

  /* 5. count */
  let targetCount: number | undefined;
  if (countFromTimes !== undefined) {
    targetCount = countFromTimes;
    amountConf = 0.8;
  } else if (perDayCount !== undefined) {
    targetCount = perDayCount;
    amountConf = 0.85;
  }
  let bareNumber = false;
  if (durationMin === undefined && targetCount === undefined) {
    for (const m of w.f.matchAll(/\b(\d{1,4})(?!\d)\s*(?:x\s*)?([a-z]+)?/g)) {
      const noun = m[2];
      if (noun !== undefined && NOT_A_NOUN.has(noun)) continue;
      targetCount = Number(m[1]);
      bareNumber = noun === undefined;
      amountConf = bareNumber ? 0.5 : 0.85;
      break;
    }
  }
  if (targetCount !== undefined && (targetCount < 2 || targetCount > 99)) {
    // 1 is just a check; over 99 is a number in the name ("10000 steps"), not a counter.
    if (targetCount > 99) amountConf = 0.5;
    targetCount = undefined;
  }

  /* kind */
  let kind: QuestKind = 'check';
  let kindConf = 0.6;
  if (durationMin !== undefined) {
    kind = 'timer';
    kindConf = 0.9;
    targetCount = undefined;
  } else if (targetCount !== undefined) {
    kind = 'count';
    kindConf = bareNumber ? 0.5 : 0.8;
  }

  /* 6. habit, scored on what is left (recurrence and time phrases already gone) */
  const scores = scoreHabits(w.f, lang);
  const ranked = [...HABIT_IDS].sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0] ?? 'move';
  const s1 = scores[top];
  const s2 = scores[ranked[1] ?? 'move'];
  const habit: HabitId = s1 > 0 ? top : 'move';
  const habitConf = habitConfidence(s1, s2);

  /* 7. title and description */
  let title = buildTitle(w);
  let titleConf = 0.8;
  if (title.length < 2) {
    title = getHabit(habit).label;
    titleConf = 0.3;
  }

  if (habitConf < ASK_BELOW) questions.push({ id: 'habit', field: 'habit' });
  if (kind !== 'check' ? amountConf < ASK_BELOW : amountConf < ASK_BELOW && targetCount === undefined && bareNumber) {
    questions.push({ id: 'amount', field: 'amount' });
  }
  if (titleConf < ASK_BELOW) questions.push({ id: 'title', field: 'title' });

  const out: ParsedQuestDraft = {
    transcript: transcript.trim(),
    habit,
    kind,
    title,
    description: describe(transcript),
    recurrence,
    timeSlot: slot,
    tier: effortTier(kind, durationMin, targetCount),
    maxTier: maxTier(kind, durationMin, targetCount),
    confidence: {
      habit: habitConf,
      kind: kindConf,
      amount: kind === 'check' ? 0.7 : amountConf,
      title: titleConf,
      recurrence: recurrenceConf,
      timeSlot: slotConf,
    },
    questions,
  };
  if (durationMin !== undefined) out.durationMin = durationMin;
  if (targetCount !== undefined && kind === 'count') out.targetCount = targetCount;
  if (pinWeekday !== undefined) out.pinWeekday = pinWeekday;
  return out;
}

/**
 * The wording of a door must not give the answer away: no tone word in a label,
 * and the length of a label carries no signal. The second one is measured, not
 * assumed: a player who always taps the longest, the shortest, the second longest
 * or the second shortest door, by characters or by words, plays full games through
 * the real engine and must not do better than a random player by more than 15 points.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../game/rng';
import { LOCALES, emptyRun, type Locale } from '../contract';
import { parties } from '../testing/contract';
import { SCENARIOS, isGoodStyle, wordCount } from './content';
import { currentRoom, engine, isOver, type DungeonState } from './engine';
import { TEXTS, getText } from './texts';

const word = (list: string[]): RegExp => new RegExp(`(?<![\\p{L}])(?:${list.join('|')})(?![\\p{L}])`, 'iu');

/** Words that describe how something is said or done: they belong in the reflection, never in the door. */
const TONE: Record<Locale, RegExp> = {
  en: word([
    'loudly', 'sharply', 'sarcastic\\w*', 'curt', 'slam\\w*', 'sigh\\w*', 'irritated', 'angrily', 'angry', 'calmly', 'politely', 'kindly', 'gently', 'firmly',
    'warmly', 'rudely', 'bitterly', 'coldly', 'harshly', 'pointedly', 'snap\\w*', 'grumbl\\w*', 'moan\\w*', 'mutter\\w*', 'shout\\w*', 'complain(?:s|ed|ing)?',
    'always', 'out loud', 'happy to', 'gladly', 'cheerfully',
  ]),
  fr: word([
    'sèchement', 'sec', 'ironique', 'sarcastique', 'claque\\w*', 'soupire\\w*', 'soupir', 'fort', 'fermement', 'poliment', 'gentiment', 'calmement', 'doucement',
    'agacé\\w*', 'violemment', 'brusquement', 'froidement', 'râle\\w*', 'peste\\w*', 'grogne\\w*', 'crie\\w*', 'hurle\\w*', 'avec humeur', 'toujours',
    'à voix haute', 'en riant', 'volontiers', 'avec plaisir', 'joyeusement',
  ]),
};

function eachLabel(fn: (locale: Locale, id: string, i: number, label: string) => void): void {
  for (const locale of LOCALES) for (const s of SCENARIOS) TEXTS[locale][s.id]!.options.forEach((o, i) => fn(locale, s.id, i, o.label));
}

describe('Decision Dungeon labels: no tone word', () => {
  it('keeps the tone in the reflection: no adverb of manner, no "always", no loudness in any door label, in both languages', () => {
    eachLabel((locale, id, i, label) => expect(label, `${locale} ${id}[${i}]`).not.toMatch(TONE[locale]));
  });

  it('catches the tone words it is meant to catch, with an accent next to the boundary', () => {
    expect(TONE.fr.test('Tu es agacé ce soir')).toBe(true);
    expect(TONE.fr.test('Râle auprès du premier agent')).toBe(true);
    expect(TONE.fr.test('Lance-le à voix haute')).toBe(true);
    expect(TONE.en.test('Say it loudly')).toBe(true);
    expect(TONE.en.test('They always do this')).toBe(true);
    expect(TONE.en.test('Say you can take the parcels')).toBe(false);
    expect(TONE.fr.test('Dis que tu prends les colis')).toBe(false);
  });
});

type Measure = (label: string) => number;
type Pick = (lengths: number[], rnd: () => number) => number;

const chars: Measure = (label) => label.length;
const words: Measure = (label) => wordCount(label);

/** Index (in display order) of the k-th longest label, first one on a tie. */
function kth(lengths: number[], k: number): number {
  const order = lengths.map((l, i) => [l, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return order[Math.min(Math.max(k, 0), order.length - 1)]![1];
}
const STRATEGIES: Record<string, Pick> = {
  longest: (l) => kth(l, 0),
  shortest: (l) => kth(l, l.length - 1),
  'second longest': (l) => kth(l, 1),
  'second shortest': (l) => kth(l, l.length - 2),
};
const RANDOM: Pick = (l, rnd) => Math.floor(rnd() * l.length);

const SEEDS = 300;
/** Win rate of a player who picks a door by `pick` on every room, starter party (no perk), plain run. */
function winRate(locale: Locale, difficulty: 1 | 2 | 3 | 4 | 5, measure: Measure, pick: Pick): number {
  let wins = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rnd = mulberry32(seed * 7919);
    let s: DungeonState = engine.initial(seed, parties.starter, emptyRun(difficulty), locale);
    while (!isOver(s)) {
      if (s.phase === 'choose') {
        const room = currentRoom(s)!;
        const text = getText(locale, room.scenarioId)!;
        const lengths = room.optionOrder.map((source) => measure(text.options[source]!.label));
        s = engine.reduce(s, { type: 'choose', index: pick(lengths, rnd) });
      } else s = engine.reduce(s, { type: 'continue' });
    }
    if (engine.outcome(s)!.result === 'won') wins += 1;
  }
  return wins / SEEDS;
}

describe('Decision Dungeon labels: the length of a door carries no signal', () => {
  for (const locale of LOCALES)
    for (const [measureName, measure] of [['characters', chars], ['words', words]] as const)
      it(`${locale}: picking by ${measureName} (longest, shortest, second longest, second shortest) never beats a random player by more than 15 points, at every difficulty`, () => {
        const report: string[] = [];
        for (const difficulty of [1, 2, 3, 4, 5] as const) {
          const random = winRate(locale, difficulty, measure, RANDOM);
          for (const [name, pick] of Object.entries(STRATEGIES)) {
            const rate = winRate(locale, difficulty, measure, pick);
            report.push(`${name} d${difficulty}: ${Math.round(rate * 100)}% vs random ${Math.round(random * 100)}%`);
            expect(rate, `${locale} by ${measureName}, ${name}, difficulty ${difficulty}: ${report.join('; ')}`).toBeLessThanOrEqual(random + 0.15);
          }
        }
      });

  it('has a good door (constructive or boundary) as the single longest or the single shortest label in at most half of the scenes', () => {
    for (const locale of LOCALES) {
      let longest = 0;
      let shortest = 0;
      for (const s of SCENARIOS) {
        const lengths = TEXTS[locale][s.id]!.options.map((o) => o.label.length);
        const max = Math.max(...lengths);
        const min = Math.min(...lengths);
        if (lengths.filter((l) => l === max).length === 1 && isGoodStyle(s.styles[lengths.indexOf(max)]!)) longest += 1;
        if (lengths.filter((l) => l === min).length === 1 && isGoodStyle(s.styles[lengths.indexOf(min)]!)) shortest += 1;
      }
      expect(longest, `${locale}: good door is the single longest in ${longest} of 18`).toBeLessThanOrEqual(9);
      expect(shortest, `${locale}: good door is the single shortest in ${shortest} of 18`).toBeLessThanOrEqual(9);
    }
  });
});

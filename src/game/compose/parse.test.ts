import { describe, expect, it } from 'vitest';
import type { HabitId, QuestKind, Recurrence, TimeSlot } from '../types';
import { ASK_BELOW, parseQuestDraft, scoreHabits, type ParsedQuestDraft } from './parse';

interface Expect {
  habit?: HabitId;
  kind?: QuestKind;
  durationMin?: number | null;
  targetCount?: number | null;
  title?: string;
  recurrence?: Recurrence;
  timeSlot?: TimeSlot;
  pinWeekday?: number | null;
  tier?: 1 | 2 | 3;
}

function check(input: string, want: Expect, locale?: string): ParsedQuestDraft {
  const got = parseQuestDraft(input, { locale });
  const view = {
    habit: got.habit,
    kind: got.kind,
    durationMin: got.durationMin ?? null,
    targetCount: got.targetCount ?? null,
    title: got.title,
    recurrence: got.recurrence,
    timeSlot: got.timeSlot,
    pinWeekday: got.pinWeekday ?? null,
    tier: got.tier,
  };
  const picked = Object.fromEntries(Object.keys(want).map((k) => [k, view[k as keyof typeof view]]));
  expect(picked, input).toEqual(want);
  return got;
}

/** The sentences from the brief, English. */
describe('parseQuestDraft: the brief', () => {
  it('walk 30 minutes in the park every morning', () => {
    const d = check('walk 30 minutes in the park every morning', {
      habit: 'move',
      kind: 'timer',
      durationMin: 30,
      title: 'Walk in the Park',
      recurrence: 'daily',
      timeSlot: 'morning',
      tier: 2,
    });
    // Walking and the park pull in two directions: the parser asks which vassal.
    expect(d.confidence.habit).toBeLessThan(ASK_BELOW);
    expect(d.questions.map((q) => q.id)).toContain('habit');
  });
  it('call mom twice this week', () => {
    check('call mom twice this week', { habit: 'social', kind: 'check', title: 'Call Mom', recurrence: 'weekly:2' });
  });
  it('do 20 pushups', () => {
    check('do 20 pushups', { habit: 'move', kind: 'count', targetCount: 20, title: 'Do 20 Pushups', recurrence: 'once' });
  });
  it('read 10 pages before bed', () => {
    check('read 10 pages before bed', { habit: 'study', kind: 'count', targetCount: 10, title: 'Read 10 Pages', timeSlot: 'evening' });
  });
  it('tidy the kitchen', () => {
    check('tidy the kitchen', { habit: 'clean', kind: 'check', title: 'Tidy the Kitchen', recurrence: 'once', tier: 1 });
  });
  it('drink 8 glasses of water', () => {
    check('drink 8 glasses of water', { habit: 'eat', kind: 'count', targetCount: 8, title: 'Drink 8 Glasses of Water' });
  });
  it('go to the gym 3 times a week', () => {
    check('go to the gym 3 times a week', { habit: 'move', kind: 'check', title: 'Go to the Gym', recurrence: 'weekly:3' });
  });
  it('study French for 25 minutes daily', () => {
    check('study French for 25 minutes daily', { habit: 'study', kind: 'timer', durationMin: 25, title: 'Study French', recurrence: 'daily', tier: 2 });
  });
});

describe('parseQuestDraft: habits by keyword (English)', () => {
  const cases: [string, HabitId][] = [
    ['take a shower', 'hygiene'],
    ['floss', 'hygiene'],
    ['brush my teeth', 'hygiene'],
    ['wash my face', 'hygiene'],
    ['stretch for 5 minutes', 'move'],
    ['go for a run', 'move'],
    ['do some yoga', 'move'],
    ['sit outside in the sun for 15 min', 'outside'],
    ['get some fresh air', 'outside'],
    ['make my bed', 'clean'],
    ['take out the trash', 'clean'],
    ['do the dishes', 'clean'],
    ['wash the dishes', 'clean'],
    ['fold the laundry', 'clean'],
    ['water the plants', 'clean'],
    ['text my sister', 'social'],
    ['meet a friend for coffee', 'social'],
    ['practice guitar', 'study'],
    ['write in my journal', 'study'],
    ['go to bed by 11pm', 'sleep'],
    ['take a nap', 'sleep'],
    ['cook dinner', 'eat'],
    ['eat a proper breakfast', 'eat'],
    ['drink some water', 'eat'],
  ];
  it.each(cases)('%s -> %s', (text, habit) => {
    expect(parseQuestDraft(text).habit).toBe(habit);
  });
});

describe('parseQuestDraft: French', () => {
  it('marcher 30 minutes dans le parc tous les matins', () => {
    check(
      'marcher 30 minutes dans le parc tous les matins',
      { habit: 'move', kind: 'timer', durationMin: 30, title: 'Marcher dans le Parc', recurrence: 'daily', timeSlot: 'morning' },
      'fr-FR',
    );
  });
  it('appeler maman deux fois cette semaine', () => {
    check('appeler maman deux fois cette semaine', { habit: 'social', kind: 'check', title: 'Appeler Maman', recurrence: 'weekly:2' }, 'fr');
  });
  it('faire 20 pompes', () => {
    check('faire 20 pompes', { habit: 'move', kind: 'count', targetCount: 20, title: 'Faire 20 Pompes' }, 'fr');
  });
  it('ranger la cuisine', () => {
    check('ranger la cuisine', { habit: 'clean', kind: 'check', title: 'Ranger la Cuisine' }, 'fr');
  });
  it("boire 8 verres d'eau", () => {
    check("boire 8 verres d'eau", { habit: 'eat', kind: 'count', targetCount: 8, title: "Boire 8 Verres d'eau" }, 'fr');
  });
  it('étudier le français 25 minutes par jour keeps its accents', () => {
    check('étudier le français 25 minutes par jour', { habit: 'study', kind: 'timer', durationMin: 25, title: 'Étudier le Français', recurrence: 'daily' }, 'fr');
  });
  it('lire 20 pages le soir', () => {
    check('lire 20 pages le soir', { habit: 'study', kind: 'count', targetCount: 20, timeSlot: 'evening' }, 'fr');
  });
  it('faire du yoga tous les soirs', () => {
    check('faire du yoga tous les soirs', { habit: 'move', recurrence: 'daily', timeSlot: 'evening', title: 'Faire du Yoga' }, 'fr');
  });
  it('aller à la salle de sport trois fois par semaine', () => {
    check('aller à la salle de sport trois fois par semaine', { habit: 'move', recurrence: 'weekly:3', title: 'Aller à la Salle de Sport' }, 'fr');
  });
  it('chaque lundi appeler papa', () => {
    check('chaque lundi appeler papa', { habit: 'social', recurrence: 'weekly:1', pinWeekday: 1, title: 'Appeler Papa' }, 'fr');
  });
  it('courir 30 minutes le lundi', () => {
    check('courir 30 minutes le lundi', { habit: 'move', kind: 'timer', durationMin: 30, recurrence: 'weekly:1', pinWeekday: 1 }, 'fr');
  });
  it("du lundi au vendredi, boire de l'eau", () => {
    check("du lundi au vendredi, boire de l'eau", { habit: 'eat', recurrence: 'weekdays', title: "Boire de l'eau" }, 'fr');
  });
  it('méditer 10 minutes à 18h', () => {
    check('méditer 10 minutes à 18h', { habit: 'sleep', kind: 'timer', durationMin: 10, timeSlot: 'evening', title: 'Méditer' }, 'fr');
  });
  it('brosser mes dents deux fois par jour', () => {
    check('brosser mes dents deux fois par jour', { habit: 'hygiene', kind: 'count', targetCount: 2, recurrence: 'daily' }, 'fr');
  });
  it("un quart d'heure de yoga le soir", () => {
    check("un quart d'heure de yoga le soir", { habit: 'move', kind: 'timer', durationMin: 15, timeSlot: 'evening', title: 'Yoga' }, 'fr');
  });
  it('une heure et demie de lecture', () => {
    check('une heure et demie de lecture', { habit: 'study', kind: 'timer', durationMin: 90, title: 'Lecture' }, 'fr');
  });
  it('vingt cinq minutes de méditation', () => {
    check('vingt cinq minutes de méditation', { habit: 'sleep', kind: 'timer', durationMin: 25 }, 'fr');
  });
  it('the locale only breaks ties, both tables are always tried', () => {
    expect(parseQuestDraft('call mom', { locale: 'fr-FR' }).habit).toBe('social');
    expect(parseQuestDraft('appeler maman', { locale: 'en-US' }).habit).toBe('social');
  });
});

describe('parseQuestDraft: durations', () => {
  it('minutes, hours, half hours and quarters', () => {
    check('meditate 2h30', { kind: 'timer', durationMin: 150, tier: 3 });
    check('study 1.5 hours', { kind: 'timer', durationMin: 90 });
    check('walk the dog for an hour', { kind: 'timer', durationMin: 60, title: 'Walk the Dog' });
    check('stretch for half an hour', { kind: 'timer', durationMin: 30, title: 'Stretch' });
    check('go for a 20 minute walk', { kind: 'timer', durationMin: 20, title: 'Go for a Walk' });
    check('twenty five minutes of reading', { habit: 'study', kind: 'timer', durationMin: 25, title: 'Reading' });
  });
  it('a range keeps its lower bound', () => {
    check('practice guitar 20-30 minutes', { habit: 'study', kind: 'timer', durationMin: 20, title: 'Practice Guitar' });
  });
  it('seconds round up to a minute', () => {
    check('stretch for 90 seconds', { kind: 'timer', durationMin: 2 });
    check('hold a plank for 30 seconds', { kind: 'timer', durationMin: 1, habit: 'move' });
  });
  it('"a 2h walk" is a duration, not a clock time', () => {
    check('a 2h walk', { kind: 'timer', durationMin: 120, timeSlot: 'any', title: 'Walk' });
  });
  it('a duration beyond four hours is clamped and asked about', () => {
    const d = check('study for 9 hours', { kind: 'timer', durationMin: 240 });
    expect(d.questions.map((q) => q.id)).toContain('amount');
  });
  it('the timer beats a count in the same sentence', () => {
    check('read 10 pages for 20 minutes', { kind: 'timer', durationMin: 20, targetCount: null });
  });
});

describe('parseQuestDraft: counts', () => {
  it('number plus noun is a counter', () => {
    check('do 3 sets of squats', { habit: 'move', kind: 'count', targetCount: 3, title: 'Do 3 Sets of Squats' });
    check('run 5 km', { habit: 'move', kind: 'count', targetCount: 5, title: 'Run 5 Km' });
  });
  it('"3 times a day" is a daily counter', () => {
    check('drink water 3 times a day', { habit: 'eat', kind: 'count', targetCount: 3, recurrence: 'daily', title: 'Drink Water' });
    check('drink water twice a day', { kind: 'count', targetCount: 2, recurrence: 'daily' });
  });
  it('a count of one is just a check', () => {
    check('read 1 chapter', { habit: 'study', kind: 'check', targetCount: null });
  });
  it('a huge number stays in the name and does not become a counter', () => {
    const d = check('walk 10,000 steps', { habit: 'move', kind: 'check', targetCount: null, title: 'Walk 10000 Steps' });
    expect(d.questions.map((q) => q.id)).not.toContain('amount');
  });
  it('a bare number asks how many', () => {
    const d = check('push-ups 15', { habit: 'move', kind: 'count', targetCount: 15 });
    expect(d.questions.map((q) => q.id)).toContain('amount');
  });
  it('number words become digits', () => {
    check('do twenty pushups', { habit: 'move', kind: 'count', targetCount: 20, title: 'Do 20 Pushups' });
    check('lire trente pages', { habit: 'study', kind: 'count', targetCount: 30 });
  });
});

describe('parseQuestDraft: recurrence', () => {
  it('daily in several phrasings', () => {
    for (const s of ['stretch every day', 'stretch daily', 'stretch each day', 'stretch everyday', 'stretch 5 minutes a day', 'étirements tous les jours']) {
      expect(parseQuestDraft(s).recurrence, s).toBe('daily');
    }
  });
  it('weekdays', () => {
    for (const s of ['stretch on weekdays', 'stretch every weekday', 'stretch monday to friday', 'étirements en semaine']) {
      expect(parseQuestDraft(s).recurrence, s).toBe('weekdays');
    }
  });
  it('N days a week and weekly', () => {
    check('exercise 4 days a week', { habit: 'move', recurrence: 'weekly:4' });
    check('clean the bathroom weekly', { habit: 'clean', recurrence: 'weekly:1', pinWeekday: null });
    check('go to the gym 7 times a week', { recurrence: 'daily' });
  });
  it('a plural or "every" weekday pins the day; a single "on Friday" does not', () => {
    check('clean the bathroom on saturdays', { habit: 'clean', recurrence: 'weekly:1', pinWeekday: 6 });
    check('water the plants every sunday', { habit: 'clean', recurrence: 'weekly:1', pinWeekday: 0 });
    check('every Monday call grandma', { habit: 'social', recurrence: 'weekly:1', pinWeekday: 1, title: 'Call Grandma' });
    check('call grandma on Friday', { habit: 'social', recurrence: 'once', pinWeekday: null, title: 'Call Grandma' });
  });
  it('two named weekdays become N times a week', () => {
    check('take out the trash on tuesdays and fridays', { habit: 'clean', recurrence: 'weekly:2', pinWeekday: null, title: 'Take Out the Trash' });
  });
  it('"morning and evening" is daily with no single slot', () => {
    check('wash my face morning and evening', { habit: 'hygiene', recurrence: 'daily', timeSlot: 'any', title: 'Wash My Face' });
  });
});

describe('parseQuestDraft: time of day', () => {
  it('words and clock times', () => {
    check('go for a walk in the afternoon', { timeSlot: 'afternoon', title: 'Go for a Walk' });
    check('wake up at 7am every day', { habit: 'sleep', recurrence: 'daily', timeSlot: 'morning', title: 'Wake Up' });
    check('go to bed by 11pm', { habit: 'sleep', timeSlot: 'evening', title: 'Go to Bed' });
    check('cook dinner tonight', { habit: 'eat', timeSlot: 'evening', recurrence: 'once', title: 'Cook Dinner' });
    check('take a nap after lunch', { habit: 'sleep', timeSlot: 'afternoon', title: 'Take a Nap' });
    check('sit outside in the sun for 15 min at noon', { habit: 'outside', kind: 'timer', durationMin: 15, timeSlot: 'afternoon' });
  });
  it('an explicit word wins over a clock time', () => {
    check('stretch in the evening at 7am', { timeSlot: 'evening' });
  });
});

describe('parseQuestDraft: titles and filler', () => {
  it('strips "I want to" and friends', () => {
    check('Hey, I would like to go outside for 10 minutes', { habit: 'outside', kind: 'timer', durationMin: 10, title: 'Go Outside' });
    check("I'd like to read a chapter every night", { habit: 'study', title: 'Read a Chapter', recurrence: 'daily' });
    check('remind me to call grandma', { habit: 'social', title: 'Call Grandma' });
    check('je veux courir 30 minutes', { habit: 'move', kind: 'timer', durationMin: 30, title: 'Courir' }, 'fr');
  });
  it('Title Case with small words lower, at most 40 characters', () => {
    const d = parseQuestDraft('prepare a really long and complicated dinner for the whole extended family on sunday afternoon');
    expect(d.title.length).toBeLessThanOrEqual(40);
    expect(d.title).toMatch(/^[A-Z]/);
    expect(parseQuestDraft('walk in the park').title).toBe('Walk in the Park');
  });
  it('the description is the cleaned sentence', () => {
    const d = parseQuestDraft('  tidy   the kitchen ');
    expect(d.description).toBe('Tidy the kitchen.');
    expect(d.transcript).toBe('tidy   the kitchen');
  });
  it('a very long sentence keeps the description under 160 characters', () => {
    expect(parseQuestDraft('walk '.repeat(80)).description.length).toBeLessThanOrEqual(160);
  });
});

describe('parseQuestDraft: low confidence and edge cases', () => {
  it('nothing recognisable defaults to Move and asks which vassal', () => {
    const d = parseQuestDraft('blorp');
    expect(d.habit).toBe('move');
    expect(d.confidence.habit).toBeLessThan(0.2);
    expect(d.questions.map((q) => q.id)).toContain('habit');
    expect(d.title).toBe('Blorp');
  });
  it('an empty transcript asks for a sentence', () => {
    const d = parseQuestDraft('   ');
    expect(d.questions).toEqual([{ id: 'empty', field: 'transcript' }]);
    expect(d.title).toBe('');
  });
  it('a sentence of only a schedule falls back to the habit name and asks for a title', () => {
    const d = parseQuestDraft('every day at 7pm');
    expect(d.title).not.toBe('');
    expect(d.questions.map((q) => q.id)).toContain('title');
  });
  it('confidence is always between 0 and 1', () => {
    for (const s of ['walk', 'do 20 pushups', 'xyz', 'every day', '12345', '\u{1F600} walk \u{1F600}', 'one hour', 'a']) {
      const d = parseQuestDraft(s);
      for (const v of Object.values(d.confidence)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
  it('never throws on odd input', () => {
    for (const s of ['', ' ', '...', '!!!', '1', '0 minutes', '99999 minutes', '\n\t', 'ñandú 3 veces por semana', 'x'.repeat(5000)]) {
      expect(() => parseQuestDraft(s), s).not.toThrow();
    }
  });
  it('is deterministic', () => {
    const a = parseQuestDraft('walk 30 minutes in the park every morning');
    const b = parseQuestDraft('walk 30 minutes in the park every morning');
    expect(a).toEqual(b);
  });
  it('tier follows the effort and is capped by it', () => {
    const timer = parseQuestDraft('run for 45 minutes');
    expect(timer.tier).toBe(3);
    expect(timer.maxTier).toBe(3);
    const tidy = parseQuestDraft('tidy the kitchen');
    expect(tidy.tier).toBe(1);
    expect(tidy.maxTier).toBe(2);
    expect(parseQuestDraft('stretch for 5 minutes').maxTier).toBe(1);
  });
});

describe('scoreHabits', () => {
  it('sums weights and favours the player language on ties', () => {
    const s = scoreHabits('walk in the park', 'en');
    expect(s.move).toBeGreaterThan(s.outside);
    expect(s.clean).toBe(0);
    expect(scoreHabits('bain', 'fr').hygiene).toBeGreaterThan(scoreHabits('bain', 'en').hygiene);
  });
});

/**
 * The content is the work of this game, so it is tested like code: counts,
 * lengths, tags, parity between English and French, forbidden topics, tone.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES, type Locale } from '../contract';
import { MOODS, SCENARIOS, STYLES, TOPICS, isGoodStyle, wordCount, type ScenarioText } from './content';
import { TEXTS, getText } from './texts';

function eachScenario(fn: (locale: Locale, id: string, text: ScenarioText) => void): void {
  for (const locale of LOCALES) for (const shape of SCENARIOS) fn(locale, shape.id, TEXTS[locale][shape.id]!);
}

/** Topics the dungeon must never touch (brief: self-harm, abuse, trauma, medical or legal advice, politics, religion, triggers). */
const FORBIDDEN: Record<Locale, RegExp[]> = {
  en: [
    /suicid/i, /self[- ]?harm/i, /kill (my|your)self/i, /\babus(e|ed|ive|er)\b/i, /trauma/i, /violen/i, /assault/i, /\brape/i, /harass/i, /bully|bullied/i,
    /diagnos/i, /therap/i, /medicat/i, /prescri/i, /\bdoctors?\b/i, /\bpills?\b/i, /depress/i, /anxiety/i, /panic attack/i, /disorder/i, /\bcancer\b/i, /\billness/i,
    /\blawyers?\b/i, /\blegal/i, /lawsuit|\bsue\b|\bsued\b|\bcourt\b/i, /\bpolice\b/i,
    /politic/i, /government/i, /election/i, /\bvote/i, /\bpresident\b/i,
    /\bgod\b/i, /church/i, /prayer|\bpray/i, /religio/i, /mosque|temple|synagogue/i,
    /\bdeath\b/i, /\bdie[ds]?\b/i, /\bdead\b/i, /funeral/i, /grief|mourn/i, /\bwine\b|\bbeer\b|alcohol|\bdrunk/i, /\bdrugs?\b/i, /\bdiet\b|calorie|\bweight\b/i, /\bdebt/i, /bankrupt/i,
  ],
  fr: [
    /suicid/i, /automutil/i, /se tuer/i, /\bviol(s|er|ence|ent|ente|ences)?\b/i, /traum/i, /agress/i, /harcèlement|harcel/i, /\babus(e|er|é|ée|ent|ant)?\b/i,
    /diagnost/i, /thérap/i, /médic/i, /ordonnance/i, /\bmédecin/i, /dépress/i, /anxiét/i, /crise d'angoisse/i, /trouble/i, /\bcancer\b/i, /\bmaladie/i,
    /avocat/i, /\bjuridi/i, /\bprocès\b/i, /tribunal/i, /\bpolice\b/i,
    /politi/i, /gouvernement/i, /élection/i, /\bvoter?\b/i, /\bprésident\b/i,
    /\bdieu\b/i, /église/i, /prière|\bprier\b/i, /religio/i, /mosquée|synagogue/i,
    /\bmort\b|\bmorte\b|\bdécès/i, /enterrement|obsèques/i, /deuil/i, /\bvin\b|\bbière\b|alcool|\bivre\b/i, /\bdrogue/i, /\brégime\b|calorie|\bpoids\b/i, /\bdettes?\b/i, /faillite/i,
  ],
};

const SHAMING: Record<Locale, RegExp[]> = {
  en: [/\byou (should|must|ought)\b/i, /\b(stupid|idiot|pathetic|lazy|weak|loser|selfish|childish|immature|useless|worthless)\b/i, /\byour fault\b/i, /\bbad (person|friend)\b/i],
  fr: [/\btu (dois|devrais|aurais dû)\b/i, /\b(idiot|bête|nul|nulle|pathétique|paresseu|faible|égoïste|immature|inutile)/i, /\bta faute\b/i, /\bmauvais(e)? (ami|personne)/i],
};

describe('Decision Dungeon content: counts and structure', () => {
  it('has 18 scenarios with unique ids, and the same ids in both languages', () => {
    expect(SCENARIOS).toHaveLength(18);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(18);
    for (const locale of LOCALES) expect(Object.keys(TEXTS[locale]).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  it('has the same structure in English and French: option count and style of every option', () => {
    for (const shape of SCENARIOS) {
      const en = TEXTS.en[shape.id]!;
      const fr = TEXTS.fr[shape.id]!;
      expect(en.options, shape.id).toHaveLength(shape.styles.length);
      expect(fr.options, shape.id).toHaveLength(shape.styles.length);
      expect(en.options.map((o) => o.style), `en ${shape.id}`).toEqual([...shape.styles]);
      expect(fr.options.map((o) => o.style), `fr ${shape.id}`).toEqual([...shape.styles]);
    }
  });

  it('uses only known tags, moods and topics, and 3 or 4 options per scenario', () => {
    for (const s of SCENARIOS) {
      expect(MOODS).toContain(s.mood);
      expect(TOPICS).toContain(s.topic);
      expect([1, 2, 3]).toContain(s.ease);
      expect(s.styles.length).toBeGreaterThanOrEqual(3);
      expect(s.styles.length).toBeLessThanOrEqual(4);
      for (const style of s.styles) expect(STYLES).toContain(style);
    }
  });

  it('has one or two constructive options per scenario, never only constructive ones, and a scene with no good option left out', () => {
    for (const s of SCENARIOS) {
      const constructive = s.styles.filter((x) => x === 'constructive').length;
      expect(constructive, s.id).toBeGreaterThanOrEqual(1);
      expect(constructive, s.id).toBeLessThanOrEqual(2);
      expect(s.styles.some((x) => !isGoodStyle(x)), s.id).toBe(true);
      expect(s.styles.some((x) => x === 'reactive' || x === 'avoidant'), s.id).toBe(true);
    }
  });

  it('covers every mood and every topic, and walks 6 scenes at each ease', () => {
    expect(new Set(SCENARIOS.map((s) => s.mood))).toEqual(new Set(MOODS));
    expect(new Set(SCENARIOS.map((s) => s.topic))).toEqual(new Set(TOPICS));
    for (const ease of [1, 2, 3]) expect(SCENARIOS.filter((s) => s.ease === ease)).toHaveLength(6);
  });

  it('uses every one of the five styles, boundary and curious in a good share of the scenes', () => {
    for (const style of STYLES) expect(SCENARIOS.filter((s) => s.styles.includes(style)).length, style).toBeGreaterThanOrEqual(5);
  });
});

describe('Decision Dungeon content: lengths', () => {
  it('has a 25 to 50 word situation in every scenario, in both languages', () => {
    eachScenario((locale, id, t) => {
      const n = wordCount(t.situation);
      expect(n, `${locale} ${id} situation has ${n} words`).toBeGreaterThanOrEqual(25);
      expect(n, `${locale} ${id} situation has ${n} words`).toBeLessThanOrEqual(50);
    });
  });

  it('has a 20 to 40 word reflection on every option, in both languages', () => {
    eachScenario((locale, id, t) => {
      t.options.forEach((o, i) => {
        const n = wordCount(o.reflection);
        expect(n, `${locale} ${id}[${i}] reflection has ${n} words`).toBeGreaterThanOrEqual(20);
        expect(n, `${locale} ${id}[${i}] reflection has ${n} words`).toBeLessThanOrEqual(40);
      });
    });
  });

  it('has short labels, short cues and a reframing question in every scenario', () => {
    eachScenario((locale, id, t) => {
      expect(t.reframe, `${locale} ${id}`).toMatch(/[?]$/);
      expect(wordCount(t.reframe), `${locale} ${id} reframe`).toBeLessThanOrEqual(25);
      t.options.forEach((o, i) => {
        expect(wordCount(o.label), `${locale} ${id}[${i}] label`).toBeGreaterThanOrEqual(5);
        expect(wordCount(o.label), `${locale} ${id}[${i}] label`).toBeLessThanOrEqual(26);
        expect(wordCount(o.cue), `${locale} ${id}[${i}] cue`).toBeGreaterThanOrEqual(1);
        expect(wordCount(o.cue), `${locale} ${id}[${i}] cue`).toBeLessThanOrEqual(5);
      });
    });
  });

  it('has no duplicate label, cue or reflection within a language', () => {
    for (const locale of LOCALES) {
      const all = SCENARIOS.flatMap((s) => TEXTS[locale][s.id]!.options);
      for (const key of ['label', 'reflection'] as const) expect(new Set(all.map((o) => o[key])).size, `${locale} ${key}`).toBe(all.length);
      for (const s of SCENARIOS) {
        const cues = TEXTS[locale][s.id]!.options.map((o) => o.cue);
        expect(new Set(cues).size, `${locale} ${s.id} cues`).toBe(cues.length);
      }
    }
  });
});

describe('Decision Dungeon content: topics and tone', () => {
  it('keeps the forbidden topics out of every text (keyword guard, both languages)', () => {
    eachScenario((locale, id, t) => {
      const texts = [t.situation, t.reframe, ...t.options.flatMap((o) => [o.label, o.cue, o.reflection])];
      for (const text of texts) for (const word of FORBIDDEN[locale]) expect(text, `${locale} ${id}: "${text}" matches ${word}`).not.toMatch(word);
    });
  });

  it('keeps the guard itself honest: it flags a sample of forbidden words', () => {
    expect('She talked about suicide').toMatch(FORBIDDEN.en.find((r) => r.test('suicide'))!);
    expect('Un avocat et un procès').toMatch(FORBIDDEN.fr.find((r) => r.test('avocat'))!);
    expect(FORBIDDEN.en.some((r) => r.test('They voted in the election'))).toBe(true);
    expect(FORBIDDEN.fr.some((r) => r.test('Il va à la mosquée'))).toBe(true);
    expect(FORBIDDEN.en.some((r) => r.test('I had a lovely coffee with my sister'))).toBe(false);
  });

  it('never shames: no verdicts, no "you should", no insults in any reflection', () => {
    eachScenario((locale, id, t) => {
      for (const o of t.options) for (const rule of SHAMING[locale]) expect(o.reflection, `${locale} ${id}`).not.toMatch(rule);
    });
  });

  it('has no digits, links or phone numbers anywhere in the scenes', () => {
    eachScenario((locale, id, t) => {
      const texts = [t.situation, t.reframe, ...t.options.flatMap((o) => [o.label, o.cue, o.reflection])];
      for (const text of texts) {
        expect(text, `${locale} ${id}`).not.toMatch(/\d/);
        expect(text, `${locale} ${id}`).not.toMatch(/https?:|www\.|@/i);
      }
    });
  });

  it('never opens the reflection of a reactive or avoidant door with praise', () => {
    const praise: Record<Locale, RegExp> = { en: /^(Well done|Nicely done|Great job|Perfect)/, fr: /^(Bien joué|Bravo|Parfait)/ };
    eachScenario((locale, id, t) => {
      for (const o of t.options) if (o.style === 'reactive' || o.style === 'avoidant') expect(o.reflection, `${locale} ${id}`).not.toMatch(praise[locale]);
    });
  });

  it('writes French with the informal "tu" and never the formal "vous" in a reflection or a label', () => {
    for (const s of SCENARIOS) {
      const t = TEXTS.fr[s.id]!;
      for (const o of t.options) {
        expect(o.reflection, s.id).not.toMatch(/\bvotre\b|\bvos\b/i);
        expect(`${o.label} ${o.cue}`, s.id).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
      }
      expect(t.situation, s.id).toMatch(/\b(tu|te|t'|ton|ta|tes|toi)\b/i);
    }
  });

  it('leaves no English word in the French scenes', () => {
    const english = /\b(the|and|you|your|with|this|that|have)\b/i;
    for (const s of SCENARIOS) {
      const t = TEXTS.fr[s.id]!;
      for (const text of [t.situation, t.reframe, ...t.options.flatMap((o) => [o.label, o.cue, o.reflection])]) expect(text, s.id).not.toMatch(english);
    }
  });

  it('uses typographic spaces in French before a question mark, a colon or a semicolon', () => {
    for (const s of SCENARIOS) {
      const t = TEXTS.fr[s.id]!;
      for (const text of [t.situation, t.reframe, ...t.options.flatMap((o) => [o.label, o.cue, o.reflection])]) expect(text, s.id).not.toMatch(/ [?!:;]/);
    }
  });
});

describe('Decision Dungeon content: the good door is not a giveaway', () => {
  it('keeps the reflections of good and other doors the same length on average', () => {
    for (const locale of LOCALES) {
      const avg = (pick: (style: string) => boolean): number => {
        const all = SCENARIOS.flatMap((s) => TEXTS[locale][s.id]!.options).filter((o) => pick(o.style));
        return all.reduce((n, o) => n + wordCount(o.reflection), 0) / all.length;
      };
      expect(Math.abs(avg((s) => s === 'constructive' || s === 'boundary') - avg((s) => s !== 'constructive' && s !== 'boundary')), locale).toBeLessThan(5);
    }
  });

  it('puts the constructive option in different source positions, rarely the last one', () => {
    const firsts = SCENARIOS.map((s) => s.styles.indexOf('constructive'));
    expect(new Set(firsts).size).toBeGreaterThanOrEqual(3);
    const last = SCENARIOS.filter((s) => s.styles[s.styles.length - 1] === 'constructive').length;
    expect(last).toBeLessThanOrEqual(6);
    for (const position of [0, 1, 2]) expect(firsts.filter((p) => p === position).length, `position ${position}`).toBeGreaterThanOrEqual(3);
  });

  it('exposes the scene text through getText', () => {
    expect(getText('en', 's01')?.options).toHaveLength(3);
    expect(getText('fr', 's18')?.options).toHaveLength(4);
    expect(getText('en', 'nope')).toBeUndefined();
  });
});

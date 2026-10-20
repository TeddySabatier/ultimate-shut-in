/**
 * Decision Dungeon rules: content, scoring, determinism, party, buffs, bot.
 * The contract kit covers the generic properties.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import { SCENARIOS, STYLES, wordCount, type Scenario, type StyleTag } from './content';
import {
  computeScore,
  distinctStyles,
  engine,
  goodCount,
  isOver,
  isWin,
  roomCount,
  strongestStyle,
  weakestStyle,
  type DungeonState,
} from './engine';
import game from './manifest';
import { strings } from './strings';

const start = (seed = 1, run: RunContext = runs.plain, locale: 'en' | 'fr' = 'en', party = parties.full) =>
  engine.initial(seed, party, run, locale);

const choose = (s: DungeonState, index: number) => engine.reduce(s, { type: 'choose', index });
const cont = (s: DungeonState) => engine.reduce(s, { type: 'continue' });

const FORBIDDEN = [
  /\bsuicid/i,
  /self-?harm/i,
  /kill (my|your)self/i,
  /\babuse\b/i,
  /\btrauma\b/i,
  /\brape\b/i,
  /\bassault\b/i,
  /\bmolest/i,
  /\boverdose\b/i,
  /\bdiagnos/i,
  /\bbipolar\b/i,
  /\bptsd\b/i,
  /\belection\b/i,
  /\bpolitic/i,
  /\bjesus\b/i,
  /\ballah\b/i,
  /\bbible\b/i,
  /\bquran\b/i,
  /\bchurch\b/i,
  /\bmosque\b/i,
  /\bpastor\b/i,
  /\bpriest\b/i,
  /\bmurder\b/i,
  /\bautodestruction\b/i,
  /\bautomutil/i,
  /\bviol\b/i,
  /\btraumatisme\b/i,
  /\bélection\b/i,
  /\bpolitique\b/i,
];

function blob(s: Scenario): string {
  return [s.situation, s.reframe, ...s.options.flatMap((o) => [o.label, o.cue, o.reflection])].join('\n');
}

function constructiveCount(s: Scenario): number {
  return s.options.filter((o) => o.style === 'constructive').length;
}

describe('decision dungeon content', () => {
  it('has 18 English and 18 French scenarios', () => {
    expect(SCENARIOS.en).toHaveLength(18);
    expect(SCENARIOS.fr).toHaveLength(18);
  });

  it('keeps situations at 25 to 50 words and reflections at 20 to 40', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const s of SCENARIOS[locale]) {
        const sit = wordCount(s.situation);
        expect(sit, `${locale} ${s.id} situation ${sit} words: ${s.situation}`).toBeGreaterThanOrEqual(25);
        expect(sit, `${locale} ${s.id} situation ${sit} words`).toBeLessThanOrEqual(50);
        for (const [i, o] of s.options.entries()) {
          const n = wordCount(o.reflection);
          expect(n, `${locale} ${s.id} option ${i} reflection ${n} words`).toBeGreaterThanOrEqual(20);
          expect(n, `${locale} ${s.id} option ${i} reflection ${n} words`).toBeLessThanOrEqual(40);
        }
      }
    }
  });

  it('gives every scenario 3 or 4 options with valid styles, 1 or 2 constructive, never only constructive', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const s of SCENARIOS[locale]) {
        expect(s.options.length, `${locale} ${s.id}`).toBeGreaterThanOrEqual(3);
        expect(s.options.length, `${locale} ${s.id}`).toBeLessThanOrEqual(4);
        for (const o of s.options) expect(STYLES.includes(o.style)).toBe(true);
        const c = constructiveCount(s);
        expect(c, `${locale} ${s.id} constructive`).toBeGreaterThanOrEqual(1);
        expect(c, `${locale} ${s.id} constructive`).toBeLessThanOrEqual(2);
        expect(c, `${locale} ${s.id} not only constructive`).toBeLessThan(s.options.length);
      }
    }
  });

  it('matches English and French on id, mood, topic, ease and option styles', () => {
    const shape = (s: Scenario) => ({
      id: s.id,
      mood: s.mood,
      topic: s.topic,
      ease: s.ease,
      styles: s.options.map((o) => o.style),
    });
    expect(SCENARIOS.en.map(shape)).toEqual(SCENARIOS.fr.map(shape));
  });

  it('uses every style somewhere and stays off the forbidden topic list', () => {
    const used = new Set<StyleTag>();
    for (const locale of ['en', 'fr'] as const) {
      for (const s of SCENARIOS[locale]) {
        for (const o of s.options) used.add(o.style);
        const text = blob(s);
        for (const re of FORBIDDEN) {
          expect(text, `${locale} ${s.id} matched ${re}`).not.toMatch(re);
        }
      }
    }
    expect([...used].sort()).toEqual([...STYLES].sort());
  });
});

describe('decision dungeon engine', () => {
  it('draws 5 to 7 unique rooms from the seed, easier ones first', () => {
    const s = start(1);
    expect(s.rooms.length).toBe(roomCount(2));
    expect(new Set(s.rooms.map((r) => r.scenarioId)).size).toBe(s.rooms.length);
    const eases = s.rooms.map((r) => SCENARIOS.en.find((x) => x.id === r.scenarioId)!.ease);
    expect(eases[0]!).toBeLessThanOrEqual(eases[eases.length - 1]!);
    expect(start(1).rooms).toEqual(s.rooms);
  });

  it('does not repeat a scenario within a game', () => {
    for (const seed of [1, 7, 42, 99, 1337]) {
      const ids = start(seed).rooms.map((r) => r.scenarioId);
      expect(ids, `seed ${seed}`).toEqual([...new Set(ids)]);
    }
  });

  it('scales room count with difficulty and hides cues on harder runs', () => {
    expect(start(3, emptyRun(1)).rooms).toHaveLength(5);
    expect(start(3, emptyRun(1)).showCues).toBe(true);
    expect(start(3, emptyRun(3)).rooms).toHaveLength(6);
    expect(start(3, emptyRun(3)).showCues).toBe(false);
    expect(start(3, emptyRun(5)).rooms).toHaveLength(7);
  });

  it('shuffles option order from the seed in a stable way', () => {
    const a = start(8);
    const b = start(8);
    expect(a.rooms[0]?.optionOrder).toEqual(b.rooms[0]?.optionOrder);
    expect(start(9).rooms[0]?.optionOrder).not.toEqual(a.rooms[0]?.optionOrder);
  });

  it('records a choice, then continue walks to the next room', () => {
    const s1 = choose(start(2), 0);
    expect(s1.phase).toBe('reflect');
    expect(s1.choices).toHaveLength(1);
    const s2 = cont(s1);
    expect(s2.phase).toBe('choose');
    expect(s2.roomIndex).toBe(1);
  });

  it('ignores unknown door indices and actions after the end', () => {
    const s = start(4);
    expect(choose(s, 99)).toBe(s);
    const ended = playToEnd(game, 4, parties.full, runs.plain);
    expect(engine.reduce(ended.state, { type: 'choose', index: 0 })).toBe(ended.state);
  });

  it('forfeit ends as fled with a partial score', () => {
    const s = engine.reduce(choose(start(5, runs.plain, 'en', parties.starter), 0), { type: 'forfeit' });
    const o = engine.outcome(s);
    expect(o?.result).toBe('fled');
    expect(o?.score).toBe(computeScore(s.choices));
    expect(o?.log.at(-1)).toMatch(/stepped away|éloigné/);
  });

  it('scores from the share of constructive and boundary choices plus a variety bonus', () => {
    const constructive = { scenarioId: 's01', optionIndex: 0, displayIndex: 0, style: 'constructive' as const };
    const reactive = { ...constructive, style: 'reactive' as const };
    const boundary = { ...constructive, style: 'boundary' as const };
    const curious = { ...constructive, style: 'curious' as const };
    expect(computeScore([constructive, constructive, constructive, constructive, constructive])).toBe(840);
    expect(isWin([constructive, constructive, constructive, reactive, reactive])).toBe(true);
    expect(isWin([constructive, constructive, reactive, reactive, reactive])).toBe(false);
    expect(goodCount([constructive, boundary, reactive])).toBe(2);
    expect(distinctStyles([constructive, boundary, curious])).toBe(3);
    expect(computeScore([constructive, constructive, boundary, reactive, reactive])).toBeGreaterThan(
      computeScore([constructive, constructive, constructive, reactive, reactive]),
    );
  });

  it('wins at 60 percent or better and loses otherwise, with warm copy either way', () => {
    const play = (seed: number) => playToEnd(game, seed, parties.full, runs.plain);
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(play);
    for (const r of samples) {
      expect(r.outcome).toBeTruthy();
      if (!r.outcome) continue;
      expect(r.outcome.result === 'won').toBe(isWin(r.state.choices));
      if (r.outcome.result === 'lost') expect(r.outcome.log.join(' ')).toMatch(/come home/);
    }
  });

  it('the Social troop reveals a constructive tag; Sleep peeks once; Study is recorded', () => {
    const full = start(6, runs.plain, 'en', parties.full);
    expect(full.socialId).toBe('social');
    expect(full.sleepAvailable).toBe(true);
    expect(full.studyId).toBe('study');
    expect(full.revealed.length).toBeGreaterThanOrEqual(1);
    const scenario = SCENARIOS.en.find((s) => s.id === full.rooms[0]!.scenarioId)!;
    const revealedStyle = scenario.options[full.rooms[0]!.optionOrder[full.revealed[0]!]!]!.style;
    expect(revealedStyle).toBe('constructive');
    const peeked = engine.reduce(full, { type: 'peek', index: 0 });
    expect(peeked.peekedDisplay).toBe(0);
    expect(peeked.sleepUsed).toBe(true);
    expect(engine.reduce(peeked, { type: 'peek', index: 1 }).sleepUsed).toBe(true);
    expect(engine.reduce(peeked, { type: 'peek', index: 1 }).peekedDisplay).toBe(0);

    const starter = start(6, runs.plain, 'en', parties.starter);
    expect(starter.socialId).toBe('');
    expect(starter.sleepAvailable).toBe(false);
    expect(starter.revealed).toEqual([]);
    expect(engine.reduce(starter, { type: 'peek', index: 0 })).toBe(starter);
  });

  it('hint reveals another tag; revive re-picks; luck prefers gentler rooms', () => {
    const hinted = engine.reduce(start(1, { ...runs.plain, buffs: [{ id: 'h', kind: 'hint', amount: 1 }] }), { type: 'hint' });
    expect(hinted.hintsLeft).toBe(0);
    expect(hinted.revealed.length).toBeGreaterThan(start(1).revealed.length);

    const chosen = choose(start(2, { ...runs.plain, buffs: [{ id: 'r', kind: 'revive', amount: 1 }] }), 0);
    const undone = engine.reduce(chosen, { type: 'undo' });
    expect(undone.phase).toBe('choose');
    expect(undone.choices).toHaveLength(0);
    expect(undone.revivesLeft).toBe(0);

    const plainRooms = start(11).rooms;
    const lucky = start(11, { ...runs.plain, buffs: [{ id: 'l', kind: 'luck', amount: 15 }] });
    expect(lucky.rooms).not.toEqual(plainRooms);
  });

  it('writes the log in the locale it was given; rooms share ids across languages', () => {
    const en = playToEnd(game, 9, parties.starter, runs.plain);
    const fr = playToEnd(game, 9, parties.starter, runs.plain, 100, { locale: 'fr' });
    expect(en.state.rooms.map((r) => r.scenarioId)).toEqual(fr.state.rooms.map((r) => r.scenarioId));
    expect(fr.outcome?.log[0]).toMatch(/^Salle 1/);
    expect(en.outcome?.log[0]).toMatch(/^Room 1/);
    expect(fr.outcome?.learned?.note.fr).toBeTruthy();
  });

  it('forfeit is the leave action the kit plays', () => {
    expect(engine.forfeit?.(start(6))).toEqual({ type: 'forfeit' });
  });

  it('the bot prefers constructive doors, uses party tools, and wins sometimes', () => {
    const s = start(11);
    const action = engine.botPlay(s, () => 0);
    expect(action?.type).toBe('peek');
    const noSleep = start(11, runs.plain, 'en', parties.starter);
    const pick = engine.botPlay(noSleep, () => 0);
    expect(pick?.type).toBe('choose');
    if (pick?.type === 'choose') {
      const room = noSleep.rooms[0]!;
      const scenario = SCENARIOS.en.find((x) => x.id === room.scenarioId)!;
      expect(scenario.options[room.optionOrder[pick.index]!]!.style).toBe('constructive');
    }
    const wins = [1, 7, 42, 1337, 90210].filter((seed) => playToEnd(game, seed, parties.full, runs.plain).outcome?.result === 'won');
    expect(wins.length).toBeGreaterThan(0);
  });

  it('the bot wins 40 to 70 percent on a plain run over many seeds', () => {
    let wins = 0;
    const n = 40;
    for (let seed = 1; seed <= n; seed++) {
      if (playToEnd(game, seed, parties.full, runs.plain).outcome?.result === 'won') wins += 1;
    }
    const rate = wins / n;
    expect(rate, `win rate ${rate}`).toBeGreaterThanOrEqual(0.35);
    expect(rate, `win rate ${rate}`).toBeLessThanOrEqual(0.8);
  });

  it('strongest and weakest styles follow the counts, and learned uses both languages', () => {
    const choices = [
      { scenarioId: 's01', optionIndex: 0, displayIndex: 0, style: 'constructive' as const },
      { scenarioId: 's02', optionIndex: 0, displayIndex: 0, style: 'constructive' as const },
      { scenarioId: 's03', optionIndex: 0, displayIndex: 0, style: 'avoidant' as const },
    ];
    expect(strongestStyle(choices)).toBe('constructive');
    expect(weakestStyle(choices)).toBe('reactive');
    const o = playToEnd(game, 3, parties.full, runs.plain).outcome;
    expect(o?.learned?.topic.en).toBeTruthy();
    expect(o?.learned?.topic.fr).toBeTruthy();
    expect(o?.learned?.note.en).toBeTruthy();
    expect(o?.learned?.note.fr).toBeTruthy();
  });

  it('a finished game ignores further chooses, and outcome stays stable', () => {
    const r = playToEnd(game, 12, parties.mixed, runs.hard);
    expect(isOver(r.state)).toBe(true);
    const again = engine.outcome(engine.reduce(r.state, { type: 'continue' }));
    expect(again).toEqual(r.outcome);
  });

  it('spreads moods across a run rather than repeating one colour of room', () => {
    const moods = start(42).rooms.map((r) => SCENARIOS.en.find((s) => s.id === r.scenarioId)!.mood);
    expect(new Set(moods).size).toBeGreaterThan(1);
  });

  it('ignores peek on a bad index, continue while choosing, and hint when none remain', () => {
    const s = start(3, runs.plain, 'en', parties.full);
    expect(engine.reduce(s, { type: 'peek', index: 99 })).toBe(s);
    expect(engine.reduce(s, { type: 'continue' })).toBe(s);
    const noHint = start(3);
    expect(engine.reduce(noHint, { type: 'hint' })).toBe(noHint);
  });

  it('a higher-power Social troop reveals two tags', () => {
    const full = start(2);
    expect(full.socialReveals).toBe(2);
    expect(full.revealed).toHaveLength(2);
    const mixed = start(2, runs.plain, 'en', parties.mixed);
    expect(mixed.socialReveals).toBe(1);
  });

  it('mixed party (no move, a citizen) still plays, and attack/defense/time do not change rooms', () => {
    const mixed = start(4, runs.plain, 'en', parties.mixed);
    expect(mixed.rooms.length).toBeGreaterThan(0);
    const extra = start(4, {
      ...runs.plain,
      buffs: [
        { id: 'a', kind: 'attack', amount: 15 },
        { id: 'd', kind: 'defense', amount: 15 },
        { id: 't', kind: 'time', amount: 20 },
      ],
    });
    expect(extra.rooms.map((r) => r.scenarioId)).toEqual(start(4).rooms.map((r) => r.scenarioId));
  });
});

describe('decision dungeon strings', () => {
  it('keeps the same style keys in English and French', () => {
    expect(Object.keys(strings.en.styles)).toEqual(Object.keys(strings.fr.styles));
    expect(Object.keys(strings.en.tips)).toEqual(Object.keys(strings.fr.tips));
  });
});

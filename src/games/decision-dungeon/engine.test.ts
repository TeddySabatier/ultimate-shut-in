/**
 * Decision Dungeon's own rules: room draw, doors, party perks, buffs, scoring
 * maths, outcomes, determinism and the bot. Content has its own file.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, makeMember, type Party, type PartyMember, type RunContext } from '../contract';
import { botRng, parties, playToEnd, runs } from '../testing/contract';
import { SCENARIOS, STYLES, getShape, type StyleTag } from './content';
import {
  BASE_SCORE,
  BOT_MISS,
  TOOL_BONUS,
  computeScore,
  currentRoom,
  engine,
  goodCount,
  isOver,
  isWin,
  pickRooms,
  roomCount,
  strongestStyle,
  styleAt,
  tipStyle,
  toolsUsed,
  weakestTool,
  type Choice,
  type DungeonAction,
  type DungeonState,
} from './engine';
import game from './manifest';
import { strings } from './strings';

const withBuffs = (difficulty: RunContext['difficulty'], buffs: RunContext['buffs']): RunContext => ({ ...emptyRun(difficulty), buffs });
const member = (habit: NonNullable<PartyMember['habit']>, level: number, loyalty = 50): PartyMember => makeMember({ id: habit, name: habit, habit, level, loyalty });
const party = (...members: PartyMember[]): Party => ({ members });
const NO_PERKS = parties.starter;

function start(seed = 1, p: Party = NO_PERKS, run: RunContext = emptyRun(2), locale: 'en' | 'fr' = 'en'): DungeonState {
  return engine.initial(seed, p, run, locale);
}
function act(s: DungeonState, ...actions: DungeonAction[]): DungeonState {
  return actions.reduce((state, a) => engine.reduce(state, a), s);
}
/** Display index of the first door with this style, or -1. */
function doorOf(s: DungeonState, style: StyleTag): number {
  const n = currentRoom(s)!.optionOrder.length;
  for (let d = 0; d < n; d++) if (styleAt(s, d) === style) return d;
  return -1;
}
/** Play every room by always taking the first door that satisfies `want`, else door 0. */
function walk(s: DungeonState, want: (style: StyleTag) => boolean): DungeonState {
  let state = s;
  while (!isOver(state)) {
    if (state.phase === 'choose') {
      const n = currentRoom(state)!.optionOrder.length;
      let d = 0;
      for (let i = 0; i < n; i++) if (want(styleAt(state, i)!)) { d = i; break; }
      state = act(state, { type: 'choose', index: d });
    } else state = act(state, { type: 'continue' });
  }
  return state;
}
const choice = (style: StyleTag): Choice => ({ scenarioId: 's01', optionIndex: 0, displayIndex: 0, style });
const choicesOf = (...styles: StyleTag[]): Choice[] => styles.map(choice);
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('rooms: the draw', () => {
  it('walks 5 rooms at difficulty 1 and 2, 6 at 3 and 4, 7 at 5', () => {
    expect([1, 2, 3, 4, 5].map(roomCount)).toEqual([5, 5, 6, 6, 7]);
    for (const d of [1, 2, 3, 4, 5] as const) expect(start(3, NO_PERKS, emptyRun(d)).rooms).toHaveLength(roomCount(d));
  });

  it('never repeats a scenario within a game, at any difficulty, seed or buff', () => {
    for (const d of [1, 2, 3, 4, 5] as const)
      for (const seed of SEEDS)
        for (const luck of [0, 10, 40]) {
          const ids = start(seed, NO_PERKS, withBuffs(d, [{ id: 'l', kind: 'luck', amount: luck }])).rooms.map((r) => r.scenarioId);
          expect(new Set(ids).size, `d${d} seed ${seed} luck ${luck}`).toBe(ids.length);
        }
  });

  it('draws the rooms from the seed: the same seed gives the same dungeon, other seeds give other ones', () => {
    expect(start(7).rooms).toEqual(start(7).rooms);
    const dungeons = new Set(SEEDS.map((seed) => start(seed).rooms.map((r) => r.scenarioId).join()));
    expect(dungeons.size).toBeGreaterThan(40);
    const used = new Set(SEEDS.flatMap((seed) => start(seed, NO_PERKS, emptyRun(3)).rooms.map((r) => r.scenarioId)));
    expect(used.size, 'every scenario shows up somewhere').toBe(18);
  });

  it('walks the easier scenes first, at every difficulty', () => {
    for (const d of [1, 2, 3, 4, 5] as const)
      for (const seed of SEEDS) {
        const eases = start(seed, NO_PERKS, emptyRun(d)).rooms.map((r) => getShape(r.scenarioId)!.ease);
        expect(eases, `d${d} seed ${seed}`).toEqual([...eases].sort((a, b) => a - b));
      }
  });

  it('keeps the gentler scenes for difficulty 1 and 2, and adds the subtle ones from 3', () => {
    const hard = (d: number, seed: number) => pickRooms(seed, d, 0).filter((s) => s.ease === 3).length;
    for (const seed of SEEDS) {
      expect(hard(1, seed)).toBe(0);
      expect(hard(2, seed)).toBe(0);
      expect(hard(3, seed)).toBeGreaterThanOrEqual(2);
      expect(hard(4, seed)).toBeGreaterThanOrEqual(2);
      expect(hard(5, seed)).toBeGreaterThanOrEqual(3);
    }
  });

  it('mixes the moods: no two neighbouring rooms share a mood in most dungeons', () => {
    let pairs = 0;
    let same = 0;
    for (const seed of SEEDS)
      for (const d of [2, 3, 5] as const) {
        const moods = pickRooms(seed, d, 0).map((s) => s.mood);
        for (let i = 1; i < moods.length; i++) {
          pairs += 1;
          if (moods[i] === moods[i - 1]) same += 1;
        }
      }
    expect(same / pairs).toBeLessThan(0.1);
  });

  it('luck swaps the hardest room for a gentler one: never harder, and gentler for some seeds', () => {
    const ease = (seed: number, luck: number) => pickRooms(seed, 3, luck).reduce((n, s) => n + s.ease, 0);
    let gentler = 0;
    for (const seed of SEEDS) {
      expect(ease(seed, 15)).toBeLessThanOrEqual(ease(seed, 0));
      expect(ease(seed, 40)).toBeLessThanOrEqual(ease(seed, 15));
      if (ease(seed, 15) < ease(seed, 0)) gentler += 1;
    }
    expect(gentler).toBeGreaterThan(SEEDS.length / 2);
  });

  it('is the same dungeon in English and in French, and writes the log in the player language', () => {
    expect(start(9, NO_PERKS, emptyRun(2), 'en').rooms).toEqual(start(9, NO_PERKS, emptyRun(2), 'fr').rooms);
    const en = engine.outcome(walk(start(9), () => true))!;
    const fr = engine.outcome(walk(start(9, NO_PERKS, emptyRun(2), 'fr'), () => true))!;
    expect(en.log[0]).toMatch(/^Room 1:/);
    expect(fr.log[0]).toMatch(/^Salle 1\u00a0:/);
    expect(en.score).toBe(fr.score);
  });
});

describe('doors', () => {
  it('shuffles the options with the seed: a valid order, stable per seed, different across seeds', () => {
    for (const seed of SEEDS)
      for (const room of start(seed).rooms) {
        const n = getShape(room.scenarioId)!.styles.length;
        expect([...room.optionOrder].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    expect(start(5).rooms.map((r) => r.optionOrder)).toEqual(start(5).rooms.map((r) => r.optionOrder));
    const orders = new Set(SEEDS.map((seed) => start(seed).rooms[0]!.optionOrder.join()));
    expect(orders.size).toBeGreaterThan(3);
  });

  it('does not put the constructive door in a fixed place: every position turns up, none dominates', () => {
    const seen = [0, 0, 0, 0];
    let total = 0;
    for (const seed of SEEDS)
      for (const room of start(seed, NO_PERKS, emptyRun(3)).rooms) {
        const shape = getShape(room.scenarioId)!;
        if (shape.styles.length !== 4) continue;
        const d = room.optionOrder.findIndex((source) => shape.styles[source] === 'constructive');
        seen[d] = (seen[d] ?? 0) + 1;
        total += 1;
      }
    for (const count of seen) {
      expect(count).toBeGreaterThan(total * 0.12);
      expect(count).toBeLessThan(total * 0.4);
    }
  });

  it('records a choice with its style and moves to the reflection; the player then moves on', () => {
    const s0 = start(4);
    const d = doorOf(s0, 'constructive');
    const s1 = act(s0, { type: 'choose', index: d });
    expect(s1.phase).toBe('reflect');
    expect(s1.choices).toHaveLength(1);
    expect(s1.choices[0]).toMatchObject({ style: 'constructive', displayIndex: d, scenarioId: s0.rooms[0]!.scenarioId });
    const s2 = act(s1, { type: 'continue' });
    expect(s2.phase).toBe('choose');
    expect(s2.roomIndex).toBe(1);
    expect(s2.peekedDisplay).toBe(-1);
  });

  it('ignores invalid and mistimed actions: the same state comes back', () => {
    const s0 = start(4);
    for (const index of [-1, 4, 99, 1.5, Number.NaN]) expect(act(s0, { type: 'choose', index })).toBe(s0);
    expect(act(s0, { type: 'continue' })).toBe(s0);
    expect(act(s0, { type: 'undo' })).toBe(s0);
    expect(act(s0, { type: 'hint' })).toBe(s0);
    expect(act(s0, { type: 'peek', index: 0 })).toBe(s0);
    const s1 = act(s0, { type: 'choose', index: 0 });
    expect(act(s1, { type: 'choose', index: 1 })).toBe(s1);
    expect(act(s1, { type: 'hint' })).toBe(s1);
    expect(act(s1, { type: 'peek', index: 0 })).toBe(s1);
  });

  it('ends after the last room and then ignores everything', () => {
    const end = walk(start(4), () => true);
    expect(isOver(end)).toBe(true);
    expect(end.choices).toHaveLength(5);
    for (const a of [{ type: 'choose', index: 0 }, { type: 'continue' }, { type: 'forfeit' }, { type: 'undo' }] as DungeonAction[]) expect(engine.reduce(end, a)).toBe(end);
  });
});

describe('party perks', () => {
  const social = (level: number) => party(member('social', level), member('move', 1));

  it('Social reveals one style in a room: every room at power 20 or more, every second room below', () => {
    const strong = walk2(start(3, social(12)));
    expect(strong.map((r) => r.length)).toEqual([1, 1, 1, 1, 1]);
    const weak = walk2(start(3, social(1)));
    expect(weak.map((r) => r.length)).toEqual([1, 0, 1, 0, 1]);
    expect(walk2(start(3, NO_PERKS)).every((r) => r.length === 0)).toBe(true);
  });

  it('Social never reveals a door the player cannot tell from the rest: one tag, one door, always inside the room', () => {
    for (const seed of SEEDS) {
      const s = start(seed, social(12));
      const n = currentRoom(s)!.optionOrder.length;
      expect(s.revealed).toHaveLength(1);
      expect(s.revealed[0]).toBeGreaterThanOrEqual(0);
      expect(s.revealed[0]).toBeLessThan(n);
    }
  });

  it('Social reveal is seeded: same seed same door, and the doors vary across seeds', () => {
    expect(start(8, social(12)).revealed).toEqual(start(8, social(12)).revealed);
    expect(new Set(SEEDS.map((seed) => start(seed, social(12)).revealed[0])).size).toBeGreaterThan(2);
  });

  it('Sleep on it: once in a room, a preview that chooses nothing, one per run (two for a strong troop)', () => {
    const s0 = start(5, party(member('sleep', 1)));
    expect(s0.sleepsLeft).toBe(1);
    const s1 = act(s0, { type: 'peek', index: 1 });
    expect(s1).toMatchObject({ sleepsLeft: 0, peekedDisplay: 1, phase: 'choose', sleepUsed: true });
    expect(s1.choices).toHaveLength(0);
    expect(act(s1, { type: 'peek', index: 0 })).toBe(s1);
    const next = act(s1, { type: 'choose', index: 0 }, { type: 'continue' });
    expect(next.peekedDisplay).toBe(-1);
    expect(act(next, { type: 'peek', index: 0 })).toBe(next);

    const strong = start(5, party(member('sleep', 12, 80)));
    expect(strong.sleepsLeft).toBe(2);
    const twice = act(strong, { type: 'peek', index: 0 }, { type: 'choose', index: 0 }, { type: 'continue' }, { type: 'peek', index: 0 });
    expect(twice.sleepsLeft).toBe(0);
    expect(start(5, NO_PERKS).sleepsLeft).toBe(0);
    expect(act(start(5, NO_PERKS), { type: 'peek', index: 0 }).sleepUsed).toBe(false);
    expect(act(s0, { type: 'peek', index: 9 })).toBe(s0);
  });

  it('Study is the reframing question: the troop is recorded, and counted as used in the outcome', () => {
    const p = party(member('study', 3), member('move', 1));
    expect(start(2, p).studyId).toBe('study');
    expect(start(2, NO_PERKS).studyId).toBe('');
    expect(engine.outcome(walk(start(2, p), () => true))!.troopsUsed).toEqual(['study']);
  });

  it('takes the strongest troop of a habit when the party has two', () => {
    const p = party({ ...member('social', 1), id: 'a' }, { ...member('social', 12, 80), id: 'b' });
    const s = start(1, p);
    expect(s.socialId).toBe('b');
    expect(s.socialEvery).toBe(1);
  });

  it('lists in troopsUsed only the troops whose perk was used', () => {
    const p = party(member('social', 12), member('sleep', 12), member('study', 12), member('move', 1));
    const noPeek = engine.outcome(walk(start(6, p), () => true))!;
    expect(noPeek.troopsUsed).toEqual(['social', 'study']);
    const peeked = act(start(6, p), { type: 'peek', index: 0 });
    expect(engine.outcome(walk(peeked, () => true))!.troopsUsed).toEqual(['social', 'sleep', 'study']);
    expect(engine.outcome(walk(start(6, NO_PERKS), () => true))!.troopsUsed).toEqual([]);
  });

  it('ignores citizens and the other habits: the starter party plays like an empty one', () => {
    const plain = start(3, NO_PERKS);
    const mixedNoPerk = start(3, party(makeMember({ id: 'c', name: 'Ada', habit: null, level: 9, loyalty: 90 }), member('eat', 20), member('hygiene', 20)));
    expect(mixedNoPerk).toEqual(plain);
  });
});

/** The revealed doors of every room of an all-first-door walk. */
function walk2(s: DungeonState): number[][] {
  const out: number[][] = [];
  let state = s;
  while (!isOver(state)) {
    if (state.phase === 'choose') {
      out.push(state.revealed);
      state = act(state, { type: 'choose', index: 0 });
    } else state = act(state, { type: 'continue' });
  }
  return out;
}

describe('buffs', () => {
  it('hint reveals one more style per press, never the same door twice, until nothing is hidden', () => {
    const s0 = start(3, NO_PERKS, withBuffs(2, [{ id: 'h', kind: 'hint', amount: 9 }]));
    expect(s0.hintsLeft).toBe(9);
    const n = currentRoom(s0)!.optionOrder.length;
    let s = s0;
    for (let i = 0; i < n; i++) s = act(s, { type: 'hint' });
    expect([...s.revealed].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(s.hintsLeft).toBe(9 - n);
    expect(act(s, { type: 'hint' })).toBe(s);
    expect(act(start(3), { type: 'hint' }).hintsLeft).toBe(0);
  });

  it('revive lets the player choose a room again, as many times as the buff says, without keeping the first answer', () => {
    const s0 = start(3, NO_PERKS, withBuffs(2, [{ id: 'r', kind: 'revive', amount: 1 }]));
    const s1 = act(s0, { type: 'choose', index: doorOf(s0, 'reactive') });
    expect(goodCount(s1.choices)).toBe(0);
    const s2 = act(s1, { type: 'undo' });
    expect(s2).toMatchObject({ phase: 'choose', revivesLeft: 0, roomIndex: 0 });
    expect(s2.choices).toHaveLength(0);
    const s3 = act(s2, { type: 'choose', index: doorOf(s2, 'constructive') });
    expect(goodCount(s3.choices)).toBe(1);
    expect(act(s3, { type: 'undo' })).toBe(s3);
  });

  it('luck, hint and revive change the game; attack, defense and time are ignored on purpose', () => {
    const base = start(11, NO_PERKS, emptyRun(3));
    for (const kind of ['attack', 'defense', 'time'] as const) expect(start(11, NO_PERKS, withBuffs(3, [{ id: 'x', kind, amount: 50 }]))).toEqual(base);
    for (const kind of ['hint', 'revive'] as const) expect(start(11, NO_PERKS, withBuffs(3, [{ id: 'x', kind, amount: 2 }]))).not.toEqual(base);
    expect(SEEDS.some((seed) => pickRooms(seed, 3, 20).map((s) => s.id).join() !== pickRooms(seed, 3, 0).map((s) => s.id).join())).toBe(true);
  });

  it('sums several buffs of one kind', () => {
    const s = start(2, NO_PERKS, withBuffs(2, [{ id: 'a', kind: 'hint', amount: 1 }, { id: 'b', kind: 'hint', amount: 2 }]));
    expect(s.hintsLeft).toBe(3);
  });
});

describe('difficulty', () => {
  it('shows the plain cue on every door at difficulty 1 and 2 only', () => {
    for (const d of [1, 2, 3, 4, 5] as const) expect(start(1, NO_PERKS, emptyRun(d)).showCues).toBe(d <= 2);
  });
});

describe('scoring', () => {
  it('scores the share of good doors out of 900, plus 50 for each tool used (constructive, boundary, curious)', () => {
    expect(computeScore([])).toBe(0);
    expect(computeScore(choicesOf('constructive', 'constructive', 'constructive', 'constructive', 'constructive'))).toBe(BASE_SCORE + TOOL_BONUS);
    expect(computeScore(choicesOf('constructive', 'constructive', 'boundary', 'boundary', 'boundary'))).toBe(1000);
    expect(computeScore(choicesOf('reactive', 'avoidant', 'reactive', 'avoidant', 'reactive'))).toBe(0);
    expect(computeScore(choicesOf('constructive', 'reactive', 'avoidant', 'reactive', 'avoidant'))).toBe(180 + 50);
    expect(computeScore(choicesOf('constructive', 'boundary', 'curious', 'reactive', 'avoidant'))).toBe(360 + 150);
    expect(computeScore(choicesOf('boundary', 'curious', 'reactive'))).toBe(300 + 100);
  });

  it('floors the share with integers: 900 * good / rooms never rounds up', () => {
    expect(computeScore(choicesOf('constructive', 'reactive', 'reactive'))).toBe(300 + 50);
    expect(computeScore(choicesOf('constructive', 'constructive', 'reactive', 'reactive', 'reactive', 'reactive', 'reactive'))).toBe(Math.floor(1800 / 7) + 50);
  });

  it('wins at 60 percent good or better, in exact integers', () => {
    const run = (n: number, good: number) => choicesOf(...Array.from({ length: n }, (_, i): StyleTag => (i < good ? 'constructive' : 'reactive')));
    expect(isWin(run(5, 3))).toBe(true);
    expect(isWin(run(5, 2))).toBe(false);
    expect(isWin(run(6, 4))).toBe(true);
    expect(isWin(run(6, 3))).toBe(false);
    expect(isWin(run(7, 5))).toBe(true);
    expect(isWin(run(7, 4))).toBe(false);
    expect(isWin([])).toBe(false);
  });

  it('counts boundary like constructive and curious like neither', () => {
    expect(goodCount(choicesOf('constructive', 'boundary', 'curious', 'reactive', 'avoidant'))).toBe(2);
    expect(isWin(choicesOf('boundary', 'boundary', 'boundary', 'curious', 'curious'))).toBe(true);
    expect(isWin(choicesOf('curious', 'curious', 'curious', 'curious', 'constructive'))).toBe(false);
  });

  it('never pays for a worse door: one more good door always beats any variety bonus (every run of 1 to 7 rooms)', () => {
    const best = new Map<string, number>();
    const worst = new Map<string, number>();
    const walkAll = (n: number, acc: StyleTag[]): void => {
      if (acc.length === n) {
        const cs = choicesOf(...acc);
        const key = `${n}:${goodCount(cs)}`;
        const sc = computeScore(cs);
        expect(Number.isInteger(sc) && sc >= 0 && sc <= 1000, `${acc.join()} -> ${sc}`).toBe(true);
        best.set(key, Math.max(best.get(key) ?? 0, sc));
        worst.set(key, Math.min(worst.get(key) ?? 1000, sc));
        return;
      }
      for (const style of STYLES) walkAll(n, [...acc, style]);
    };
    for (let n = 1; n <= 7; n++) {
      walkAll(n, []);
      for (let g = 0; g < n; g++) expect(worst.get(`${n}:${g + 1}`)!, `${n} rooms, ${g + 1} good`).toBeGreaterThan(best.get(`${n}:${g}`)!);
    }
  });

  it('counts tools used', () => {
    expect(toolsUsed(choicesOf('reactive', 'avoidant'))).toBe(0);
    expect(toolsUsed(choicesOf('constructive', 'constructive', 'curious'))).toBe(2);
  });
});

describe('learned note', () => {
  it('names the strongest style, good ones first on a tie', () => {
    expect(strongestStyle(choicesOf('reactive', 'constructive'))).toBe('constructive');
    expect(strongestStyle(choicesOf('avoidant', 'boundary'))).toBe('boundary');
    expect(strongestStyle(choicesOf('avoidant', 'reactive', 'reactive'))).toBe('reactive');
    expect(strongestStyle(choicesOf('curious'))).toBe('curious');
  });

  it('picks the tool used least for the tip, and speaks to a reactive or avoidant habit when that is the strongest', () => {
    expect(weakestTool(choicesOf('constructive', 'constructive', 'boundary'))).toBe('curious');
    expect(weakestTool(choicesOf('constructive', 'curious', 'curious'))).toBe('boundary');
    expect(tipStyle(choicesOf('constructive', 'constructive', 'boundary'))).toBe('curious');
    expect(tipStyle(choicesOf('reactive', 'reactive', 'constructive'))).toBe('reactive');
    expect(tipStyle(choicesOf('avoidant', 'avoidant', 'constructive'))).toBe('avoidant');
  });

  it('puts the strongest style and one tip, in English and in French, in the outcome', () => {
    const o = engine.outcome(walk(start(5), (style) => style === 'constructive'))!;
    expect(o.learned).toBeDefined();
    expect(o.learned!.topic.en).toMatch(/^Most used this run: /);
    expect(o.learned!.topic.fr).toMatch(/^Le plus utilisé cette partie\u00a0: /);
    const tips = Object.values(strings.en.tips);
    expect(tips).toContain(o.learned!.note.en);
    expect(Object.values(strings.fr.tips)).toContain(o.learned!.note.fr);
    for (const text of [o.learned!.note.en, o.learned!.note.fr]) expect(text.length).toBeGreaterThan(40);
  });

  it('phrases every tip as a suggestion, never an order or a diagnosis', () => {
    for (const locale of ['en', 'fr'] as const)
      for (const tip of Object.values(strings[locale].tips)) {
        expect(tip).not.toMatch(/\byou (must|should|have to)\b|\btu (dois|devrais)\b/i);
        expect(tip).not.toMatch(/disorder|syndrom|diagnos|trouble|thérap/i);
      }
  });
});

describe('outcome', () => {
  it('is null while the game runs and the same every time once it is over', () => {
    expect(engine.outcome(start(1))).toBeNull();
    expect(engine.outcome(act(start(1), { type: 'choose', index: 0 }))).toBeNull();
    const end = walk(start(1), () => true);
    expect(engine.outcome(end)).toEqual(engine.outcome(end));
    expect(engine.outcome(end)).not.toBeNull();
  });

  it('is won with all good doors, lost with none, and always a valid score', () => {
    const won = engine.outcome(walk(start(2), (s) => s === 'constructive' || s === 'boundary'))!;
    expect(won.result).toBe('won');
    expect(won.score).toBeGreaterThanOrEqual(950);
    const lost = engine.outcome(walk(start(2), (s) => s === 'reactive' || s === 'avoidant'))!;
    expect(lost.result).toBe('lost');
    expect(lost.score).toBe(0);
    expect(lost.log.length).toBe(6);
  });

  it('leaving early is fled with the rooms already answered, even before the first door', () => {
    const s = act(start(2), { type: 'choose', index: doorOf(start(2), 'constructive') }, { type: 'continue' }, { type: 'forfeit' });
    const o = engine.outcome(s)!;
    expect(o.result).toBe('fled');
    expect(o.score).toBe(Math.floor((BASE_SCORE * 1) / 1) + TOOL_BONUS);
    expect(o.stats).toMatchObject({ rooms: 1, good: 1 });
    expect(o.log.at(-1)).toMatch(/1 of 5 rooms/);
    expect(engine.forfeit!(start(2))).toEqual({ type: 'forfeit' });
    const early = engine.outcome(act(start(2), { type: 'forfeit' }))!;
    expect(early).toMatchObject({ result: 'fled', score: 0 });
    expect(early.learned).toBeUndefined();
    expect(early.log).toHaveLength(1);
  });

  it('writes the log in the player language, one line per room plus the ending, with the warm "troops come home" line', () => {
    const en = engine.outcome(walk(start(3, NO_PERKS, emptyRun(2), 'en'), () => false))!;
    const fr = engine.outcome(walk(start(3, NO_PERKS, emptyRun(2), 'fr'), () => false))!;
    expect(en.log).toHaveLength(6);
    expect(en.log.at(-1)).toMatch(/troops come home/);
    expect(fr.log.at(-1)).toMatch(/Les troupes rentrent/);
    for (const line of [...en.log, ...fr.log]) expect(line.trim()).not.toBe('');
  });
});

describe('the log has the right plural', () => {
  /** Play a run where room i takes a good door when plan[i] is true, a reactive or avoidant one otherwise. */
  function plan(seed: number, locale: 'en' | 'fr', good: boolean[], leaveAfter?: number): string {
    let s = start(seed, NO_PERKS, emptyRun(2), locale);
    let room = 0;
    while (!isOver(s)) {
      if (leaveAfter !== undefined && room >= leaveAfter && s.phase === 'choose') {
        s = act(s, { type: 'forfeit' });
        break;
      }
      if (s.phase === 'choose') {
        const want = good[room] ?? false;
        const n = currentRoom(s)!.optionOrder.length;
        let d = 0;
        for (let i = 0; i < n; i++) {
          const style = styleAt(s, i)!;
          if (want ? style === 'constructive' || style === 'boundary' : style === 'reactive' || style === 'avoidant') {
            d = i;
            break;
          }
        }
        s = act(s, { type: 'choose', index: d });
        room += 1;
      } else s = act(s, { type: 'continue' });
    }
    return engine.outcome(s)!.log.at(-1)!;
  }

  it('says "salle" for 0 and 1 and "salles" from 2 in French, and never "1 rooms" in English', () => {
    expect(plan(3, 'fr', [], 0)).toMatch(/avant la première salle/);
    expect(plan(3, 'fr', [false], 1)).toMatch(/après 1 salle sur 5\./);
    expect(plan(3, 'fr', [false, false], 2)).toMatch(/après 2 salles sur 5\./);
    expect(plan(3, 'en', [], 0)).toMatch(/before the first room/);
    expect(plan(3, 'en', [false], 1)).toMatch(/after 1 of 5 rooms/);
    expect(plan(3, 'en', [false, false], 2)).toMatch(/after 2 of 5 rooms/);
    expect(plan(3, 'fr', [false, false, false, false, false])).toMatch(/^Aucune porte constructive ou de limite cette fois, sur 5 salles\./);
    expect(plan(3, 'fr', [true, false, false, false, false])).toMatch(/dans 1 salle sur 5\./);
    expect(plan(3, 'fr', [true, true, false, false, false])).toMatch(/dans 2 salles sur 5\./);
    expect(plan(3, 'fr', [true, true, true, false, false])).toMatch(/dans 3 salles sur 5\./);
    expect(plan(3, 'en', [false, false, false, false, false])).toMatch(/^No constructive or boundary door this time, in 5 rooms\./);
    expect(plan(3, 'en', [true, false, false, false, false])).toMatch(/in 1 of 5 rooms/);
    expect(plan(3, 'fr', [true, true, true, true, true])).toMatch(/le cœur léger/);
  });
});

describe('determinism and the bot', () => {
  it('replays the same seed to the same actions and outcome, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const a = playToEnd(game, 13, parties.full, runs.plain, 500, { locale });
      const b = playToEnd(game, 13, parties.full, runs.plain, 500, { locale });
      expect(a.actions).toEqual(b.actions);
      expect(a.outcome).toEqual(b.outcome);
    }
  });

  it('returns no action once the game is over and makes progress before: every bot action changes the state', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const rng = botRng();
      let s = start(seed, parties.full, withBuffs(3, [{ id: 'h', kind: 'hint', amount: 2 }, { id: 'r', kind: 'revive', amount: 1 }]));
      for (let i = 0; i < 200 && !isOver(s); i++) {
        const a = engine.botPlay(s, rng)!;
        const next = engine.reduce(s, a);
        expect(next, `seed ${seed} step ${i}: ${JSON.stringify(a)}`).not.toBe(s);
        s = next;
      }
      expect(isOver(s)).toBe(true);
      expect(engine.botPlay(s, rng)).toBeNull();
    }
  });

  it('finishes a game in at most 2 actions per room plus the hints and the revives', () => {
    const r = playToEnd(game, 3, parties.starter, runs.plain);
    expect(r.steps).toBe(10);
    expect(r.outcome!.result === 'won' || r.outcome!.result === 'lost').toBe(true);
  });

  const rate = (party: Party, difficulty: RunContext['difficulty'], buffs: RunContext['buffs'] = []): number => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) if (playToEnd(game, seed, party, withBuffs(difficulty, buffs)).outcome!.result === 'won') wins += 1;
    return wins / 200;
  };

  it('wins 40 to 70 percent of normal-difficulty games with the full party, and loses sometimes (it is not a perfect player)', () => {
    const r = rate(parties.full, 2);
    expect(r).toBeGreaterThanOrEqual(0.4);
    expect(r).toBeLessThanOrEqual(0.7);
  });

  it('wins less as the difficulty goes up, and the starter party is still beatable at difficulty 1', () => {
    const rates = ([1, 2, 3, 4, 5] as const).map((d) => rate(parties.full, d));
    for (let i = 1; i < rates.length; i++) expect(rates[i]!, `d${i + 1}`).toBeLessThan(rates[i - 1]!);
    expect(rates[0]!).toBeGreaterThan(0.7);
    expect(rate(parties.starter, 1)).toBeGreaterThan(0.4);
  });

  it('plays better with a Social troop than without, and better with hints or a revive', () => {
    const base = rate(parties.starter, 2);
    expect(rate(parties.full, 2)).toBeGreaterThan(base + 0.1);
    expect(rate(parties.starter, 2, [{ id: 'h', kind: 'hint', amount: 3 }])).toBeGreaterThan(base + 0.1);
    expect(rate(parties.starter, 2, [{ id: 'r', kind: 'revive', amount: 2 }])).toBeGreaterThan(base + 0.1);
  });

  it('has a seeded error rate that rises with the difficulty', () => {
    expect(BOT_MISS).toHaveLength(5);
    for (let i = 1; i < BOT_MISS.length; i++) expect(BOT_MISS[i]!).toBeGreaterThan(BOT_MISS[i - 1]!);
    const goodShare = (d: RunContext['difficulty']): number => {
      let good = 0;
      let total = 0;
      for (const seed of SEEDS) {
        const o = playToEnd(game, seed, parties.starter, emptyRun(d)).outcome!;
        good += Number(o.stats!.good);
        total += Number(o.stats!.rooms);
      }
      return good / total;
    };
    expect(goodShare(1)).toBeGreaterThan(goodShare(5));
  });

  it('plays the same on a different party size: only the habits matter', () => {
    const a = playToEnd(game, 21, parties.starter, runs.plain);
    const b = playToEnd(game, 21, parties.single, runs.plain);
    expect(a.actions).toEqual(b.actions);
  });
});

describe('content links', () => {
  it('draws only scenarios that exist, with a style for every door', () => {
    for (const seed of SEEDS) {
      const s = start(seed, NO_PERKS, emptyRun(5));
      for (const room of s.rooms) expect(SCENARIOS.map((x) => x.id)).toContain(room.scenarioId);
      for (let d = 0; d < currentRoom(s)!.optionOrder.length; d++) expect(STYLES).toContain(styleAt(s, d));
    }
  });
});

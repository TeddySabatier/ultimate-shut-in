/**
 * Tests of the contract kit itself: a good fake passes every check, and each
 * deliberately broken fake fails the check meant to catch it, with a message
 * that says what to fix.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_CHECKS,
  ContractViolation,
  checkBotWins,
  checkBuffsHonoured,
  checkDeterminism,
  checkManifest,
  checkOutcomes,
  checkPartyHonoured,
  checkPurity,
  checkSeedsDiffer,
  checkStrings,
  checkTermination,
  describeGameContract,
  firstDifference,
  folderOf,
  honouredBuffKinds,
  outcomeProblems,
  parties,
  playToEnd,
  runs,
} from './contract';
import { habits } from '../../game/content';
import { fakes, goodGame } from './fakes';

const fast = { maxSteps: 500 };

describe('contract kit: the good fake', () => {
  it('passes every check', () => {
    for (const check of Object.values(CONTRACT_CHECKS)) check(goodGame, { folder: 'race' });
  });

  it('reports which buff kinds it uses', () => {
    expect(honouredBuffKinds(goodGame)).toEqual(['attack']);
  });
});

// describeGameContract registers its tests like any game's contract.test.ts would.
describeGameContract(goodGame, { folder: 'race' });

describe('contract kit: each failure mode is caught by its check', () => {
  it('non-deterministic engine fails determinism', () => {
    expect(() => checkDeterminism(fakes.nonDeterministic)).toThrow(/determinism:[\s\S]*initial\(\) differs/);
  });

  it('mutating engine fails purity', () => {
    expect(() => checkPurity(fakes.mutating)).toThrow(/purity:[\s\S]*deep-frozen states, so it mutates its input/);
  });

  it('a mutation on buffed runs only fails purity (the whole matrix is frozen)', () => {
    expect(() => checkPurity(fakes.mutatesOnBuffedOnly)).toThrow(/runs\.buffed, en: threw while playing on deep-frozen states/);
  });

  it('a Map on the hard run only, or only in the middle of a game, fails purity', () => {
    expect(() => checkPurity(fakes.mapOnHardOnly)).toThrow(/runs\.hard, en: state \(step 0\)\.cache is a Map instance/);
    expect(() => checkPurity(fakes.mapMidGame)).toThrow(/state \(step 3\)\.cache is a Map instance/);
  });

  it('a sparse array fails purity', () => {
    expect(() => checkPurity(fakes.sparseArray)).toThrow(/history\[0\] is a hole/);
  });

  it('a game that never ends in French fails termination', () => {
    expect(() => checkTermination(fakes.frenchNeverEnds, fast)).toThrow(/, fr: no outcome after 500 steps/);
    expect(() => checkTermination(fakes.frenchNeverEnds, fast)).not.toThrow(/, en: /);
  });

  it('a Map in the state fails purity', () => {
    expect(() => checkPurity(fakes.classInState)).toThrow(/Map instance/);
  });

  it('non-terminating engine fails termination', () => {
    expect(() => checkTermination(fakes.nonTerminating, fast)).toThrow(/termination:[\s\S]*no outcome after 500 steps/);
  });

  it('a bot that gives up early fails termination', () => {
    expect(() => checkTermination(fakes.botStuck, fast)).toThrow(/botPlay returned null at step 0/);
  });

  it('a game over before it starts fails termination', () => {
    expect(() => checkTermination(fakes.overAtStart, fast)).toThrow(/outcome\(initial\) must be null/);
  });

  it('a game that reopens after the end fails termination', () => {
    expect(() => checkTermination(fakes.reopensAfterEnd, fast)).toThrow(/an action after the end changed the outcome/);
  });

  it('bad manifest fails manifest, listing every problem', () => {
    let error: unknown;
    try {
      checkManifest(fakes.badManifest, 'race');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContractViolation);
    const problems = (error as ContractViolation).problems.join('\n');
    expect(problems).toMatch(/id "Bad_Id" must be kebab-case/);
    expect(problems).toMatch(/name\.fr must be a non-empty string/);
    expect(problems).toMatch(/estMinutes 9 must be a number from 1 to 5/);
    expect(problems).toMatch(/supportsReducedMotion must be true/);
    expect(problems).toMatch(/rosterSize\.min 4 must be 1 to 3/);
    expect(problems).toMatch(/manifest\.colour: unknown field/);
  });

  it('manifest id must equal the folder, and learning is required for ai-learning', () => {
    expect(() => checkManifest(goodGame, 'sprint')).toThrow(/id "race" must equal its folder name "sprint"/);
    const learning = { ...goodGame, manifest: { ...goodGame.manifest, category: 'ai-learning' as const } };
    expect(() => checkManifest(learning)).toThrow(/learning is required/);
    expect(() => checkManifest({ ...goodGame, manifest: { ...goodGame.manifest, id: 'lab' } })).toThrow(/reserved/);
  });

  it('mismatched strings fail strings, naming each key', () => {
    let problems = '';
    try {
      checkStrings(fakes.mismatchedStrings);
    } catch (e) {
      problems = (e as ContractViolation).problems.join('\n');
    }
    expect(problems).toMatch(/en\.extra is missing in French/);
    expect(problems).toMatch(/fr\.bonus has no English counterpart/);
    expect(problems).toMatch(/fr\.title is an empty string/);
    expect(problems).toMatch(/turn: placeholders differ \(en \{n\} vs fr \{m\}\)/);
    expect(problems).toMatch(/en\.count must be a string/);
    expect(problems).toMatch(/tips: 3 entries in en but 2 in fr/);
  });

  it('invalid outcomes fail outcomes', () => {
    expect(() => checkOutcomes(fakes.badOutcome)).toThrow(/score 1500\.5 must be an integer from 0 to 1000/);
    const problems = outcomeProblems({ result: 'won', score: 10, log: ['ok'], troopsUsed: ['ghost', 'move', 'move'] }, ['move']).join('\n');
    expect(problems).toMatch(/"ghost", which is not in the party/);
    expect(problems).toMatch(/lists "move" twice/);
  });

  it('a forfeit path is validated although the bot never forfeits', () => {
    expect(() => checkOutcomes(fakes.badForfeit)).toThrow(/forfeit at step 0: score 1500 must be an integer[\s\S]*log must have at least one line/);
    expect(() => checkOutcomes(fakes.forfeitDoesNothing)).toThrow(/reducing engine\.forfeit\(state\) must end the game/);
  });

  it('hard-coded troops fail outcomes on the mixed party', () => {
    expect(() => checkOutcomes(fakes.hardCodedTroops)).toThrow(/parties\.mixed[^\n]*troopsUsed has "move", which is not in the party/);
  });

  it('a seed that changes nothing fails seeds', () => {
    expect(() => checkSeedsDiffer(fakes.ignoresSeed)).toThrow(/seeds:[\s\S]*only 1 distinct games for 5 seeds/);
  });

  it('ignored buffs fail buffs unless declared with a reason', () => {
    expect(() => checkBuffsHonoured(fakes.ignoresBuffs)).toThrow(/no buff changed any of the 5 games/);
    expect(() => checkBuffsHonoured(fakes.ignoresBuffs, { ignoresBuffs: 'A pure memory game: no attack or timer to change.' })).not.toThrow();
    expect(() => checkBuffsHonoured(fakes.ignoresBuffs, { ignoresBuffs: 'no' })).toThrow(/needs a real reason/);
  });

  it('an ignored party fails party unless declared with a reason', () => {
    expect(() => checkPartyHonoured(fakes.ignoresParty)).toThrow(/played identically on all 5 seeds/);
    expect(() => checkPartyHonoured(fakes.ignoresParty, { ignoresParty: 'Solo puzzle: the party only names the player.' })).not.toThrow();
  });

  it('a bot that never wins fails bot', () => {
    expect(() => checkBotWins(fakes.neverWins)).toThrow(/the bot never won/);
  });
});

describe('contract kit: helpers', () => {
  it('playToEnd returns the final state, outcome, steps and actions', () => {
    expect(playToEnd(goodGame, 1, parties.full, runs.plain, 100, { locale: 'fr' }).outcome?.log[0]).toMatch(/ sur /);
    const r = playToEnd(goodGame, 1, parties.full, runs.plain);
    expect(r.outcome?.result).toBe('won');
    expect(r.steps).toBe(r.actions.length);
    expect(r.state.turn).toBe(r.steps);
    expect(playToEnd(fakes.nonTerminating, 1, parties.full, runs.plain, 10)).toMatchObject({ outcome: null, steps: 10, stopped: 'maxSteps' });
  });

  it('firstDifference names the path of the first difference', () => {
    expect(firstDifference({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe('state.a[1].b: 2 vs 3');
    expect(firstDifference({ a: 1 }, { a: 1 })).toBeNull();
  });

  it('folderOf reads the folder of a test file URL or path', () => {
    expect(folderOf('file:///C:/repo/src/games/coin-duel/contract.test.ts')).toBe('coin-duel');
    expect(folderOf('C:\\repo\\src\\games\\chess\\contract.test.ts')).toBe('chess');
  });

  it('fixtures are frozen and have the documented shape', () => {
    expect(Object.isFrozen(parties.full.members[0])).toBe(true);
    expect(parties.full.members.map((m) => m.name)).toEqual(habits.map((h) => h.vassal.name));
    expect(parties.full.members.every((m) => m.level === 12 && m.loyalty === 80 && m.power === 44)).toBe(true);
    expect(parties.starter.members).toHaveLength(3);
    expect(parties.starter.members.every((m) => m.level === 1)).toBe(true);
    expect(parties.single.members).toHaveLength(1);
    expect(parties.mixed.members[0]).toMatchObject({ habit: null, id: 'citizen-ada' });
    expect(parties.mixed.members.some((m) => m.id === 'move')).toBe(false);
    expect(runs.plain.buffs).toEqual([]);
    expect(runs.buffed.buffs.map((b) => b.kind)).toEqual(['attack', 'time', 'hint']);
  });
});

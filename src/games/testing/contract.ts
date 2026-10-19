/**
 * The contract test kit. In `src/games/<id>/contract.test.ts`:
 *
 *   import game from './manifest';
 *   import { describeGameContract, folderOf } from '../testing/contract';
 *   describeGameContract(game, { folder: folderOf(import.meta.url) });
 *
 * It registers one vitest test per check of ./checks.ts. Test files only:
 * this module imports vitest, so app code must never import it (ESLint
 * enforces that).
 */
import { describe, it } from 'vitest';
import type { GameModule } from '../contract';
import {
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
  type ContractOptions,
} from './checks';

export * from './checks';
export { playToEnd, botRng, deepFreeze, DEFAULT_MAX_STEPS, type PlayResult } from './play';
export { parties, runs } from './fixtures';

/** Register the contract tests for one game. */
export function describeGameContract<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const id = (module as { manifest?: { id?: unknown } }).manifest?.id;
  const slow = options.timeoutMs ?? 60_000;
  describe(`game contract: ${typeof id === 'string' ? id : '(no id)'}`, () => {
    it('manifest: every field valid, kebab-case id equal to its folder', () => checkManifest(module, options.folder));
    it('strings: same key tree in en and fr, no empty strings, same placeholders', () => checkStrings(module));
    it('determinism: the same seed, party and run play the same game', () => checkDeterminism(module, options), slow);
    it('termination: the bot finishes every game within maxSteps', () => checkTermination(module, options), slow);
    it('purity: deep-frozen states are not mutated; state and actions are plain data', () => checkPurity(module, options), slow);
    it('outcomes: valid result, integer score 0..1000, troops from the party, log lines', () => checkOutcomes(module, options), slow);
    it('seeds: different seeds give different games', () => checkSeedsDiffer(module, options), slow);
    it(options.ignoresBuffs ? `buffs: declared ignored (${options.ignoresBuffs})` : 'buffs: run buffs change the game', () => checkBuffsHonoured(module, options), slow);
    it(options.ignoresParty ? `party: declared ignored (${options.ignoresParty})` : 'party: the party changes the game', () => checkPartyHonoured(module, options), slow);
    it('bot: wins at least once with the full party', () => checkBotWins(module, options), slow);
  });
}

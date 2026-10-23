/**
 * The contract every game passes. Attack and defense buffs have no meaning for
 * a gardener (docs/games/weight-garden.md, "Buffs"), but time, hint, luck and
 * revive do, so the game does not use `ignoresBuffs`.
 */
import { describeGameContract, folderOf } from '../testing/contract';
import game from './manifest';

describeGameContract(game, { folder: folderOf(import.meta.url) });

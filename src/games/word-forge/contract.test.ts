/**
 * The contract every game passes. Copy this file as is; add
 * `ignoresBuffs` / `ignoresParty` with a reason only if your brief says the
 * game deliberately ignores them (and say how in docs/games/<id>.md).
 */
import { describeGameContract, folderOf } from '../testing/contract';
import game from './manifest';

describeGameContract(game, { folder: folderOf(import.meta.url) });

/**
 * The contract every game passes.
 */
import { describeGameContract, folderOf } from '../testing/contract';
import game from './manifest';

describeGameContract(game, { folder: folderOf(import.meta.url) });

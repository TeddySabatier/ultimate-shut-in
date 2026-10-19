/**
 * Public API of the Haven Protocol game core.
 *
 * Contract: every function is pure. State-changing functions take a
 * `SaveFile` plus `now` (Unix ms) and return `{ save, events, error? }` with
 * a new SaveFile; the input is never mutated. Randomness is seeded from the
 * save, so any day can be replayed.
 */

export * from './types';
export * from './content';
export { fnv1a, mulberry32, rngInt, rngPick, rngWeightedIndex } from './rng';
export type { Rng } from './rng';
export * from './time';
export * from './economy';
export {
  generateBoard,
  makeBoardQuest,
  boardSeed,
  instanceId,
  eligiblePool,
  fallbackTier,
  chooseBonus,
  timerElapsedMs,
  startTimer,
  pauseTimer,
  incrementCount,
  completeQuest,
  markTried,
  undoQuest,
  rerollQuest,
} from './board';
export * from './template';
export {
  MAX_CUSTOM_ON_BOARD,
  MAX_ACTIVE_CUSTOM,
  cleanDraft,
  draftOf,
  activeCustomTemplates,
  customOnBoardCount,
  customSlotsLeft,
  previewCustomRewards,
  recurrenceDue,
  placeRecurringDraft,
  addCustomTemplate,
  updateCustomTemplate,
  archiveCustomTemplate,
  addCustomQuestToBoard,
} from './custom';
export type { CleanDraft, CustomResult } from './custom';
export {
  MAX_VISIBLE_PROPOSALS,
  SNOOZE_DAYS,
  OPEN_PROPOSAL_DAYS,
  recordActivityDraft,
  evaluateProposals,
  computeProposalsDraft,
  openProposals,
  dismissProposal,
  acceptProposal,
  smallerDraft,
  stepUpDraft,
} from './adapt';
export type { ProposalCandidate } from './adapt';
export { parseQuestDraft } from './compose/parse';
export type { ParsedQuestDraft, ComposeQuestion, FieldConfidence } from './compose/parse';
export { vassalName, activeVassals, waitingLine, decayLoyalty } from './vassals';
export { reRecruitVassal, setBenevolence } from './recruit';
export {
  TIED_HABIT,
  tiedUtility,
  utilityState,
  isWellKept,
  wellKeptBonus,
  restoreUtility,
  decayUtilities,
} from './utilities';
export type { UtilityState, DecayOutcome } from './utilities';
export {
  MONSTERS,
  monsterForWave,
  waveAttack,
  waveDefense,
  classifyWave,
  waveDpAward,
  settleWave,
  vassalTitle,
} from './wave';
export type { Monster, DefenseDetail } from './wave';
export {
  hasTitle,
  titleXpMult,
  titleCoinMult,
  titleDpMult,
  titleDefenseFlat,
  titleUtilityDecayMult,
  titleComboPower,
  titleLoyaltyFlat,
  evaluateTitles,
  LIBRARY_XP_CAP,
} from './titles';
export { doneHabitsOnBoard, comboRequiredHabits, comboPowerBonus, countedCombos, comboDefense, forgeCombos } from './combos';
export { resurrectionOffer, canResurrect, applyResurrection } from './resurrection';
export type { ResurrectionChoice, ResurrectionOffer } from './resurrection';
export { processBoundaries, changeResetHour, newBoundaryCaps } from './tick';
export type { BoundaryCaps } from './tick';
export {
  SAVE_VERSION,
  DEFAULT_NAME,
  DEFAULT_RESET_HOUR,
  NAME_MAX_LENGTH,
  createNewSave,
  migrate,
  exportSave,
  sanitizeName,
  defaultSettings,
  defaultStats,
  defaultVassal,
  defaultUtility,
} from './save';
export type { NewSaveOptions } from './save';

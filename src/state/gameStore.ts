/**
 * The one persisted store. It holds the engine's `SaveFile` and forwards
 * every mutation to `src/game`; no rule lives here. Engine events are queued
 * in `pendingEvents` for the overlay host to show one at a time.
 *
 * Storage key `haven.save` (version 2). A legacy `usi.player` blob is read
 * once through the engine's `migrate`, then removed.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  acceptProposal,
  addCustomQuestToBoard,
  addCustomTemplate,
  applyResurrection,
  archiveCustomTemplate,
  changeResetHour,
  completeQuest,
  dismissProposal,
  createNewSave,
  gameDayIndex,
  incrementCount,
  markTried,
  migrate,
  pauseTimer,
  processBoundaries,
  reRecruitVassal,
  rerollQuest,
  sanitizeName,
  setBenevolence,
  startTimer,
  undoQuest,
  type ActionResult,
  type CustomDraft,
  type GameEvent,
  type HabitId,
  type ResurrectionChoice,
  type SaveFile,
  type Settings,
} from '../game';
import { now } from './clock';

export const STORAGE_KEY = 'haven.save';
export const STORAGE_VERSION = 2;
export const LEGACY_STORAGE_KEY = 'usi.player';

/** Events the overlay host presents; the rest are bookkeeping. */
const SHOWN_EVENTS: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  'questDone',
  'questTried',
  'questUndone',
  'questRerolled',
  'levelUp',
  'vassalLevelUp',
  'utilityRestored',
  'utilityDegraded',
  'titleEarned',
  'comboForged',
  'ringUnlocked',
  'waveSettled',
  'vassalLeft',
  'vassalReturned',
  'catchUp',
  'resurrectionUsed',
  'customSaved',
  'customUpdated',
  'customArchived',
  'customBoarded',
  'proposalResolved',
]);

/**
 * An accepted proposal raises "saved", "on the board" and "resolved" together;
 * the player needs one line, the most specific, not a stack of three toasts.
 */
export function oneToastFor(events: GameEvent[]): GameEvent[] {
  const boarded = events.some((e) => e.type === 'customBoarded');
  const changed = boarded || events.some((e) => e.type === 'customSaved' || e.type === 'customUpdated');
  return events.filter((e) => !(e.type === 'customSaved' && boarded) && !(e.type === 'proposalResolved' && e.accepted && changed));
}

export function isShownEvent(e: GameEvent): boolean {
  return SHOWN_EVENTS.has(e.type);
}

export interface GameState {
  save: SaveFile | null;
  /** False until the onboarding flow finishes (also for a migrated legacy save). */
  onboarded: boolean;
  pendingEvents: GameEvent[];
  /** A refused action's message, shown once as a toast. */
  notice: string | null;
  lastTick: number;
}

export interface GameActions {
  finishOnboarding: (name: string, settings: Partial<Settings>) => void;
  tick: () => void;
  complete: (instanceId: string) => void;
  undo: (instanceId: string) => void;
  tryQuest: (instanceId: string) => void;
  startTimer: (instanceId: string) => void;
  pauseTimer: (instanceId: string) => void;
  increment: (instanceId: string, delta: number) => void;
  reroll: (instanceId: string) => void;
  reRecruit: (habit: HabitId, welcomeGift?: boolean) => void;
  resurrect: (choice: ResurrectionChoice) => void;
  /**
   * Compose sheet: save a custom quest and, with `board`, put it on today's
   * board. Returns false (with a notice) when the template itself was
   * refused; true when it was saved, even if only the board step failed.
   */
  composeQuest: (draft: CustomDraft, opts: { board: boolean }) => boolean;
  addCustomToBoard: (templateId: string) => void;
  archiveCustom: (templateId: string) => void;
  acceptProposal: (id: string) => void;
  dismissProposal: (id: string) => void;
  /**
   * Settings changes. `resetHour` and `benevolence` go through the engine's
   * own mutators; the rest apply at once (the current board is already
   * generated, so enabled habits and difficulty show up on the next board).
   */
  updateSettings: (partial: Partial<Settings>) => void;
  rename: (name: string) => void;
  resetSave: () => void;
  /** Replace the save with an imported file (already parsed). Returns false when unreadable. */
  importSave: (raw: unknown) => boolean;
  dismissEvent: () => void;
  clearNotice: () => void;
}

export type GameStore = GameState & GameActions;

interface PersistedSlice {
  save: SaveFile | null;
  onboarded: boolean;
}

export const INITIAL_STATE: GameState = {
  save: null,
  onboarded: false,
  pendingEvents: [],
  notice: null,
  lastTick: 0,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate anything that came out of storage. Only the inner `save` goes to
 * the engine's `migrate`; the persist envelope never does.
 */
function hydrateSlice(raw: unknown): PersistedSlice {
  const d = isRecord(raw) ? raw : {};
  const save = isRecord(d.save) ? migrate(d.save, now()) : null;
  const onboarded = save !== null && (typeof d.onboarded === 'boolean' ? d.onboarded : true);
  return { save, onboarded };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** localStorage with a one-time read of the legacy `usi.player` key. */
const havenStorage: StateStorage = {
  getItem: (name) => {
    const ls = safeLocalStorage();
    if (!ls) return null;
    const raw = ls.getItem(name);
    if (raw !== null) return raw;
    const legacy = ls.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) return null;
    ls.removeItem(LEGACY_STORAGE_KEY);
    try {
      const parsed: unknown = JSON.parse(legacy);
      const save = migrate(parsed, now());
      const slice: PersistedSlice = { save, onboarded: false };
      return JSON.stringify({ state: slice, version: STORAGE_VERSION });
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    safeLocalStorage()?.setItem(name, value);
  },
  removeItem: (name) => {
    safeLocalStorage()?.removeItem(name);
  },
};

export const useGameStore = create<GameStore>()(
  persist(
    immer((set, get) => {
      /** Apply an engine result: new save + shown events, or a notice on refusal. */
      const apply = (r: ActionResult): boolean => {
        if (r.error !== undefined) {
          const message = r.error;
          set((s) => {
            s.notice = message;
          });
          return false;
        }
        const shown = r.events.filter(isShownEvent);
        set((s) => {
          s.save = r.save;
          if (shown.length > 0) s.pendingEvents.push(...shown);
        });
        return true;
      };

      /** Run `fn` against the current save, if any. */
      const withSave = (fn: (save: SaveFile, now: number) => ActionResult): boolean => {
        const save = get().save;
        if (!save) return false;
        return apply(fn(save, now()));
      };

      const todayOf = (save: SaveFile, now: number): number => gameDayIndex(now, save.settings.resetHour);

      return {
        ...INITIAL_STATE,

        finishOnboarding: (name, settings) => {
          const at = now();
          const clean: Partial<Settings> = { ...settings };
          if (clean.enabledHabits !== undefined && clean.enabledHabits.length === 0) delete clean.enabledHabits;
          set((s) => {
            if (s.save === null) {
              s.save = createNewSave(at, name, { settings: clean });
            } else {
              s.save.player.name = sanitizeName(name);
              Object.assign(s.save.settings, clean);
            }
            s.onboarded = true;
            s.pendingEvents = [];
            s.notice = null;
          });
          get().tick();
        },

        tick: () => {
          const st = get();
          if (!st.save || !st.onboarded) return;
          const at = now();
          const r = processBoundaries(st.save, at);
          const changed = r.events.length > 0 || r.save.lastOpenDay !== st.save.lastOpenDay;
          const shown = r.events.filter(isShownEvent);
          set((s) => {
            s.lastTick = at;
            if (!changed) return;
            s.save = r.save;
            if (shown.length > 0) s.pendingEvents.push(...shown);
          });
        },

        complete: (id) => void withSave((save, now) => completeQuest(save, id, now)),
        undo: (id) => void withSave((save, now) => undoQuest(save, id, now)),
        tryQuest: (id) => void withSave((save, now) => markTried(save, id, now)),
        startTimer: (id) => void withSave((save, now) => startTimer(save, id, now)),
        pauseTimer: (id) => void withSave((save, now) => pauseTimer(save, id, now)),
        increment: (id, delta) => void withSave((save, now) => incrementCount(save, id, delta, now)),
        reroll: (id) => void withSave((save, now) => rerollQuest(save, id, now)),
        reRecruit: (habit, welcomeGift = false) =>
          void withSave((save, now) => reRecruitVassal(save, habit, now, todayOf(save, now), welcomeGift)),
        resurrect: (choice) => void withSave((save, now) => applyResurrection(save, choice, now, todayOf(save, now))),

        composeQuest: (draft, opts) => {
          const save = get().save;
          if (!save) return false;
          const at = now();
          const created = addCustomTemplate(save, at, draft);
          if (created.error !== undefined || created.templateId === undefined) {
            const message = created.error ?? 'could not save that quest';
            set((s) => {
              s.notice = message;
            });
            return false;
          }
          if (!opts.board) return apply(created);
          const boarded = addCustomQuestToBoard(created.save, at, created.templateId);
          if (boarded.error === undefined) {
            // One toast for "saved and on the board": the board one says it all.
            return apply({ save: boarded.save, events: boarded.events });
          }
          const reason = boarded.error;
          apply(created);
          set((s) => {
            s.pendingEvents = [];
            s.notice = `Saved in My quests. ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`;
          });
          return true;
        },
        addCustomToBoard: (templateId) => void withSave((save, now) => addCustomQuestToBoard(save, now, templateId)),
        archiveCustom: (templateId) => void withSave((save, now) => archiveCustomTemplate(save, now, templateId)),
        acceptProposal: (id) =>
          void withSave((save, now) => {
            const r = acceptProposal(save, now, id);
            return r.error === undefined ? { ...r, events: oneToastFor(r.events) } : r;
          }),
        dismissProposal: (id) => void withSave((save, now) => dismissProposal(save, now, id)),

        updateSettings: (partial) => {
          const { resetHour, benevolence, ...rest } = partial;
          if (rest.enabledHabits !== undefined && rest.enabledHabits.length === 0) {
            set((s) => {
              s.notice = 'Keep at least one habit enabled.';
            });
            return;
          }
          if (Object.keys(rest).length > 0) {
            set((s) => {
              if (s.save) Object.assign(s.save.settings, rest);
            });
          }
          if (resetHour !== undefined) withSave((save, now) => changeResetHour(save, resetHour, now));
          if (benevolence !== undefined) withSave((save, now) => setBenevolence(save, benevolence, now, todayOf(save, now)));
        },

        rename: (name) => {
          set((s) => {
            if (s.save) s.save.player.name = sanitizeName(name);
          });
        },

        resetSave: () => {
          set((s) => {
            s.save = null;
            s.onboarded = false;
            s.pendingEvents = [];
            s.notice = null;
          });
        },

        importSave: (raw) => {
          if (!isRecord(raw)) {
            set((s) => {
              s.notice = 'That file is not a Haven save.';
            });
            return false;
          }
          const save = migrate(raw, now());
          set((s) => {
            s.save = save;
            s.onboarded = true;
            s.pendingEvents = [];
            s.notice = null;
          });
          get().tick();
          return true;
        },

        dismissEvent: () => {
          set((s) => {
            s.pendingEvents.shift();
          });
        },

        clearNotice: () => {
          set((s) => {
            s.notice = null;
          });
        },
      };
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => havenStorage),
      partialize: (s): PersistedSlice => ({ save: s.save, onboarded: s.onboarded }),
      migrate: (persisted) => hydrateSlice(persisted),
      merge: (persisted, current) => ({ ...current, ...hydrateSlice(persisted) }),
    },
  ),
);

/** The current save; screens behind the onboarding gate may assume it exists. */
export function useSave(): SaveFile {
  const save = useGameStore((s) => s.save);
  if (!save) throw new Error('useSave called before a save exists');
  return save;
}

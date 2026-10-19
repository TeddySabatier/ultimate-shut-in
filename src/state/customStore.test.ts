import { describe, expect, it } from 'vitest';
import type { CustomDraft, GameEvent } from '../game';
import { currentSave, seedStore } from '../test/storeUtils';
import { oneToastFor, useGameStore } from './gameStore';

const draft = (over: Partial<CustomDraft> = {}): CustomDraft => ({
  habit: 'clean',
  kind: 'check',
  title: 'Tidy desk',
  description: 'The desk.',
  recurrence: 'once',
  timeSlot: 'any',
  source: 'text',
  ...over,
});

describe('store: composeQuest', () => {
  it('saves and boards in one step, raising a single "on the board" event', () => {
    seedStore();
    expect(useGameStore.getState().composeQuest(draft(), { board: true })).toBe(true);
    expect(currentSave().customTemplates).toHaveLength(1);
    expect(currentSave().board?.quests.at(-1)?.templateId).toBe(currentSave().customTemplates[0]?.id);
    expect(useGameStore.getState().pendingEvents.map((e) => e.type)).toEqual(['customBoarded']);
  });

  it('saves without boarding and raises a "saved" event', () => {
    seedStore();
    expect(useGameStore.getState().composeQuest(draft(), { board: false })).toBe(true);
    expect(currentSave().board?.quests.some((q) => q.templateId.startsWith('c-'))).toBe(false);
    expect(useGameStore.getState().pendingEvents.map((e) => e.type)).toEqual(['customSaved']);
  });

  it('returns false with a notice when the template is refused, and changes nothing', () => {
    seedStore();
    expect(useGameStore.getState().composeQuest(draft({ title: '  ' }), { board: true })).toBe(false);
    expect(useGameStore.getState().notice).toMatch(/give it a name/);
    expect(currentSave().customTemplates).toHaveLength(0);
  });

  it('keeps the template when only the board step is refused, and says why', () => {
    seedStore();
    const save = currentSave();
    useGameStore.setState({ save: { ...save, settings: { ...save.settings, enabledHabits: save.settings.enabledHabits.filter((h) => h !== 'clean') } } });
    expect(useGameStore.getState().composeQuest(draft(), { board: true })).toBe(true);
    expect(currentSave().customTemplates).toHaveLength(1);
    expect(useGameStore.getState().notice).toMatch(/Saved in My quests\. That habit is switched off/);
    expect(useGameStore.getState().pendingEvents).toEqual([]);
  });

  it('adds a saved template to the board later and archives it', () => {
    seedStore();
    useGameStore.getState().composeQuest(draft(), { board: false });
    const id = currentSave().customTemplates[0]?.id ?? '';
    useGameStore.getState().addCustomToBoard(id);
    expect(currentSave().board?.quests.some((q) => q.templateId === id)).toBe(true);
    useGameStore.getState().archiveCustom(id);
    expect(currentSave().customTemplates[0]?.archivedAt).toBeDefined();
    expect(currentSave().board?.quests.some((q) => q.templateId === id)).toBe(false);
  });

  it('shows a refusal as a notice (a quest that is not there)', () => {
    seedStore();
    useGameStore.getState().addCustomToBoard('c-00000000');
    expect(useGameStore.getState().notice).toMatch(/not in My quests/);
    useGameStore.getState().acceptProposal('p-nothing');
    expect(useGameStore.getState().notice).toMatch(/no longer open/);
  });
});

describe('oneToastFor', () => {
  const saved: GameEvent = { type: 'customSaved', templateId: 'c-1' };
  const boarded: GameEvent = { type: 'customBoarded', instanceId: '1-c-1' };
  const updated: GameEvent = { type: 'customUpdated', templateId: 'c-1' };
  const yes: GameEvent = { type: 'proposalResolved', id: 'p-1', accepted: true };
  const no: GameEvent = { type: 'proposalResolved', id: 'p-1', accepted: false };

  it('collapses an accepted proposal to its most specific event', () => {
    expect(oneToastFor([saved, boarded, yes])).toEqual([boarded]);
    expect(oneToastFor([saved, yes])).toEqual([saved]);
    expect(oneToastFor([updated, yes])).toEqual([updated]);
  });
  it('keeps a dismissal as it is', () => {
    expect(oneToastFor([no])).toEqual([no]);
  });
});

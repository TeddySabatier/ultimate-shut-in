import { beforeEach, describe, expect, it } from 'vitest';
import { exportSave, gameDayIndex } from '../game';
import { INITIAL_STATE, LEGACY_STORAGE_KEY, STORAGE_KEY, useGameStore } from './gameStore';
import { currentSave, seedStore } from '../test/storeUtils';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] });
  });

  it('finishOnboarding creates a save and tick issues today\'s board', () => {
    useGameStore.getState().finishOnboarding('Rin', { difficulty: 'gentle' });
    const st = useGameStore.getState();
    expect(st.onboarded).toBe(true);
    const save = currentSave();
    expect(save.player.name).toBe('Rin');
    expect(save.settings.difficulty).toBe('gentle');
    expect(save.board).not.toBeNull();
    expect(save.board?.quests.length).toBeGreaterThan(0);
    expect(save.lastOpenDay).toBe(gameDayIndex(Date.now(), save.settings.resetHour));
  });

  it('tick is a no-op before onboarding', () => {
    useGameStore.getState().tick();
    expect(useGameStore.getState().save).toBeNull();
  });

  it('complete grants rewards and queues a questDone event', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    useGameStore.getState().complete(q.instanceId);
    const after = currentSave();
    const done = after.board?.quests.find((x) => x.instanceId === q.instanceId);
    expect(done?.status).toBe('done');
    expect(after.player.coins).toBeGreaterThan(save.player.coins);
    expect(after.stats.questsTotal).toBe(1);
    const ev = useGameStore.getState().pendingEvents[0];
    expect(ev?.type).toBe('questDone');
  });

  it('undo reverts a completion the same day', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    useGameStore.getState().complete(q.instanceId);
    useGameStore.getState().undo(q.instanceId);
    const after = currentSave();
    expect(after.board?.quests.find((x) => x.instanceId === q.instanceId)?.status).toBe('open');
    expect(after.player.coins).toBe(save.player.coins);
    expect(after.stats.questsTotal).toBe(0);
  });

  it('a refused action becomes a notice instead of a state change', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    useGameStore.getState().undo(q.instanceId);
    expect(useGameStore.getState().notice).toMatch(/not done/);
    expect(currentSave()).toEqual(save);
    useGameStore.getState().clearNotice();
    expect(useGameStore.getState().notice).toBeNull();
  });

  it('migrates the legacy usi.player key once and removes it', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { name: 'Old Hand', level: 3, xp: 20 }, version: 1 }));
    localStorage.removeItem(STORAGE_KEY); // nothing under the new key yet
    await useGameStore.persist.rehydrate();
    const st = useGameStore.getState();
    expect(st.save?.player.name).toBe('Old Hand');
    expect(st.save?.player.level).toBe(3);
    expect(st.save?.player.xp).toBe(20);
    expect(st.onboarded).toBe(false);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('persists under haven.save and rehydrates the inner save through migrate', async () => {
    seedStore('Keeper');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { version: number; state: { save: { player: { name: string } } } };
    expect(parsed.version).toBe(2);
    expect(parsed.state.save.player.name).toBe('Keeper');
    useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] }); // this persists save: null ...
    localStorage.setItem(STORAGE_KEY, raw as string); // ... so put the stored blob back before rehydrating
    await useGameStore.persist.rehydrate();
    expect(currentSave().player.name).toBe('Keeper');
    expect(useGameStore.getState().onboarded).toBe(true);
  });

  it('refuses to disable every habit', () => {
    const save = seedStore();
    useGameStore.getState().updateSettings({ enabledHabits: [] });
    expect(useGameStore.getState().notice).toMatch(/at least one/i);
    expect(currentSave().settings.enabledHabits).toEqual(save.settings.enabledHabits);
  });

  it('difficulty changes apply to settings but leave today\'s board alone', () => {
    const save = seedStore();
    useGameStore.getState().updateSettings({ difficulty: 'hardcore' });
    const after = currentSave();
    expect(after.settings.difficulty).toBe('hardcore');
    expect(after.board).toEqual(save.board);
  });

  it('reset hour goes through the engine and keeps the board', () => {
    const save = seedStore();
    useGameStore.getState().updateSettings({ resetHour: (save.settings.resetHour + 1) % 24 });
    const after = currentSave();
    expect(after.settings.resetHour).toBe((save.settings.resetHour + 1) % 24);
    expect(after.board?.quests.map((q) => q.templateId)).toEqual(save.board?.quests.map((q) => q.templateId));
  });

  it('rename sanitizes and applies immediately', () => {
    seedStore();
    useGameStore.getState().rename('   ');
    expect(currentSave().player.name).toBe('Absolute');
    useGameStore.getState().rename('A very very very long name indeed');
    expect(currentSave().player.name.length).toBeLessThanOrEqual(24);
  });

  it('resetSave returns to the onboarding state', () => {
    seedStore();
    useGameStore.getState().resetSave();
    expect(useGameStore.getState().save).toBeNull();
    expect(useGameStore.getState().onboarded).toBe(false);
  });

  it('importSave replaces the save and rejects garbage', () => {
    const save = seedStore('Exporter');
    const text = exportSave(save);
    useGameStore.getState().resetSave();
    expect(useGameStore.getState().importSave('nope')).toBe(false);
    expect(useGameStore.getState().notice).toMatch(/not a Haven save/);
    expect(useGameStore.getState().importSave(JSON.parse(text))).toBe(true);
    expect(currentSave().player.name).toBe('Exporter');
    expect(useGameStore.getState().onboarded).toBe(true);
  });

  it('dismissEvent pops the queue head', () => {
    seedStore();
    useGameStore.setState({ pendingEvents: [{ type: 'levelUp', level: 2 }, { type: 'catchUp', days: 3 }] });
    useGameStore.getState().dismissEvent();
    expect(useGameStore.getState().pendingEvents).toEqual([{ type: 'catchUp', days: 3 }]);
  });
});

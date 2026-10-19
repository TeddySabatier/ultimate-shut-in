import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_STATE, mapNotice, oneOutpostToast, useGameStore } from './gameStore';
import { currentSave, seedStore } from '../test/storeUtils';

describe('gameStore: city map', () => {
  beforeEach(() => {
    useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] });
  });

  it('creates, visits, edits, retires, restores and forgets an outpost through the engine', () => {
    seedStore();
    const st = useGameStore.getState();
    expect(st.createOutpost({ name: 'Riverside Gym', type: 'gym', cell: { x: 2, y: 1 } })).toBe(true);
    expect(currentSave().map.outposts[0]).toMatchObject({ id: 'op1', name: 'Riverside Gym', habits: ['move', 'hygiene'] });
    expect(useGameStore.getState().pendingEvents.map((e) => e.type)).toEqual(['outpostCreated']);
    useGameStore.setState({ pendingEvents: [] });

    expect(st.visitOutpost('op1')).toBe(true);
    expect(currentSave().map.outposts[0]?.visits).toBe(1);
    expect(useGameStore.getState().pendingEvents.map((e) => e.type)).toEqual(['outpostVisited']);
    expect(st.visitOutpost('op1')).toBe(false);
    expect(useGameStore.getState().notice).toMatch(/already logged/);
    useGameStore.setState({ pendingEvents: [], notice: null });

    expect(st.undoOutpostVisit('op1')).toBe(true);
    expect(currentSave().map.outposts[0]?.visits).toBe(0);
    expect(st.editOutpost('op1', { name: 'Northside Pool', type: 'pool', note: 'Early.' })).toBe(true);
    expect(currentSave().map.outposts[0]).toMatchObject({ name: 'Northside Pool', type: 'pool', note: 'Early.' });
    expect(st.moveOutpost('op1', { x: -2, y: 1 })).toBe(true);
    expect(currentSave().map.outposts[0]?.cell).toEqual({ x: -2, y: 1 });
    expect(st.forgetOutpost('op1')).toBe(false);
    expect(useGameStore.getState().notice).toMatch(/retire it first/i);
    expect(st.retireOutpost('op1')).toBe(true);
    expect(currentSave().map.outposts[0]?.retired).toBe(true);
    expect(st.restoreOutpost('op1')).toBe(true);
    expect(currentSave().map.outposts[0]?.retired).toBe(false);
    expect(st.retireOutpost('op1')).toBe(true);
    expect(st.forgetOutpost('op1')).toBe(true);
    expect(currentSave().map.outposts).toEqual([]);
  });

  it('turns refusals into warm notices with the names and numbers filled in', () => {
    const save = seedStore();
    const st = useGameStore.getState();
    expect(st.createOutpost({ name: '   ', type: 'gym', cell: { x: 2, y: 1 } })).toBe(false);
    expect(useGameStore.getState().notice).toBe('Give it a name, even a silly one. The Ledger is not fussy.');
    st.createOutpost({ name: 'Gym', type: 'gym', cell: { x: 2, y: 1 } });
    st.createOutpost({ name: 'gym', type: 'park', cell: { x: -2, y: 1 } });
    expect(useGameStore.getState().notice).toBe('There is already an outpost called gym. Try another name.');
    st.createOutpost({ name: 'Close', type: 'park', cell: { x: 1, y: 0 } });
    expect(useGameStore.getState().notice).toMatch(/keep a little distance/);
    expect(mapNotice(save, 'cap reached')).toBe('The Ledger holds 4 outposts at The Room. Each new ring makes room for one more.');
    expect(mapNotice(save, 'zone full', { cell: { x: 2, y: 1 } })).toBe('The Floor already has three outposts. Try a ring further out, or closer in.');
    expect(mapNotice(save, 'something odd')).toBe('something odd');
    expect(currentSave().player.domainPoints).toBe(0);
  });

  it('tags a done quest from the settlement window and shows one toast when a state is reached', () => {
    const save = seedStore();
    const st = useGameStore.getState();
    st.createOutpost({ name: 'Gym', type: 'gym', cell: { x: 2, y: 1 } });
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    expect(st.tagQuestAtOutpost(q.instanceId, 'op1')).toBe(false);
    expect(useGameStore.getState().notice).toMatch(/finish the quest first/i);
    st.complete(q.instanceId);
    useGameStore.setState({ pendingEvents: [], notice: null });
    expect(st.tagQuestAtOutpost(q.instanceId, 'op1')).toBe(true);
    expect(currentSave().map.visits[0]).toMatchObject({ instanceId: q.instanceId, source: 'quest', counted: true });
    expect(st.visitOutpost('op1')).toBe(false);
    const reached = oneOutpostToast([
      { type: 'outpostVisited', outpostId: 'op1', visits: 3, source: 'checkin', counted: true },
      { type: 'outpostStateReached', outpostId: 'op1', state: 'scouted' },
    ]);
    expect(reached.map((e) => e.type)).toEqual(['outpostStateReached']);
  });

  it('markMapSeen records the look without events', () => {
    seedStore();
    useGameStore.getState().markMapSeen();
    expect(currentSave().map.lastSeen).toMatchObject({ domainPoints: 0 });
    expect(useGameStore.getState().pendingEvents).toEqual([]);
  });
});

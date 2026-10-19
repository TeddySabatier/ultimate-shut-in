import { beforeEach, describe, expect, it } from 'vitest';
import { createOutpost, gameDayIndex, isOutpostQuiet, logOutpostVisit, markMapSeen, settleWave } from '../game';
import { T0, TZ, at, fresh } from '../game/testUtils';
import { INITIAL_STATE, mapNotice, oneOutpostToast, useGameStore } from './gameStore';
import { mapView } from './mapView';
import { currentSave, seedStore } from '../test/storeUtils';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

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

describe('mapView', () => {
  it('arranges zone status, caps, compare, residue and quiet from the engine', () => {
    let s = fresh();
    s = { ...s, player: { ...s.player, domainPoints: 400, ring: 3, highestRing: 3 } };
    s = createOutpost(s, { name: 'Gym', type: 'gym', cell: { x: 2, y: 1 } }, T0, TZ).save;
    s = logOutpostVisit(s, 'op1', T0, TZ).save;
    s = markMapSeen(s, T0, TZ).save;
    s = settleWave({ ...s, vassals: { ...s.vassals, move: { ...s.vassals.move, trust: 2 } } }, 0, T0, DAY0 + 7).save;
    const view = mapView(s, at(8));
    expect(view.dp).toBe(s.player.domainPoints);
    expect(view.ring).toBe(3);
    expect(view.zones[0]?.status).toBe('claimed');
    expect(view.zones[2]?.status).toBe('current');
    expect(view.zones[3]?.status).toBe('next');
    expect(view.zones[4]?.status).toBe('beyond');
    expect(view.cap).toBe(6);
    expect(view.free).toBe(5);
    expect(view.outposts[0]).toMatchObject({ zone: 3, loggedToday: false, quiet: false });
    expect(view.sinceDp).toBeGreaterThan(0);
    expect(view.compare.dp).toBe(s.map.snapshots[0]!.domainPoints);
    expect(view.residue.length).toBeGreaterThan(0);
    expect(view.wallsHeld).toBeGreaterThan(0);
    const later = mapView(s, at(21));
    expect(later.outposts[0]?.quiet).toBe(true);
    expect(isOutpostQuiet(s.map.outposts[0]!, later.today)).toBe(true);
  });

  it('marks a same-day check-in as undoable and a tagged quest as not', () => {
    seedStore();
    const st = useGameStore.getState();
    st.createOutpost({ name: 'Park', type: 'park', cell: { x: -2, y: 1 } });
    st.visitOutpost('op1');
    const after = currentSave();
    const view = mapView(after, Date.now());
    expect(view.outposts[0]?.loggedToday).toBe(true);
    expect(view.outposts[0]?.canUndoToday).toBe(true);
  });
});

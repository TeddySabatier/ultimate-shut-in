import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings, type HabitId, type WaveRecord } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { currentSave, seedStore } from '../../test/storeUtils';
import { OverlayHost } from './OverlayHost';

describe('OverlayHost', () => {
  it('renders nothing with an empty queue', () => {
    seedStore();
    const { container } = render(<OverlayHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a reward toast for questDone and dismisses on tap', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    useGameStore.setState({
      pendingEvents: [
        { type: 'questDone', instanceId: q.instanceId, habit: q.habit, rewards: { xp: 24, coins: 11, dp: 1, loyalty: 6, utility: 0 }, timedBonus: true },
        { type: 'catchUp', days: 3 },
      ],
    });
    render(<OverlayHost />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent(/settlement/i);
    expect(toast).toHaveTextContent('+24');
    expect(toast).toHaveTextContent(/timed \+10%/i);
    fireEvent.click(toast);
    expect(useGameStore.getState().pendingEvents).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(/welcome back/i);
  });

  it('the Dismiss button advances the queue by exactly one event', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    useGameStore.setState({
      pendingEvents: [
        { type: 'questDone', instanceId: q.instanceId, habit: q.habit, rewards: { xp: 24, coins: 11, dp: 1, loyalty: 6, utility: 0 }, timedBonus: false },
        { type: 'levelUp', level: 2 },
        { type: 'catchUp', days: 3 },
      ],
    });
    render(<OverlayHost />);
    // The button sits inside the tappable window: without stopPropagation the level-up was skipped.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useGameStore.getState().pendingEvents).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: /level up/i })).toBeInTheDocument();
  });

  it('Continue on the level-up window dismisses exactly one event when two are queued', () => {
    seedStore();
    useGameStore.setState({ pendingEvents: [{ type: 'levelUp', level: 2 }, { type: 'ringUnlocked', ring: 2 }] });
    render(<OverlayHost />);
    // A mouse click bubbles to the frame, which also dismisses on tap: the ring unlock used to be swallowed.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(useGameStore.getState().pendingEvents).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: /domain expanded/i })).toBeInTheDocument();
  });

  it('Continue on the wave window dismisses exactly one event when two are queued', () => {
    seedStore();
    const record: WaveRecord = {
      index: 0,
      ring: 1,
      attack: 20,
      defense: 31,
      breakdown: { vassals: 8, trust: 14, walls: 5, combos: 0, titles: 0, wellKept: 4, outposts: 0, arena: 0 },
      result: 'win',
      dpAwarded: 15,
      log: ['Wave 1 reaches The Room.', 'Decisive.'],
      settledAt: Date.now(),
    };
    useGameStore.setState({ pendingEvents: [{ type: 'waveSettled', record }, { type: 'levelUp', level: 3 }] });
    render(<OverlayHost />);
    // The store seeds reduced motion, so the log is fully revealed and Continue is the only button.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(useGameStore.getState().pendingEvents).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: /level up/i })).toBeInTheDocument();
  });

  it('shows the level-up window and dismisses with Enter', () => {
    seedStore();
    useGameStore.setState({ pendingEvents: [{ type: 'levelUp', level: 2 }] });
    render(<OverlayHost />);
    const dialog = screen.getByRole('dialog', { name: /level up/i });
    expect(dialog).toHaveTextContent('Lv 2');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(useGameStore.getState().pendingEvents).toHaveLength(0);
  });

  it('shows the ring unlock window with the ring scene and vignette', () => {
    seedStore();
    useGameStore.setState({ pendingEvents: [{ type: 'ringUnlocked', ring: 2 }] });
    render(<OverlayHost />);
    expect(screen.getByRole('dialog', { name: /domain expanded/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Flat' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The Flat' })).toBeInTheDocument();
    expect(screen.getByText(/Unlocked:/).parentElement).toHaveTextContent('Kitchen');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(useGameStore.getState().pendingEvents).toHaveLength(0);
  });

  it('shows the wave result window with bars, breakdown and log', () => {
    seedStore();
    const record: WaveRecord = {
      index: 0,
      ring: 1,
      attack: 20,
      defense: 31,
      breakdown: { vassals: 8, trust: 14, walls: 5, combos: 0, titles: 0, wellKept: 4, outposts: 0, arena: 0 },
      result: 'decisive',
      dpAwarded: 22,
      log: ['Wave 1 reaches The Room.', 'Pell holds the stairwell. +9', 'Decisive.'],
      settledAt: Date.now(),
    };
    useGameStore.setState({ pendingEvents: [{ type: 'waveSettled', record }] });
    render(<OverlayHost />);
    expect(screen.getByRole('dialog', { name: /wave 1/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Attack' })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('progressbar', { name: 'Defense' })).toHaveAttribute('aria-valuenow', '31');
    expect(screen.getByText('Decisive')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /battle log/i })).toHaveTextContent('Pell holds the stairwell');
    expect(screen.getByText(/\+22 Domain Points/)).toBeInTheDocument();
  });

  it('shows the vassal-left window with a Welcome back shortcut', () => {
    seedStore();
    useGameStore.setState({ pendingEvents: [{ type: 'vassalLeft', habit: 'move' }] });
    render(<OverlayHost />);
    expect(screen.getByRole('dialog', { name: /pell is away/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('offers up to three related outposts on questDone and never blocks dismiss', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    const habit = q.habit as HabitId;
    const cells = [
      { x: 2, y: 1 },
      { x: -2, y: 1 },
      { x: 1, y: -3 },
      { x: -3, y: -3 },
    ];
    cells.forEach((cell, i) => {
      useGameStore.getState().createOutpost({ name: `Place ${i + 1}`, type: 'other', habits: [habit], cell });
    });
    useGameStore.setState({ pendingEvents: [] });
    useGameStore.getState().complete(q.instanceId);
    const events = useGameStore.getState().pendingEvents.filter((e) => e.type === 'questDone');
    useGameStore.setState({ pendingEvents: events });
    render(<OverlayHost />);
    expect(screen.getByText(strings.map.settlement.where)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Place / })).toHaveLength(3);
    expect(screen.getByRole('button', { name: strings.map.settlement.elsewhere })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useGameStore.getState().pendingEvents).toHaveLength(0);
    expect(currentSave().map.outposts[0]?.visits).toBe(0);
  });

  it('tags the quest when a related outpost is chosen', () => {
    const save = seedStore();
    const q = save.board?.quests[0];
    if (!q) throw new Error('no quest');
    useGameStore.getState().createOutpost({ name: 'Hollow Park', type: 'other', habits: [q.habit], cell: { x: 2, y: 1 } });
    useGameStore.setState({ pendingEvents: [] });
    useGameStore.getState().complete(q.instanceId);
    useGameStore.setState({ pendingEvents: useGameStore.getState().pendingEvents.filter((e) => e.type === 'questDone') });
    render(<OverlayHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Hollow Park' }));
    expect(currentSave().map.outposts[0]?.visits).toBe(1);
    expect(currentSave().map.visits.some((v) => v.outpostId === 'op1' && v.instanceId === q.instanceId)).toBe(true);
  });

  it('shows a refusal notice as a toast and clears it', () => {
    seedStore();
    useGameStore.setState({ notice: 'not enough settlement' });
    render(<OverlayHost />);
    expect(screen.getByRole('status')).toHaveTextContent('not enough settlement');
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useGameStore.getState().notice).toBeNull();
  });
});

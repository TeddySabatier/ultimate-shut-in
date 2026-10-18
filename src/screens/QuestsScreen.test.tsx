import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGameStore } from '../state/gameStore';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';
import { QuestsScreen } from './QuestsScreen';

describe('QuestsScreen', () => {
  it('lists today\'s board and settles a quest through the store', () => {
    const save = seedStore();
    const total = save.board?.quests.length ?? 0;
    renderWithRouter(<QuestsScreen />);
    expect(screen.getAllByRole('article')).toHaveLength(total);
    expect(screen.getByText(`0/${total}`)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^done$/i })[0] as HTMLElement);
    expect(screen.getByText(`1/${total}`)).toBeInTheDocument();
    expect(currentSave().stats.questsTotal).toBe(1);
    expect(useGameStore.getState().pendingEvents[0]?.type).toBe('questDone');
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  it('shows the all-settled window once every quest is done', () => {
    const save = seedStore();
    for (const q of save.board?.quests ?? []) useGameStore.getState().complete(q.instanceId);
    renderWithRouter(<QuestsScreen />);
    expect(screen.getByRole('heading', { name: /all settled/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^done$/i })).toBeNull();
  });

  it('offers one swap per day and hides it afterwards', () => {
    const save = seedStore();
    useGameStore.setState({ save: { ...save, player: { ...save.player, coins: 100 } } });
    renderWithRouter(<QuestsScreen />);
    const swaps = screen.getAllByRole('button', { name: /swap quest/i });
    expect(swaps.length).toBe(save.board?.quests.length ?? 0);
    fireEvent.click(swaps[0] as HTMLElement);
    expect(currentSave().board?.rerolledToday).toBe(true);
    expect(currentSave().player.coins).toBe(85);
    expect(screen.queryByRole('button', { name: /swap quest/i })).toBeNull();
  });
});

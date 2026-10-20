import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { entryFee, formatLine, strings } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { currentSave, renderWithRouter, seedStore } from '../../test/storeUtils';
import { HomeScreen } from '../../screens/HomeScreen';
import { ArenaCard } from './ArenaCard';

const card = strings.arena.ui.card;

describe('ArenaCard', () => {
  it('shows the fee and the purse and links to the Arena', () => {
    seedStore('Card');
    useGameStore.setState((s) => {
      if (s.save) s.save.player.coins = 312;
    });
    renderWithRouter(<ArenaCard save={currentSave()} now={Date.now()} />);
    const el = screen.getByTestId('arena-card');
    expect(within(el).getByRole('heading', { level: 2, name: card.title })).toBeInTheDocument();
    expect(within(el).getByText(formatLine(card.fee, { fee: entryFee(1, currentSave().settings.difficulty) }))).toBeInTheDocument();
    expect(within(el).getByText(formatLine(strings.arena.ui.purse, { coins: '312' }))).toBeInTheDocument();
    expect(within(el).getByRole('link', { name: card.open })).toHaveAttribute('href', '/arena');
  });

  it('sits on the Haven screen right below the recent log', () => {
    seedStore('Card');
    renderWithRouter(<HomeScreen />);
    const log = screen.getByRole('heading', { name: 'Recent log' }).closest('section')!;
    const arena = screen.getByTestId('arena-card');
    expect(log.nextElementSibling).toBe(arena);
  });
});

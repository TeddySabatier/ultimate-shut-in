import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings, titles } from '../game';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';
import { useGameStore } from '../state/gameStore';
import { CharacterScreen } from './CharacterScreen';

describe('CharacterScreen', () => {
  it('shows the Absolute panel, locked titles with conditions and the vassal list', () => {
    seedStore('Keeper');
    renderWithRouter(<CharacterScreen />);
    expect(screen.getByText('Keeper')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Titles (0/${titles.length})` })).toBeInTheDocument();
    expect(screen.getByText('Seven Days')).toBeInTheDocument();
    expect(screen.getByText('7 quest days in a row')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { expanded: false }).length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByRole('heading', { name: /resurrection token/i })).toBeNull();
  });

  it('expands a vassal to show trust, loyalty and personality', () => {
    seedStore();
    renderWithRouter(<CharacterScreen />);
    fireEvent.click(screen.getByRole('button', { name: /pell the runner/i }));
    expect(screen.getByRole('img', { name: /trust 0 of 7/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /pell loyalty/i })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/bike courier/i)).toBeInTheDocument();
  });

  it('links an empty Outposts section to the Map', () => {
    seedStore();
    renderWithRouter(<CharacterScreen />);
    expect(screen.getByText(strings.map.outposts.ledgerEmpty)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.map.outposts.ledgerLink })).toHaveAttribute('href', '/map');
  });

  it('restores a retired outpost from the Ledger', () => {
    seedStore();
    useGameStore.getState().createOutpost({ name: 'Hollow Park', type: 'park', cell: { x: 3, y: 1 } });
    useGameStore.getState().retireOutpost('op1');
    useGameStore.setState({ pendingEvents: [], notice: null });
    renderWithRouter(<CharacterScreen />);
    fireEvent.click(screen.getByRole('button', { name: `${strings.map.outposts.restore}: Hollow Park` }));
    expect(currentSave().map.outposts[0]?.retired).toBe(false);
    expect(screen.queryByRole('button', { name: `${strings.map.outposts.forget}: Hollow Park` })).toBeNull();
  });

  it('forgets a retired outpost only after a two-step confirm', () => {
    seedStore();
    useGameStore.getState().createOutpost({ name: 'Hollow Park', type: 'park', cell: { x: 3, y: 1 } });
    useGameStore.getState().retireOutpost('op1');
    useGameStore.setState({ pendingEvents: [], notice: null });
    renderWithRouter(<CharacterScreen />);
    fireEvent.click(screen.getByRole('button', { name: `${strings.map.outposts.forget}: Hollow Park` }));
    const confirm = screen.getByRole('dialog', { name: /Forget Hollow Park/ });
    fireEvent.change(within(confirm).getByRole('textbox'), { target: { value: strings.map.outposts.forget.toUpperCase() } });
    fireEvent.click(within(confirm).getByRole('button', { name: strings.map.outposts.forget }));
    expect(currentSave().map.outposts).toHaveLength(0);
  });

  it('renames the Absolute inline', () => {
    seedStore('Keeper');
    renderWithRouter(<CharacterScreen />);
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Warden' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(currentSave().player.name).toBe('Warden');
    expect(screen.getByText('Warden')).toBeInTheDocument();
  });
});

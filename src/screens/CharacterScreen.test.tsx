import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { titles } from '../game';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';
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

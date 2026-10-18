import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, seedStore } from '../test/storeUtils';
import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it('shows the ring header, utilities, wave outlook and vassal strip', () => {
    seedStore('Keeper');
    renderWithRouter(<HomeScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'The Room' })).toBeInTheDocument();
    expect(screen.getByText('Keeper')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Power' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'Water' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Gas' })).toBeInTheDocument();
    expect(screen.getByText(/next wave in \d+ days|wave settles tonight/i)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem', { name: /the (runner|scout|steward|herald|archivist|nightwatch|quartermaster|bathkeeper)/i })).toHaveLength(8);
  });

  it('hides disabled habits from the vassal strip and the utilities', () => {
    seedStore('Keeper', { enabledHabits: ['move', 'outside'] });
    renderWithRouter(<HomeScreen />);
    expect(screen.getAllByRole('listitem', { name: /the (runner|scout)/i })).toHaveLength(2);
    expect(screen.queryByRole('progressbar', { name: 'Power' })).toBeNull();
  });
});

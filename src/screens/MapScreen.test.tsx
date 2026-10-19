import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../state/gameStore';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';
import { MapScreen } from './MapScreen';

function mark(name: string, cell: { x: number; y: number }, type: 'gym' | 'park' = 'gym') {
  useGameStore.getState().createOutpost({ name, type, cell });
  useGameStore.setState({ pendingEvents: [], notice: null });
}

describe('MapScreen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the heading, the DP chip, the map with seven zone bands, the Domain and Outposts windows', () => {
    seedStore('Keeper');
    renderWithRouter(<MapScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'City map' })).toBeInTheDocument();
    expect(screen.getByText('Ring 1 of 7 · The Room')).toBeInTheDocument();
    expect(screen.getByLabelText('0 Domain Points')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /city map\. seven zones/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Zone \d, / })).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Zone 1, The Room, current ring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zone 2, The Flat, next ring, 120 DP to go' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Domain/ })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Domain Points to the next ring' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(/No outposts yet/)).toBeInTheDocument();
    expect(screen.getByText('Room for 4 more at The Room. Up to 3 per zone.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Same as your last look');
  });

  it('opens the zone sheet from a band, closes on Escape, and the list view opens the same sheets', () => {
    seedStore();
    renderWithRouter(<MapScreen />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Zone 2,/ }), { key: 'Enter' });
    const dialog = screen.getByRole('dialog', { name: 'The Flat' });
    expect(dialog).toHaveTextContent('Zone 2 of 7');
    expect(dialog).toHaveTextContent('120 DP to go');
    expect(dialog).toHaveTextContent('Opens with The Flat.');
    expect(dialog).toHaveTextContent('The Protocol has not written this page yet');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog', { name: 'The Flat' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show the map as a list' }));
    expect(screen.queryByRole('group', { name: /city map/i })).toBeNull();
    const rows = within(screen.getByRole('list', { name: 'Zones of the city' })).getAllByRole('button');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('The Room');
    expect(rows[0]).toHaveTextContent('Current');
    fireEvent.click(rows[0]!);
    const room = screen.getByRole('dialog', { name: 'The Room' });
    expect(room).toHaveTextContent('Current ring');
    expect(room).toHaveTextContent('Quest Board.');
    expect(within(room).getByRole('button', { name: 'Replay vignette' })).toBeInTheDocument();
    expect(localStorage.getItem('haven.mapList')).toBe('1');
  });

  it('marks an outpost through the form, logs a visit from its row, and shows it on the map and in the sheet', () => {
    seedStore();
    renderWithRouter(<MapScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Mark an outpost/ }));
    const form = screen.getByRole('dialog', { name: 'Mark a place' });
    fireEvent.click(within(form).getByRole('button', { name: 'Mark outpost' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(/give it a name/i);
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Hollow Park' } });
    fireEvent.click(within(form).getByRole('radio', { name: 'Park' }));
    fireEvent.change(within(form).getByLabelText('How far does it feel?'), { target: { value: '4' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Mark outpost' }));
    expect(screen.queryByRole('dialog', { name: 'Mark a place' })).toBeNull();
    const save = currentSave();
    expect(save.map.outposts[0]).toMatchObject({ name: 'Hollow Park', type: 'park', habits: ['outside', 'move'] });
    expect(save.map.outposts[0]?.cell && Math.hypot(save.map.outposts[0].cell.x, save.map.outposts[0].cell.y)).toBeGreaterThan(2.62);

    // The pin, the row and the "I was there" button.
    expect(screen.getByRole('button', { name: /Hollow Park, Park, Marked, zone 4, beyond the wall, 0 visits/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hollow Park, Marked, 0/3 visits, beyond the wall' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I was there: log a visit to Hollow Park' }));
    expect(currentSave().map.outposts[0]?.visits).toBe(1);
    expect(screen.getByRole('button', { name: 'Visit to Hollow Park logged today' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: /Outposts/ })).toBeInTheDocument();

    // The outpost sheet from the row.
    fireEvent.click(screen.getByRole('button', { name: /^Hollow Park, Marked/ }));
    const sheet = screen.getByRole('dialog', { name: 'Hollow Park' });
    expect(sheet).toHaveTextContent('Zone 4 · The Building');
    expect(sheet).toHaveTextContent('2 more visits to Scouted. Visited today.');
    expect(sheet).toHaveTextContent('Beyond the wall for now. The dotted trail is the way you walk there.');
    expect(within(sheet).getByRole('button', { name: 'Logged today' })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole('button', { name: "Undo today's visit" }));
    expect(currentSave().map.outposts[0]?.visits).toBe(0);
    expect(within(sheet).getByRole('button', { name: 'I was there today' })).toBeEnabled();
  });

  it('edits and retires from the sheet, and refuses past the cap with a warm line', () => {
    seedStore();
    mark('A', { x: 2, y: 1 });
    renderWithRouter(<MapScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^A, Marked/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'A' })).getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: 'Edit A' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Riverside Gym' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(currentSave().map.outposts[0]?.name).toBe('Riverside Gym');
    const sheet = screen.getByRole('dialog', { name: 'Riverside Gym' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retire' }));
    const confirm = screen.getByRole('dialog', { name: /Retire Riverside Gym/ });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Retire' }));
    expect(currentSave().map.outposts[0]?.retired).toBe(true);
    expect(screen.getByText(/No outposts yet/)).toBeInTheDocument();

    mark('B', { x: 2, y: 1 });
    mark('C', { x: -2, y: 1 });
    mark('D', { x: 1, y: -3 });
    mark('E', { x: -3, y: -3 });
    expect(screen.getByRole('button', { name: /Mark an outpost/ })).toBeDisabled();
    expect(screen.getByText('The Ledger holds 4 outposts at The Room. Each new ring makes room for one more.')).toBeInTheDocument();
  });

  it('records the look when it unmounts', () => {
    seedStore();
    const { unmount } = renderWithRouter(<MapScreen />);
    expect(currentSave().map.lastSeen).toBeNull();
    unmount();
    expect(currentSave().map.lastSeen).toMatchObject({ domainPoints: 0 });
  });
});

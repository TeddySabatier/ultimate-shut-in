import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildParty, formatLine, gearPrice, getArenaItem, rosterFor, strings, trainingStatus } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { currentSave, renderWithRouter, seedStore } from '../../test/storeUtils';
import { Armory } from './Armory';

const a = strings.arena.ui.armory;

function seed(coins: number) {
  seedStore('Smith');
  useGameStore.setState((s) => {
    if (s.save) s.save.player.coins = coins;
  });
  const troop = rosterFor(currentSave())[0]!;
  return { troop, habit: troop.habit! };
}

const powerOf = (id: string) => buildParty(currentSave()).members.find((m) => m.id === id)!.power;

function renderArmory() {
  return renderWithRouter(<Armory save={currentSave()} />);
}

/** The Armory re-reads the save after each action (the screen passes the live save). */
function Live() {
  const save = useGameStore((s) => s.save);
  return save ? <Armory save={save} /> : null;
}

describe('Armory', () => {
  it('lists every troop with power, gear and training in its summary', () => {
    const { troop } = seed(500);
    renderArmory();
    const roster = rosterFor(currentSave());
    for (const m of roster) expect(screen.getByTestId(`arena-troop-${m.id}`)).toBeInTheDocument();
    const summary = screen.getByTestId(`arena-troop-${troop.id}`);
    expect(within(summary).getByText(formatLine(a.power, { power: powerOf(troop.id) }))).toBeInTheDocument();
    expect(within(summary).getByText(a.noGear)).toBeInTheDocument();
    expect(within(summary).getByText(formatLine(a.trained, { bumps: 0, max: 6 }))).toBeInTheDocument();
  });

  it('buys gear: coins drop, power rises, and the next tier is offered', () => {
    const { troop } = seed(500);
    renderWithRouter(<Live />);
    const baton = getArenaItem('practice_baton')!;
    const price = gearPrice(baton, 1);
    const before = powerOf(troop.id);
    fireEvent.click(screen.getByTestId(`arena-troop-${troop.id}`));
    fireEvent.click(screen.getByRole('button', { name: formatLine(a.buyLabel, { item: baton.name, troop: troop.name, price }) }));
    expect(currentSave().player.coins).toBe(500 - price);
    expect(powerOf(troop.id)).toBe(before + baton.power);
    const summary = screen.getByTestId(`arena-troop-${troop.id}`);
    expect(within(summary).getByText(formatLine(a.power, { power: before + baton.power }))).toBeInTheDocument();
    expect(within(summary).getByRole('img', { name: `${a.slots.weapon}: ${baton.name}` })).toBeInTheDocument();
    expect(screen.getByTestId('arena-armory-status')).toHaveTextContent(formatLine(a.powerNow, { troop: troop.name, power: before + baton.power }));
    // The tier 2 staff opens at ring 2: its Buy says why it is closed.
    const staff = getArenaItem('walking_staff')!;
    expect(screen.getByRole('button', { name: formatLine(a.buyLabel, { item: staff.name, troop: troop.name, price: gearPrice(staff, 1) }) })).toBeDisabled();
    expect(screen.getAllByText(strings.arena.errors['ring too low']).length).toBeGreaterThan(0);
  });

  it('says how many coins are missing next to a closed Buy', () => {
    const { troop } = seed(10);
    renderArmory();
    fireEvent.click(screen.getByTestId(`arena-troop-${troop.id}`));
    const baton = getArenaItem('practice_baton')!;
    const price = gearPrice(baton, 1);
    expect(screen.getByRole('button', { name: formatLine(a.buyLabel, { item: baton.name, troop: troop.name, price }) })).toBeDisabled();
    expect(screen.getAllByText(formatLine(a.needMore, { missing: price - 10 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatLine(a.purse, { coins: '10' })).length).toBeGreaterThan(0);
  });

  it('trains: coins drop, power rises, and the weekly limit closes the button with its reason', () => {
    const { troop, habit } = seed(500);
    renderWithRouter(<Live />);
    fireEvent.click(screen.getByTestId(`arena-troop-${troop.id}`));
    const before = powerOf(troop.id);
    const first = trainingStatus(currentSave(), habit);
    fireEvent.click(screen.getByRole('button', { name: formatLine(a.trainLabel, { troop: troop.name, price: first.price! }) }));
    expect(currentSave().player.coins).toBe(500 - first.price!);
    expect(powerOf(troop.id)).toBe(before + first.nextPower);
    const second = trainingStatus(currentSave(), habit);
    fireEvent.click(screen.getByRole('button', { name: formatLine(a.trainLabel, { troop: troop.name, price: second.price! }) }));
    const third = trainingStatus(currentSave(), habit);
    expect(third.weekBumps).toBe(2);
    expect(screen.getByRole('button', { name: formatLine(a.trainLabel, { troop: troop.name, price: third.price! }) })).toBeDisabled();
    expect(screen.getAllByText(strings.arena.errors['training week full']).length).toBeGreaterThan(0);
    expect(within(screen.getByTestId(`arena-troop-${troop.id}`)).getByText(formatLine(a.trained, { bumps: 2, max: 6 }))).toBeInTheDocument();
  });

  it('wears a rare item from the stash on the chosen troop', () => {
    seed(0);
    const roster = rosterFor(currentSave());
    const target = roster[1]!;
    useGameStore.setState((s) => {
      if (s.save) s.save.arena.stash = ['moonlit_pike'];
    });
    renderWithRouter(<Live />);
    const pike = getArenaItem('moonlit_pike')!;
    const before = powerOf(target.id);
    fireEvent.change(screen.getByLabelText(formatLine(a.troopFor, { item: pike.name })), { target: { value: target.habit } });
    fireEvent.click(screen.getByRole('button', { name: formatLine(a.wearLabel, { item: pike.name, troop: target.name }) }));
    expect(currentSave().arena.stash).toEqual([]);
    expect(currentSave().arena.gear[target.habit!].weapon).toBe('moonlit_pike');
    expect(powerOf(target.id)).toBe(before + pike.power);
    expect(screen.getByText(formatLine(a.stashEmpty, { min: 3 }))).toBeInTheDocument();
  });

  it('buys Haven decor once and marks it owned', () => {
    seed(1000);
    renderWithRouter(<Live />);
    const buttons = screen.getAllByRole('button', { name: /for the Haven/ });
    const first = buttons[0]!;
    const label = first.getAttribute('aria-label') ?? '';
    fireEvent.click(first);
    expect(currentSave().arena.decor).toHaveLength(1);
    expect(currentSave().player.coins).toBeLessThan(1000);
    expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(screen.getAllByText(a.owned).length).toBe(1);
  });
});

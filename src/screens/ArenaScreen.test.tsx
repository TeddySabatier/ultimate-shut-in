import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arenaContent, carriedHome, entryFee, formatLine, getArenaBuff, strings } from '../game';
import { useGameStore } from '../state/gameStore';
import { fake } from '../components/arena/host/testCatalog';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';

vi.mock('../components/arena/host/catalog', async () => (await import('../components/arena/host/testCatalog')).catalog);

import ArenaScreen from './ArenaScreen';

const u = strings.arena.ui;
const CANDIDATES = [{ id: 'alpha', minRing: 1, rosterMin: 1 }];

function seed(coins = 500): void {
  seedStore('Arena');
  useGameStore.setState((s) => {
    if (s.save) s.save.player.coins = coins;
  });
}

/** A run that just won its first room: the Lottery is open. */
function wonOnce(): void {
  seed();
  expect(useGameStore.getState().arenaEnter(CANDIDATES)).toBe(true);
  expect(useGameStore.getState().arenaResolve({ result: 'won', score: 700 }).applied).toBe(true);
  useGameStore.setState({ pendingEvents: [] });
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fake.games = [...fake.all];
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('ArenaScreen: the hub', () => {
  it('has one h1, a way back to the Haven and the purse', () => {
    seed(312);
    renderWithRouter(<ArenaScreen />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: u.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(u.back) })).toHaveAttribute('href', '/');
    expect(screen.getAllByText(formatLine(u.purse, { coins: '312' })).length).toBeGreaterThan(0);
  });

  it('says there are no games yet and keeps the door closed', () => {
    fake.games = [];
    seed();
    renderWithRouter(<ArenaScreen />);
    expect(screen.getAllByText(u.entry.noGames).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: u.entry.enter })).toBeDisabled();
    expect(screen.getByTestId('arena-entry-reason')).toHaveTextContent(u.entry.noGames);
  });

  it('lists every game with its category, ring, party, minutes and what it teaches', () => {
    seed();
    renderWithRouter(<ArenaScreen />);
    const list = screen.getByTestId('arena-games');
    expect(within(list).getByRole('heading', { name: 'Alpha Puzzle' })).toBeInTheDocument();
    expect(within(list).getByText('Alpha Puzzle tagline')).toBeInTheDocument();
    expect(within(list).getByText(u.games.categories.arcade)).toBeInTheDocument();
    expect(within(list).getByText(formatLine(u.games.locked, { ring: 3 }))).toBeInTheDocument();
    expect(within(list).getByText(formatLine(u.games.partyExact, { min: 2 }))).toBeInTheDocument();
    expect(within(list).getByText(formatLine(u.games.party, { min: 1, max: 3 }))).toBeInTheDocument();
    expect(within(list).getAllByText(formatLine(u.games.minutes, { minutes: 2 }))).toHaveLength(2);
    expect(within(list).getByText(formatLine(u.games.teaches, { skill: 'Reading odds' }))).toBeInTheDocument();
  });

  it('disables entry with the reason when the purse is short', () => {
    seed(5);
    renderWithRouter(<ArenaScreen />);
    const fee = entryFee(1, currentSave().settings.difficulty);
    expect(screen.getByRole('button', { name: u.entry.enter })).toBeDisabled();
    expect(screen.getByTestId('arena-entry-reason')).toHaveTextContent(formatLine(u.entry.short, { missing: fee - 5 }));
  });

  it('shows the daily suggestion as a soft line and keeps the button working', () => {
    seed();
    for (let i = 0; i < 5; i++) {
      expect(useGameStore.getState().arenaEnter(CANDIDATES)).toBe(true);
      useGameStore.getState().arenaAbandon();
    }
    useGameStore.setState({ pendingEvents: [] });
    renderWithRouter(<ArenaScreen />);
    expect(screen.getByText(formatLine(u.entry.daily, { runs: 5 }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: u.entry.enter })).toBeEnabled();
  });
});

describe('ArenaScreen: a run', () => {
  it('enters, plays a game, picks a buff, then banks the coins', async () => {
    seed();
    renderWithRouter(<ArenaScreen />);
    const fee = entryFee(1, currentSave().settings.difficulty);
    fireEvent.click(screen.getByRole('button', { name: u.entry.enter }));
    expect(currentSave().player.coins).toBe(500 - fee);
    expect(screen.getByTestId('arena-host')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Win the game' }));
    // The result stays on show although the run moved on to the Lottery.
    expect(currentSave().arena.run?.phase).toBe('lottery');
    expect(screen.getByTestId('arena-result-title')).toHaveTextContent(strings.arena.host.resultWon);
    fireEvent.click(screen.getByRole('button', { name: strings.arena.host.continue }));

    // The Lottery: three cards, each named with its amount.
    const lottery = screen.getByTestId('arena-lottery');
    const offers = currentSave().arena.run?.offers ?? [];
    expect(offers.length).toBe(arenaContent.lottery.offers);
    const first = offers[0]!;
    const def = getArenaBuff(first.id.split('@')[0]!)!;
    fireEvent.click(within(lottery).getByRole('button', { name: new RegExp(`^${def.name}`) }));
    expect(currentSave().arena.run?.phase).toBe('decide');
    expect(currentSave().arena.run?.buffs.map((b) => b.id)).toEqual([first.id]);

    // Decide: the buff is held, the next game is offered, and banking ends it.
    const decide = screen.getByTestId('arena-decide');
    expect(within(decide).getByText(new RegExp(def.name))).toBeInTheDocument();
    expect(within(decide).getByRole('button', { name: u.run.next })).toBeEnabled();
    const spoils = currentSave().arena.run?.pending.coins ?? 0;
    const before = currentSave().player.coins;
    fireEvent.click(screen.getByTestId('arena-bank-coins'));
    expect(currentSave().arena.run).toBeNull();
    expect(currentSave().player.coins).toBe(before + spoils);
    const summary = screen.getByTestId('arena-summary');
    expect(within(summary).getByText(formatLine(u.summary.banked, { wins: 1 }))).toBeInTheDocument();
    expect(within(summary).getByText(formatLine(u.summary.coins, { coins: spoils }))).toBeInTheDocument();
    fireEvent.click(within(summary).getByRole('button', { name: u.summary.dismiss }));
    expect(screen.queryByTestId('arena-summary')).toBeNull();
    // The run log keeps the learned note.
    const log = screen.getByTestId('arena-run-log');
    expect(within(log).getByText(u.runLog.ends.banked)).toBeInTheDocument();
    expect(within(log).getByText('Odds')).toBeInTheDocument();
  });

  it('goes on to the next game from Decide', async () => {
    wonOnce();
    const offer = currentSave().arena.run!.offers[0]!;
    useGameStore.getState().arenaPickBuff(offer.id);
    renderWithRouter(<ArenaScreen />);
    fireEvent.click(screen.getByRole('button', { name: u.run.next }));
    expect(currentSave().arena.run?.phase).toBe('playing');
    expect(await screen.findByRole('button', { name: 'Win the game' })).toBeInTheDocument();
  });

  it('a lost game brings the troops home and the hub shows what came back', async () => {
    seed();
    renderWithRouter(<ArenaScreen />);
    fireEvent.click(screen.getByRole('button', { name: u.entry.enter }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lose the game' }));
    expect(currentSave().arena.run).toBeNull();
    expect(screen.getByTestId('arena-result-title')).toHaveTextContent(strings.arena.host.resultLost);
    fireEvent.click(screen.getByRole('button', { name: strings.arena.host.continue }));
    const summary = screen.getByTestId('arena-summary');
    expect(within(summary).getByText(formatLine(u.summary.lost, { wins: 0 }))).toBeInTheDocument();
    expect(within(summary).getByText(u.summary.nothing)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: u.entry.enter })).toBeInTheDocument();
  });

  it('a game that finishes from a timer keeps its results on show', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      seed();
      renderWithRouter(<ArenaScreen />);
      fireEvent.click(screen.getByRole('button', { name: u.entry.enter }));
      await act(async () => {
        await Promise.resolve();
      });
      // The game finishes from its own timer, outside any React event.
      fireEvent.click(screen.getByRole('button', { name: 'Win in a moment' }));
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(currentSave().arena.run?.phase).toBe('lottery');
      expect(screen.getByTestId('arena-result')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ArenaScreen: banking choices', () => {
  it('explains each choice and why the closed ones are closed', () => {
    wonOnce();
    renderWithRouter(<ArenaScreen />);
    const bank = screen.getByTestId('arena-bank');
    const spoils = currentSave().arena.run!.pending.coins;
    expect(within(bank).getByRole('button', { name: formatLine(u.bank.coins, { coins: spoils }) })).toBeEnabled();
    expect(within(bank).getByRole('button', { name: formatLine(u.bank.defense, { amount: 1 }) })).toBeEnabled();
    expect(within(bank).getByRole('button', { name: u.bank.item })).toBeDisabled();
    expect(within(bank).getByText(formatLine(u.bank.itemShort, { min: arenaContent.bank.itemMinWins, wins: 1 }))).toBeInTheDocument();
    expect(within(bank).getByText(u.bank.defenseHelp)).toBeInTheDocument();
    // Nothing on the page promises Domain Points.
    expect(bank.textContent ?? '').not.toMatch(/domain point/i);
  });

  it('closes wave defense with its reason once the week is full, and banks defense when open', () => {
    wonOnce();
    useGameStore.setState((s) => {
      if (s.save) s.save.arena.defense = { period: s.save.week.index, amount: arenaContent.bank.defenseCapPerPeriod };
    });
    const { unmount } = renderWithRouter(<ArenaScreen />);
    const bank = screen.getByTestId('arena-bank');
    expect(within(bank).getByTestId('arena-bank-defense')).toBeDisabled();
    expect(within(bank).getByText(strings.arena.errors['defense capped'])).toBeInTheDocument();
    unmount();

    useGameStore.setState((s) => {
      if (s.save) s.save.arena.defense = null;
    });
    renderWithRouter(<ArenaScreen />);
    fireEvent.click(screen.getByTestId('arena-bank-defense'));
    expect(currentSave().arena.defense?.amount).toBe(1);
    expect(screen.getByText(formatLine(u.summary.defense, { defense: 1 }))).toBeInTheDocument();
  });

  it('banks from the Lottery without a pick, and says what a loss would still carry home', () => {
    wonOnce();
    renderWithRouter(<ArenaScreen />);
    const spoils = currentSave().arena.run!.pending.coins;
    expect(screen.getByText(formatLine(u.run.atRisk, { coins: carriedHome(spoils) }))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('arena-bank-coins'));
    expect(currentSave().arena.run).toBeNull();
    expect(screen.getByTestId('arena-summary')).toBeInTheDocument();
  });
});

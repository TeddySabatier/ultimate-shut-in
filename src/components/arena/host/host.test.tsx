import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedStore, currentSave } from '../../../test/storeUtils';
import { useGameStore } from '../../../state/gameStore';
import { fake } from './testCatalog';

vi.mock('./catalog', async () => (await import('./testCatalog')).catalog);

import { ArenaHost } from './ArenaHost';

const CANDIDATES = [{ id: 'alpha', minRing: 1, rosterMin: 1 }];

function startRun(): void {
  seedStore('Host', { reducedMotion: true });
  useGameStore.setState((s) => {
    if (s.save) s.save.player.coins = 500;
  });
  expect(useGameStore.getState().arenaEnter(CANDIDATES)).toBe(true);
}

function mount() {
  const onHold = vi.fn();
  const onDone = vi.fn();
  render(<ArenaHost onHold={onHold} onDone={onDone} />);
  return { onHold, onDone };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fake.mode = 'ok';
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('the Arena host', () => {
  it('mounts the game with the built party (first rosterSize.max troops), the run context, the language and reduced motion', async () => {
    startRun();
    mount();
    expect(await screen.findByTestId('ctx')).toHaveTextContent('3|0|1|0|en|true');
    expect(screen.getByTestId('arena-room')).toHaveTextContent('Room 1, difficulty 1 of 5');
  });

  it('applies a valid win through the store and shows the result panel with the way on', async () => {
    startRun();
    const { onHold, onDone } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'win' }));
    expect(onHold).toHaveBeenCalledTimes(1);
    const run = currentSave().arena.run!;
    expect(run.phase).toBe('lottery');
    expect(run.pending.wins).toBe(1);
    expect(run.games[0]).toMatchObject({ gameId: 'alpha', result: 'won', score: 700 });
    expect(screen.getByTestId('arena-result-title')).toHaveTextContent('Won');
    // The final board stays on show under the panel.
    expect(screen.getByRole('button', { name: 'win' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('records one outcome only: a second finish is ignored', async () => {
    startRun();
    mount();
    const win = await screen.findByRole('button', { name: 'win' });
    fireEvent.click(win);
    fireEvent.click(win);
    expect(currentSave().arena.run!.pending.wins).toBe(1);
  });

  it('treats an invalid outcome as fled with score 0, logs it, and never pays', async () => {
    startRun();
    mount();
    const coins = currentSave().player.coins;
    fireEvent.click(await screen.findByRole('button', { name: 'bad' }));
    const save = currentSave();
    expect(save.arena.run).toBeNull();
    expect(save.arena.log[0]).toMatchObject({ end: 'fled', wins: 0 });
    expect(save.arena.log[0]!.games[0]).toMatchObject({ result: 'fled', score: 0 });
    expect(save.player.coins).toBe(coins);
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.getByTestId('arena-result-title')).toHaveTextContent('Left early');
  });

  it('leaving before the end records fled', async () => {
    startRun();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'exit' }));
    await waitFor(() => expect(currentSave().arena.run).toBeNull());
    expect(currentSave().arena.log[0]).toMatchObject({ end: 'fled' });
  });

  it('a game that finishes right after asking to leave keeps its own outcome', async () => {
    startRun();
    mount();
    const button = await screen.findByRole('button', { name: 'exit then finish' });
    await act(async () => {
      fireEvent.click(button);
      await new Promise((r) => setTimeout(r, 20));
    });
    const run = currentSave().arena.run!;
    expect(run.games[0]).toMatchObject({ result: 'won', score: 700 });
  });

  it('leaving after the end just moves on', async () => {
    startRun();
    const { onDone } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'win' }));
    fireEvent.click(screen.getByRole('button', { name: 'exit' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('closes a run whose game is no longer listed instead of leaving it stuck', async () => {
    startRun();
    useGameStore.setState((s) => {
      if (s.save?.arena.run?.current) s.save.arena.run.current.gameId = 'gone';
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Bring the troops home' }));
    expect(currentSave().arena.run).toBeNull();
  });

  it('a game that crashes ends the run as fled instead of taking the Arena down', async () => {
    startRun();
    fake.mode = 'crash';
    mount();
    await waitFor(() => expect(currentSave().arena.run).toBeNull());
    expect(currentSave().arena.log[0]).toMatchObject({ end: 'fled' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('a game that fails to load offers Retry and Leave, and Leave closes the run', async () => {
    startRun();
    fake.mode = 'fail';
    mount();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    fake.mode = 'ok';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'win' })).toBeInTheDocument();
  });

  it('the host always has its own way out while the game is on', async () => {
    startRun();
    mount();
    await screen.findByRole('button', { name: 'win' });
    fireEvent.click(screen.getByTestId('arena-leave'));
    expect(currentSave().arena.run).toBeNull();
    expect(currentSave().arena.log[0]).toMatchObject({ end: 'fled' });
    expect(screen.queryByTestId('arena-leave')).toBeNull();
  });

  it('when the engine refuses the outcome the host moves on instead of showing a stale result', async () => {
    startRun();
    const { onDone } = mount();
    const win = await screen.findByRole('button', { name: 'win' });
    useGameStore.setState((s) => {
      if (s.save) s.save.arena.run = null; // the save changed under the host
    });
    fireEvent.click(win);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('arena-result')).toBeNull();
  });
});


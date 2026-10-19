/**
 * useEngine: onFinish exactly once, exit() after a pending onFinish, the
 * locale reaches initial(), invalid outcomes are reported in development.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameEngine, GameScreenProps } from '../contract';
import { fakes, goodGame, type RaceAction, type RaceState } from '../testing/fakes';
import { parties, runs } from '../testing/fixtures';
import { useEngine } from './useEngine';

function Harness({ engine, ...props }: GameScreenProps & { engine: GameEngine<RaceState, RaceAction> }) {
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  return (
    <>
      <p data-testid="locale">{state.locale}</p>
      <p data-testid="result">{outcome?.result ?? 'running'}</p>
      <button type="button" onClick={() => dispatch({ type: 'add', n: 5 })}>
        Step
      </button>
      <button
        type="button"
        onClick={() => {
          dispatch({ type: 'quit' });
          exit();
        }}
      >
        Quit and leave
      </button>
      <button type="button" onClick={exit}>
        Leave
      </button>
    </>
  );
}

function setup(engine: GameEngine<RaceState, RaceAction> = goodGame.engine, locale: 'en' | 'fr' = 'en') {
  const calls: string[] = [];
  const props: GameScreenProps = {
    party: parties.full,
    seed: 3,
    run: runs.plain,
    locale,
    reducedMotion: true,
    onFinish: vi.fn((o) => calls.push(`onFinish:${o.result}`)),
    onExit: vi.fn(() => calls.push('onExit')),
  };
  render(<Harness engine={engine} {...props} />);
  return { calls, props };
}

describe('useEngine', () => {
  it('passes the locale to initial()', () => {
    setup(goodGame.engine, 'fr');
    expect(screen.getByTestId('locale')).toHaveTextContent('fr');
  });

  it('a forfeit and exit() in the same handler report the outcome first, then leave', () => {
    const { calls } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Quit and leave' }));
    expect(calls).toEqual(['onFinish:fled', 'onExit']);
  });

  it('calls onFinish once however many actions follow, and onExit once', () => {
    const { calls } = setup();
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(calls.filter((c) => c.startsWith('onFinish'))).toHaveLength(1);
    expect(calls.filter((c) => c === 'onExit')).toHaveLength(1);
    expect(calls.at(-1)).toBe('onExit');
  });

  it('reports an invalid outcome with console.error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setup(fakes.badOutcome.engine);
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(error).toHaveBeenCalledWith('[games] invalid outcome:', expect.arrayContaining([expect.stringMatching(/score 1500\.5/)]), expect.anything());
    error.mockRestore();
  });
});

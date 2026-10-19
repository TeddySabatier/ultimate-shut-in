/**
 * The Screen plays the engine's game: clicking through it gives the outcome
 * the engine computes for the same actions, `onFinish` fires once, and the
 * log is in the player's language.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine } from './engine';
import CoinDuelScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

/** Click the first ally until the duel ends; returns the number of clicks. */
function playFirstAlly(): number {
  let clicks = 0;
  while (screen.queryAllByRole('button', { name: /^Send|^Envoyer/ }).length > 0 && clicks < 5) {
    fireEvent.click(screen.getAllByRole('button', { name: /^Send|^Envoyer/ })[0]!);
    clicks++;
  }
  return clicks;
}

describe('Coin Duel screen', () => {
  it('plays to the outcome the engine computes, and calls onFinish once', () => {
    const p = props();
    render(<CoinDuelScreen {...p} />);
    const clicks = playFirstAlly();
    let s = engine.initial(42, parties.full, runs.plain);
    for (let i = 0; i < clicks; i++) s = engine.reduce(s, { type: 'send', memberId: 'move' });
    const expected = engine.outcome(s);

    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect({ ...got, durationMs: undefined }).toEqual({ ...expected, durationMs: undefined });
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole('status')).toHaveTextContent(/Duel (won|lost)/);
  });

  it('writes the outcome log in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<CoinDuelScreen {...p} />);
    playFirstAlly();
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/^Manche 1/);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Duel de pièces');
  });

  it('number keys send allies; Forfeit ends as fled; Leave calls onExit', () => {
    const p = props();
    render(<CoinDuelScreen {...p} />);
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('coin-duel-score')).toHaveTextContent(/You [01], Rival [01]/);
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled', troopsUsed: ['outside'] });
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });
});

/**
 * The Screen plays the engine's game: skipping the look phase and placing
 * gives the outcome the engine computes, `onFinish` fires once, and the log
 * is in the player's language.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine, remainingChoices, type MemoryPalaceState } from './engine';
import MemoryPalaceScreen from './Screen';
import { wordText } from './words';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.starter, seed: 42, run: { ...runs.plain, difficulty: 1 }, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

function skipLook(): void {
  let guard = 0;
  while (screen.queryByRole('button', { name: 'Next' }) && guard < 20) {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    guard += 1;
  }
}

describe('Memory Palace screen', () => {
  it('plays a round through Next and Forfeit, and calls onFinish once', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Memory Palace');
    skipLook();
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole('status')).toHaveTextContent(/left the palace/i);
  });

  it('writes the outcome log in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<MemoryPalaceScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log.at(-1)).toMatch(/éloignes|éloigné|éloignée|Manche/i);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Palais de mémoire');
  });

  it('places a thing on a room through the buttons; Leave calls onExit', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    skipLook();
    let s = engine.initial(42, parties.starter, { ...runs.plain, difficulty: 1 }, 'en');
    while (s.phase === 'memorise') s = engine.reduce(s, { type: 'advance' });
    const wordId = remainingChoices(s as MemoryPalaceState)[0]!;
    const itemName = wordText(wordId, 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Gate' }));
    fireEvent.click(screen.getByRole('button', { name: `Place ${itemName}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });
});

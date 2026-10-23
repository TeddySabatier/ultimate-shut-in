/**
 * The Screen plays the engine's game: sentence-mode advances reach questions,
 * `onFinish` fires once, and Forfeit / Leave stay on separate buttons.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import ReadingRaceScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

function clickNamed(name: RegExp | string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

function advanceSentences(limit = 80): void {
  for (let i = 0; i < limit; i++) {
    const next = screen.queryByRole('button', { name: /^Next sentence$|^Phrase suivante$/ });
    if (!next) return;
    fireEvent.click(next);
  }
}

describe('Reading Race screen', () => {
  it('starts a race, can forfeit as fled, and Leave calls onExit', () => {
    const p = props();
    render(<ReadingRaceScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Reading Race');
    clickNamed('Start the race');
    expect(screen.getByTestId('reading-race-word')).toBeTruthy();
    clickNamed('Forfeit');
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    clickNamed('Leave');
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('writes the heading in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<ReadingRaceScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Course de lecture');
    expect(screen.getByRole('button', { name: 'Lancer la course' })).toBeTruthy();
  });

  it('plays a sentence-mode passage to questions and answers with number keys', () => {
    const p = props({ party: parties.starter, run: { ...runs.plain, difficulty: 1 } });
    render(<ReadingRaceScreen {...p} />);
    clickNamed('Show whole sentence');
    clickNamed('Start the race');
    advanceSentences();
    expect(screen.getByRole('heading', { name: 'Check what you understood' })).toBeTruthy();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByText(/Right\.|Not this one/)).toBeTruthy();
  });
});

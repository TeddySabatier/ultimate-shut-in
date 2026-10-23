/**
 * The Screen plays the engine: one option, forfeit, leave, and French copy.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { emptyRun } from '../contract';
import { parties, runs } from '../testing/contract';
import WordForgeScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

describe('Word Forge screen', () => {
  it('forges one multiple-choice card, forfeits as fled, and Leave calls onExit', () => {
    const p = props();
    render(<WordForgeScreen {...p} />);
    const options = screen.getAllByRole('button', { name: /^[1-4]/ });
    expect(options.length).toBeGreaterThan(0);
    fireEvent.click(options[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('renders French copy and accepts number keys', () => {
    const p = props({ locale: 'fr' });
    render(<WordForgeScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Forge des mots');
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('word-forge-progress')).toBeInTheDocument();
  });

  it('shows a typed field on difficulty 4', () => {
    const p = props({ run: emptyRun(4), party: parties.single });
    render(<WordForgeScreen {...p} />);
    expect(screen.getByTestId('word-forge-input')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('word-forge-input'), { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forge' }));
    expect(screen.getByTestId('word-forge-progress')).toBeInTheDocument();
  });
});

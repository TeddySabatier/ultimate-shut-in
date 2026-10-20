/**
 * The Screen plays the engine: Forfeit ends as fled, Leave calls onExit,
 * reduced motion shows the bar cue, and the log follows the locale.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import StillWaterScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return {
    party: parties.full,
    seed: 42,
    run: runs.plain,
    locale: 'en',
    reducedMotion: true,
    onFinish: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Still Water screen', () => {
  it('shows the practice disclaimer and the first cue', () => {
    render(<StillWaterScreen {...props()} />);
    expect(screen.getByTestId('still-water-disclaimer')).toHaveTextContent(/not therapy/i);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent(/Breathe in/i);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Still Water');
  });

  it('Forfeit ends as fled; Leave calls onExit', () => {
    const p = props();
    render(<StillWaterScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('writes French copy when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<StillWaterScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Eau calme');
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent(/Inspire/i);
    fireEvent.click(screen.getByRole('button', { name: "S'éloigner" }));
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/étang/i);
  });

  it('Space holds, and reduced motion keeps the text cue instead of the pond', () => {
    const p = props({ reducedMotion: true });
    render(<StillWaterScreen {...p} />);
    expect(screen.queryByTestId('still-water-pond')).toBeNull();
    expect(screen.getByRole('progressbar', { name: /Breathe in|Hold|Breathe out/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('still-water-hold')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyUp(window, { key: ' ' });
    expect(screen.getByTestId('still-water-hold')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Pause stops the clock; Resume starts it again', () => {
    const p = props({ reducedMotion: false });
    render(<StillWaterScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent(/Paused/i);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByTestId('still-water-cycle')).toHaveTextContent(/Cycle 1/);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('still-water-phase')).not.toHaveTextContent(/Paused/i);
  });
});

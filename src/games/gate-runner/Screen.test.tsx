/**
 * The Screen plays the engine's game: it mounts, Pause and Forfeit work, Leave
 * calls onExit, and the log is in the player's language.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import HavenRushScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

describe('Haven Rush screen', () => {
  it('renders the squad, pause, slow lane and steer controls', () => {
    render(<HavenRushScreen {...props()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Haven Rush');
    expect(screen.getByTestId('gate-runner-squad')).toHaveTextContent(/Squad \d+/);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slow lane' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Right' })).toBeInTheDocument();
  });

  it('writes French chrome when the locale is fr', () => {
    render(<HavenRushScreen {...props({ locale: 'fr' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ruée du Haven');
    expect(screen.getByRole('button', { name: 'Gauche' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abandonner' })).toBeInTheDocument();
  });

  it('Forfeit ends as fled; Leave calls onExit; Pause toggles', () => {
    const p = props();
    render(<HavenRushScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled' });
    expect(screen.getByRole('status')).toHaveTextContent(/troops step back/i);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });
});

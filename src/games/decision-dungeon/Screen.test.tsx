/**
 * The Screen plays the engine's game: clicking through it gives the outcome
 * the engine computes, onFinish fires once, and the log is in the player's language.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine } from './engine';
import DecisionDungeonScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

function playFirstDoors(): number {
  let clicks = 0;
  while (clicks < 20) {
    const door = screen.queryByRole('button', { name: /Door 1|Porte 1/ });
    const next = screen.queryByRole('button', { name: /Next room|Salle suivante/ });
    if (door) fireEvent.click(door);
    else if (next) fireEvent.click(next);
    else break;
    clicks += 1;
  }
  return clicks;
}

describe('Decision Dungeon screen', () => {
  it('plays to the outcome the engine computes, and calls onFinish once', () => {
    const p = props();
    render(<DecisionDungeonScreen {...p} />);
    playFirstDoors();
    let s = engine.initial(42, parties.full, runs.plain, 'en');
    while (!engine.outcome(s)) {
      const door = s.phase === 'choose' ? { type: 'choose' as const, index: 0 } : { type: 'continue' as const };
      s = engine.reduce(s, door);
    }
    const expected = engine.outcome(s);

    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect({ ...got, durationMs: undefined }).toEqual({ ...expected, durationMs: undefined });
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole('status')).toHaveTextContent(/troops come home/i);
  });

  it('writes the outcome log in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<DecisionDungeonScreen {...p} />);
    playFirstDoors();
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/^Salle 1/);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Donjon des choix');
  });

  it('number keys choose doors; Step away ends as fled; Leave calls onExit', () => {
    const p = props();
    render(<DecisionDungeonScreen {...p} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('decision-dungeon-reflection')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled' });
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });
});

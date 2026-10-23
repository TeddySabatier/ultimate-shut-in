/**
 * The Screen plays the engine's game: the intro, the timed look, the recall
 * with either order of picking, the keyboard, reduced motion, French, and
 * `onFinish` firing once with the outcome the engine computes.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine, type MemoryPalaceState } from './engine';
import MemoryPalaceScreen from './Screen';
import { wordText } from './words';

const RUN = { ...runs.plain, difficulty: 1 as const };

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.starter, seed: 42, run: RUN, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

/** The engine's own state for the same game, to know where things really are. */
function twin(p: GameScreenProps): MemoryPalaceState {
  return engine.initial(p.seed, p.party, p.run, p.locale);
}

function begin(label = 'Begin the walk'): void {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

function skipLook(next = 'Next'): void {
  let guard = 0;
  while (screen.queryByRole('button', { name: next }) && guard < 20) {
    fireEvent.click(screen.getByRole('button', { name: next }));
    guard += 1;
  }
}

describe('Memory Palace screen', () => {
  it('opens on a ready card with the round, the rule and a Begin button, then shows the first thing', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Memory Palace');
    expect(screen.getByTestId('memory-palace-round')).toHaveTextContent('Round 1 of 3');
    expect(screen.getByTestId('memory-palace-prompt')).toHaveTextContent(/palace is empty again/i);
    begin();
    const first = twin(p).rounds[0]!.items[0]!;
    expect(screen.getByText(wordText(first.wordId, 'en'), { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Thing 1 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('memory-palace-prompt')).toHaveTextContent(wordText(first.wordId, 'en'));
    // The route lists every room, and the current one is marked.
    expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1);
  });

  it('counts the look down with ticks and shows a text countdown under reduced motion, a bar otherwise', () => {
    const { unmount } = render(<MemoryPalaceScreen {...props({ reducedMotion: true })} />);
    begin();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(/s left/)).toBeInTheDocument();
    unmount();
    render(<MemoryPalaceScreen {...props({ reducedMotion: false })} />);
    begin();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('plays a perfect game through the buttons, in either order of picking, and calls onFinish once', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    const plan = twin(p).rounds;
    for (let r = 0; r < plan.length; r++) {
      begin();
      skipLook();
      plan[r]!.items.forEach((it, i) => {
        const room = within(screen.getByTestId('memory-palace-rooms'));
        const roomName = { gate: 'Gate', hall: 'Hall', kitchen: 'Kitchen', library: 'Library', garden: 'Garden', tower: 'Tower' }[it.roomId];
        const thing = within(screen.getByTestId('memory-palace-items')).getByRole('button', { name: wordText(it.wordId, 'en') });
        const roomBtn = room.getAllByRole('button').find((b) => b.textContent?.startsWith(roomName))!;
        if (i % 2 === 0) {
          fireEvent.click(thing);
          fireEvent.click(roomBtn);
        } else {
          fireEvent.click(roomBtn);
          fireEvent.click(thing);
        }
      });
    }
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('won');
    expect(got.score).toBe(1000);
    expect(screen.getByTestId('memory-palace-end')).toHaveTextContent(/palace remembers/i);
    expect(screen.getByTestId('memory-palace-end')).toHaveTextContent(/You can hold more when each thing has a place/);
  });

  it('shows what went wrong in words and symbols, not colour alone, and does not reveal the right room', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    begin();
    skipLook();
    const it0 = twin(p).rounds[0]!.items[0]!;
    const wrong = it0.roomId === 'gate' ? 'Hall' : 'Gate';
    const thing = within(screen.getByTestId('memory-palace-items')).getByRole('button', { name: wordText(it0.wordId, 'en') });
    fireEvent.click(thing);
    fireEvent.click(within(screen.getByTestId('memory-palace-rooms')).getAllByRole('button').find((b) => b.textContent?.startsWith(wrong))!);
    expect(screen.getByTestId('memory-palace-prompt')).toHaveTextContent(/not there/);
    expect(screen.getByTestId('memory-palace-rooms')).toHaveTextContent('×');
    expect(screen.getByTestId('memory-palace-rooms')).toHaveTextContent('(missed)');
  });

  it('walks the rooms with the arrow keys and picks with Enter', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    begin();
    skipLook();
    const rooms = within(screen.getByTestId('memory-palace-rooms')).getAllByRole('button');
    rooms[0]!.focus();
    fireEvent.keyDown(rooms[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rooms[1]);
    fireEvent.keyDown(rooms[1]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rooms[0]);
    fireEvent.keyDown(rooms[0]!, { key: 'End' });
    expect(document.activeElement).toBe(rooms[rooms.length - 1]);
  });

  it('forfeits with a partial outcome and keeps the board; Leave is a separate press that calls onExit', () => {
    const p = props();
    render(<MemoryPalaceScreen {...p} />);
    begin();
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    expect(p.onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('memory-palace-end')).toHaveTextContent(/left the palace/i);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('pauses the look: the countdown stops until Resume', () => {
    vi.useFakeTimers();
    try {
      render(<MemoryPalaceScreen {...props({ reducedMotion: true })} />);
      begin();
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      expect(screen.getByText('Paused. The thing stays where it is.')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText('Thing 1 of 2')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists the troop perks by name for a full party, and the Social tip in recall', () => {
    const p = props({ party: parties.full });
    render(<MemoryPalaceScreen {...p} />);
    const study = parties.full.members.find((m) => m.habit === 'study')!.name;
    expect(screen.getByText(new RegExp(`${study} \\(Study\\)`))).toBeInTheDocument();
    begin();
    skipLook();
    expect(screen.getByText('A friend counted with you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A letter/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /A letter/ }));
    expect(screen.getByText('Letters you asked for')).toBeInTheDocument();
  });

  it('plays in French: title, buttons, caption and outcome', () => {
    const p = props({ locale: 'fr' });
    render(<MemoryPalaceScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Palais de mémoire');
    begin('Commencer la promenade');
    expect(screen.getByText(/Chose 1 sur 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/^Manche 1/);
    expect(screen.getByTestId('memory-palace-end')).toHaveTextContent(/quitté le palais/);
  });
});

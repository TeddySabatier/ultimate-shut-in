/**
 * The Screen plays the engine's game: a move matches the engine, Forfeit
 * ends as fled, Leave calls onExit, and French copy is used when asked.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine, legalMoves, livingPieces } from './engine';
import RoguelikeChessScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

describe('Roguelike Chess screen', () => {
  it('selects a piece and plays a legal square, matching the engine', () => {
    const p = props();
    render(<RoguelikeChessScreen {...p} />);
    const state = engine.initial(42, parties.full, runs.plain, 'en');
    const piece = livingPieces(state)[0]!;
    const dest = legalMoves(state, piece)[0]!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${piece.name} ·`) }));
    const file = 'abcdef'.charAt(dest.x);
    const cell = screen.getAllByRole('gridcell').find((el) => el.getAttribute('data-file') === file && el.getAttribute('data-rank') === String(dest.y + 1));
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);
    const expected = engine.reduce(state, { type: 'play', id: piece.id, x: dest.x, y: dest.y });
    expect(screen.getByTestId('roguelike-chess-log').textContent).toBe(expected.log.at(-1));
    expect(p.onFinish).not.toHaveBeenCalled();
  });

  it('writes French chrome when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<RoguelikeChessScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Échecs vagabonds');
    expect(screen.getByRole('button', { name: 'Abandonner' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitter' })).toBeTruthy();
  });

  it('Forfeit ends as fled; Leave calls onExit', () => {
    const p = props();
    render(<RoguelikeChessScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome).toMatchObject({ result: 'fled' });
    expect(screen.getByRole('status')).toHaveTextContent(/stepped away/i);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });
});

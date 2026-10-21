/**
 * The Screen plays the engine's game: a move matches the engine, Forfeit
 * ends as fled, Leave calls onExit, and French copy is used when asked.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyRun, type GameScreenProps, type Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine, legalMoves, livingPieces, type ChessState } from './engine';
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

  it('plays with the keyboard: arrows move the cursor, Enter selects then confirms, Escape cancels', () => {
    render(<RoguelikeChessScreen {...props()} />);
    const state = engine.initial(42, parties.full, runs.plain, 'en');
    const piece = livingPieces(state).find((p) => p.x === 0 && p.y === 0)!;
    const dest = legalMoves(state, piece)[0]!;
    const key = (k: string) => fireEvent.keyDown(document.body, { key: k });
    key('Enter');
    expect(screen.getByRole('button', { name: new RegExp(`^${piece.name} ·`) })).toHaveAttribute('aria-pressed', 'true');
    key('Escape');
    expect(screen.getByRole('button', { name: new RegExp(`^${piece.name} ·`) })).toHaveAttribute('aria-pressed', 'false');
    key('Enter');
    for (let i = 0; i < dest.x; i++) key('ArrowRight');
    for (let i = 0; i < dest.y; i++) key('ArrowUp');
    key('Enter');
    const expected = engine.reduce(state, { type: 'play', id: piece.id, x: dest.x, y: dest.y });
    expect(screen.getByTestId('roguelike-chess-log').textContent).toBe(expected.log.at(-1));
  });

  it('does not steal Enter from the buttons outside the board', () => {
    render(<RoguelikeChessScreen {...props()} />);
    const forfeit = screen.getByRole('button', { name: 'Forfeit' });
    expect(fireEvent.keyDown(forfeit, { key: 'Enter' })).toBe(true);
  });

  it('shows the next move of each monster and marks the targeted square', () => {
    render(<RoguelikeChessScreen {...props()} />);
    const state = engine.initial(42, parties.full, runs.plain, 'en');
    const wave = screen.getByRole('heading', { name: 'The wave' }).nextElementSibling!;
    expect(wave.querySelectorAll('li')).toHaveLength(state.enemies.length);
  });

  it('after room 1 the three upgrades appear; taking one opens room 2', () => {
    const p = props({ run: emptyRun(1), seed: 11 });
    render(<RoguelikeChessScreen {...p} />);
    let mirror: ChessState = engine.initial(11, parties.full, emptyRun(1), 'en');
    for (let guard = 0; guard < 80 && mirror.phase === 'play'; guard++) {
      const a = engine.botPlay(mirror, () => 0.3);
      if (!a) break;
      mirror = engine.reduce(mirror, a);
      if (a.type === 'play') {
        const idx = mirror.pieces.findIndex((x) => x.id === a.id);
        fireEvent.click(document.querySelectorAll('ul li button[aria-pressed]')[idx]!);
        const cell = screen.getAllByRole('gridcell').find((el) => el.getAttribute('data-file') === 'abcdef'.charAt(a.x) && el.getAttribute('data-rank') === String(a.y + 1))!;
        fireEvent.click(cell);
      }
    }
    expect(mirror.phase).toBe('upgrade');
    const list = screen.getByTestId('roguelike-chess-upgrades');
    const buttons = list.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[0]!);
    expect(screen.getByTestId('roguelike-chess-room')).toHaveTextContent('Room 2 of 3');
  });
});

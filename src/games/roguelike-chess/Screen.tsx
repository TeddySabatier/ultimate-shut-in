/**
 * Roguelike Chess Screen: a 6x6 board, touch and keyboard, one piece per turn.
 *
 * Selection lives in the Screen; the engine only sees `play` / `upgrade` /
 * `wait` / `forfeit`. Leave is a separate button that calls `exit()`.
 */
import { useEffect, useMemo, useState } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import {
  BOARD,
  engine,
  hintCapture,
  isOver,
  legalMoves,
  livingEnemies,
  livingPieces,
  occupant,
  squareFile,
  type ChessAction,
  type ChessState,
  type PieceKind,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

const PIECE_GLYPH: Record<PieceKind, string> = {
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queenLite: 'Q',
  king: 'K',
  pawn: 'P',
  rookLite: 'r',
  bishopLite: 'b',
};

const ENEMY_GLYPH: Record<string, string> = {
  blob: 'o',
  moth: 'm',
  wyrm: 'w',
  bunny: 'u',
  golem: 'g',
  leech: 'e',
  wraith: 'f',
  imp: 'i',
  specter: 's',
  static: 'Z',
};

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export default function RoguelikeChessScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const t = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const over = isOver(state);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const legalSet = useMemo(() => {
    const piece = state.pieces.find((p) => p.id === selectedId && p.alive);
    if (!piece || state.phase !== 'play' || isOver(state)) return new Set<string>();
    return new Set(legalMoves(state, piece).map((p) => cellKey(p.x, p.y)));
  }, [state, selectedId]);
  const hint = hintCapture(state);
  const hintKey = hint ? cellKey(hint.x, hint.y) : '';

  const intents = new Map<string, string>();
  if (state.phase === 'play' && !over) {
    for (const e of livingEnemies(state)) {
      if (e.intentVerb === 'wait') continue;
      intents.set(cellKey(e.intentX, e.intentY), t.verb[e.intentVerb]);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
        return;
      }
      if (over || state.phase !== 'play') return;
      let nx = cursor.x;
      let ny = cursor.y;
      if (e.key === 'ArrowLeft') nx -= 1;
      else if (e.key === 'ArrowRight') nx += 1;
      else if (e.key === 'ArrowDown') ny -= 1;
      else if (e.key === 'ArrowUp') ny += 1;
      else if (e.key === 'Enter') {
        e.preventDefault();
        clickCell(state, dispatch, selectedId, setSelectedId, cursor.x, cursor.y, legalSet);
        return;
      } else return;
      e.preventDefault();
      setCursor({ x: Math.max(0, Math.min(BOARD - 1, nx)), y: Math.max(0, Math.min(BOARD - 1, ny)) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, state, selectedId, cursor, legalSet, dispatch]);

  const endText = outcome ? t.end[outcome.result] : null;
  const alive = livingPieces(state).length;

  return (
    <SystemWindow
      className={cx(styles.wrap, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : outcome?.result === 'lost' ? 'danger' : 'default'}
      actions={
        <>
          {over ? null : (
            <button type="button" className="btn btn--danger" onClick={() => dispatch({ type: 'forfeit' })}>
              {t.forfeit}
            </button>
          )}
          <button type="button" className="btn" onClick={exit}>
            {t.leave}
          </button>
        </>
      }
    >
      <p className={styles.intro}>{t.intro}</p>

      <p className={styles.status} data-testid="roguelike-chess-status">
        <span className="mono" data-testid="roguelike-chess-room">
          {formatText(t.room, { n: state.room })}
        </span>
        <span className="mono">{formatText(t.turn, { n: state.turnInRoom, cap: state.turnCap })}</span>
        <span className="mono">{formatText(t.piecesAlive, { n: alive })}</span>
      </p>

      <p className={styles.prompt}>
        {state.phase === 'upgrade' ? t.upgradePrompt : state.extraMoveId ? formatText(t.extraPrompt, { name: state.pieces.find((p) => p.id === state.extraMoveId)?.name ?? '' }) : t.selectPrompt}
      </p>

      <div className={styles.layout}>
        <div
          className={styles.board}
          role="grid"
          aria-label={game.manifest.name[locale]}
          data-testid="roguelike-chess-board"
          data-enemy-count={livingEnemies(state).length}
        >
          {Array.from({ length: BOARD }, (_, row) => {
            const y = BOARD - 1 - row;
            return (
              <div key={y} className={styles.rank} role="row">
                {Array.from({ length: BOARD }, (__, x) => {
                  const occ = occupant(state, x, y);
                  const piece = occ?.side === 'ally' ? state.pieces.find((p) => p.id === occ.id) : undefined;
                  const enemy = occ?.side === 'foe' ? state.enemies.find((en) => en.id === occ.id) : undefined;
                  const key = cellKey(x, y);
                  const isLegal = legalSet.has(key);
                  const isSelected = piece && piece.id === selectedId;
                  const intent = intents.get(key);
                  const isHint = hintKey === key;
                  const isCursor = cursor.x === x && cursor.y === y;
                  const file = squareFile(x);
                  const rank = y + 1;
                  let label = formatText(t.empty, { file, rank });
                  if (piece) label = formatText(t.cellPiece, { name: piece.name, kind: t.kind[piece.kind], hp: piece.hp, max: piece.maxHp, file, rank });
                  if (enemy) label = formatText(t.cellEnemy, { name: t.enemy[enemy.kind], hp: enemy.hp, max: enemy.maxHp, verb: t.verb[enemy.intentVerb] });
                  if (isLegal) label = `${label}. ${t.legal}`;
                  if (isHint) label = `${label}. ${t.hintCapture}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      className={cx('btn', styles.cell, isSelected && styles.selected, isLegal && styles.legal, isHint && styles.hint, isCursor && styles.cursor)}
                      aria-label={label}
                      aria-current={isCursor ? 'true' : undefined}
                      data-file={file}
                      data-rank={rank}
                      disabled={over || state.phase === 'upgrade'}
                      onClick={() => clickCell(state, dispatch, selectedId, setSelectedId, x, y, legalSet)}
                    >
                      <span className={styles.glyph} aria-hidden="true">
                        {piece ? PIECE_GLYPH[piece.kind] : enemy ? (ENEMY_GLYPH[enemy.kind] ?? '?') : ''}
                      </span>
                      <span className={styles.hp} aria-hidden="true">
                        {piece ? piece.hp : enemy ? enemy.hp : ''}
                      </span>
                      {intent ? (
                        <span className={styles.intent} title={formatText(t.intent, { verb: intent })}>
                          !
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className={styles.side}>
          {state.phase === 'upgrade' && !over ? (
            <div className={styles.upgrades} data-testid="roguelike-chess-upgrades">
              <h3 className={styles.subtitle}>{t.upgradesTitle}</h3>
              <ul className={styles.upgradeList}>
                {state.offers.map((offer, i) => {
                  const target = state.pieces.find((p) => p.id === offer.targetId);
                  const other = state.pieces.find((p) => p.id === offer.secondId);
                  const pack = t.upgrade[offer.kind];
                  return (
                    <li key={`${offer.kind}-${i}`}>
                      <button type="button" className={cx('btn', styles.upgrade)} onClick={() => dispatch({ type: 'upgrade', index: i })}>
                        <span className={styles.upgradeName}>{formatText(t.pickUpgrade, { name: pack.name })}</span>
                        <span className={styles.upgradeDesc}>{formatText(pack.desc, { name: target?.name ?? pack.name, other: other?.name ?? pack.name })}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <>
              <h3 className={styles.subtitle}>{t.rosterTitle}</h3>
              <ul className={styles.roster}>
                {state.pieces.map((p) => (
                  <li key={p.id} className={cx(styles.rosterItem, !p.alive && styles.fallen)}>
                    <button
                      type="button"
                      className={cx('btn', styles.rosterBtn, selectedId === p.id && styles.selected)}
                      disabled={!p.alive || over || state.phase !== 'play'}
                      onClick={() => {
                        setSelectedId(p.id);
                        setCursor({ x: p.x, y: p.y });
                      }}
                    >
                      <span>
                        {p.name} · {t.kind[p.kind]}
                      </span>
                      <span className="mono">
                        {formatText(t.hp, { hp: p.hp, max: p.maxHp })} {formatText(t.atk, { n: p.attack })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className={styles.subtitle}>{t.logTitle}</h3>
          <p className={styles.log} aria-live="polite" data-testid="roguelike-chess-log">
            {state.log.at(-1) ?? t.selectPrompt}
          </p>
        </div>
      </div>

      {endText ? (
        <p className={styles.banner} role="status" data-result={outcome?.result}>
          {endText}
        </p>
      ) : null}
    </SystemWindow>
  );
}

function clickCell(
  state: ChessState,
  dispatch: (action: ChessAction) => void,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  x: number,
  y: number,
  legalSet: Set<string>,
): void {
  if (isOver(state) || state.phase !== 'play') return;
  const occ = occupant(state, x, y);
  const key = cellKey(x, y);
  if (selectedId && legalSet.has(key)) {
    dispatch({ type: 'play', id: selectedId, x, y });
    setSelectedId(null);
    return;
  }
  if (occ?.side === 'ally') {
    setSelectedId(occ.id);
    return;
  }
  setSelectedId(null);
}

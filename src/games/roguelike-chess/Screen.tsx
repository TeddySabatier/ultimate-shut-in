/**
 * Roguelike Chess Screen: a 6x6 board, touch, mouse and keyboard, one piece per turn.
 *
 * Selection and the cursor live in the Screen; the engine only sees `play` /
 * `upgrade` / `wait` / `forfeit`. Leave is a separate button that calls `exit()`.
 * Keyboard: arrows move the cursor over the board (the cursor square holds
 * focus), Enter selects or confirms, Escape cancels. Enter on any other control
 * keeps its own meaning.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { EnemyGlyph, IntentMark, PieceGlyph } from './Glyphs';
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
  type Enemy,
} from './engine';
import game from './manifest';
import { strings, type ChessStrings } from './strings';
import styles from './Screen.module.css';

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function inBoard(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-board]') !== null;
}

function isBody(target: EventTarget | null): boolean {
  return target === document.body || target === document.documentElement || target === null;
}

/** What a monster will do next, in words. */
function nextText(state: ChessState, e: Enemy, t: ChessStrings): string {
  const verb = e.intentVerb;
  const file = squareFile(e.intentX);
  const rank = e.intentY + 1;
  const name = state.pieces.find((p) => p.alive && p.x === e.intentX && p.y === e.intentY)?.name ?? '';
  return formatText(t.next[verb], { file, rank, name });
}

export default function RoguelikeChessScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const t = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const over = isOver(state);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusCursor = useRef(false);
  const upgradesRef = useRef<HTMLUListElement | null>(null);

  const legalSet = useMemo(() => {
    const piece = state.pieces.find((p) => p.id === selectedId && p.alive);
    if (!piece || state.phase !== 'play' || isOver(state)) return new Set<string>();
    return new Set(legalMoves(state, piece).map((p) => cellKey(p.x, p.y)));
  }, [state, selectedId]);
  const hint = hintCapture(state);
  const hintKey = hint ? cellKey(hint.x, hint.y) : '';

  const playing = state.phase === 'play' && !over;
  const intents = new Map<string, Enemy>();
  if (playing) {
    for (const e of livingEnemies(state)) {
      if (e.intentVerb === 'wait') continue;
      const k = cellKey(e.intentX, e.intentY);
      if (!intents.has(k)) intents.set(k, e);
    }
  }

  // After an arrow key, the cursor square takes focus so a screen reader reads it.
  useEffect(() => {
    if (!focusCursor.current) return;
    focusCursor.current = false;
    cellRefs.current[cellKey(cursor.x, cursor.y)]?.focus();
  }, [cursor]);

  // When the upgrade cards appear, focus the first one so the keyboard continues from there.
  useEffect(() => {
    if (state.phase === 'upgrade' && !over) upgradesRef.current?.querySelector('button')?.focus();
  }, [state.phase, state.room, over]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onBoard = inBoard(e.target);
      if (!onBoard && !isBody(e.target)) return;
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if (!playing) return;
      let nx = cursor.x;
      let ny = cursor.y;
      if (e.key === 'ArrowLeft') nx -= 1;
      else if (e.key === 'ArrowRight') nx += 1;
      else if (e.key === 'ArrowDown') ny -= 1;
      else if (e.key === 'ArrowUp') ny += 1;
      else if (e.key === 'Enter' && !onBoard) {
        e.preventDefault();
        clickCell(state, dispatch, selectedId, setSelectedId, cursor.x, cursor.y, legalSet);
        return;
      } else return;
      e.preventDefault();
      focusCursor.current = true;
      setCursor({ x: Math.max(0, Math.min(BOARD - 1, nx)), y: Math.max(0, Math.min(BOARD - 1, ny)) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, state, selectedId, cursor, legalSet, dispatch]);

  const endText = outcome ? t.end[outcome.result] : null;
  const alive = livingPieces(state).length;
  const promptText =
    state.phase === 'upgrade'
      ? t.upgradePrompt
      : state.extraMoveId
        ? formatText(t.extraPrompt, { name: state.pieces.find((p) => p.id === state.extraMoveId)?.name ?? '' })
        : t.selectPrompt;
  const recent = state.log.slice(-3);

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

      <p className={styles.prompt}>{promptText}</p>

      <div className={styles.layout}>
        <div
          className={cx(styles.board, state.phase === 'upgrade' && styles.boardQuiet)}
          role="grid"
          aria-label={game.manifest.name[locale]}
          data-testid="roguelike-chess-board"
          data-board=""
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
                  const threatened = Boolean(piece && intent);
                  const file = squareFile(x);
                  const rank = y + 1;
                  let label = formatText(t.empty, { file, rank });
                  if (piece) label = formatText(t.cellPiece, { name: piece.name, kind: t.kind[piece.kind], hp: piece.hp, max: piece.maxHp, file, rank });
                  if (enemy) label = formatText(t.cellEnemy, { name: t.enemy[enemy.kind], hp: enemy.hp, max: enemy.maxHp, verb: t.verb[enemy.intentVerb] });
                  if (intent) label = `${label}. ${t.enemy[intent.kind]}: ${nextText(state, intent, t)}`;
                  if (isLegal) label = `${label}. ${t.legal}`;
                  if (isHint) label = `${label}. ${t.hintCapture}`;
                  const unit = piece ?? enemy;
                  return (
                    <button
                      key={key}
                      ref={(el) => {
                        cellRefs.current[key] = el;
                      }}
                      type="button"
                      role="gridcell"
                      className={cx(
                        'btn',
                        styles.cell,
                        (x + y) % 2 === 1 && styles.light,
                        isSelected && styles.selected,
                        isLegal && styles.legal,
                        isLegal && enemy && styles.capture,
                        isHint && styles.hint,
                        isCursor && styles.cursor,
                        threatened && styles.threat,
                      )}
                      aria-label={label}
                      aria-current={isCursor ? 'true' : undefined}
                      tabIndex={isCursor ? 0 : -1}
                      data-file={file}
                      data-rank={rank}
                      disabled={over || state.phase === 'upgrade'}
                      onClick={() => {
                        setCursor({ x, y });
                        clickCell(state, dispatch, selectedId, setSelectedId, x, y, legalSet);
                      }}
                    >
                      {piece ? (
                        <span className={styles.glyph}>
                          <PieceGlyph kind={piece.kind} />
                        </span>
                      ) : enemy ? (
                        <span className={styles.glyph}>
                          <EnemyGlyph kind={enemy.kind} />
                        </span>
                      ) : null}
                      {unit ? (
                        <span className={cx(styles.bar, enemy && styles.barFoe)} aria-hidden="true">
                          <span style={{ width: `${Math.max(8, Math.round((unit.hp / unit.maxHp) * 100))}%` }} />
                        </span>
                      ) : null}
                      {unit ? (
                        <span className={styles.hp} aria-hidden="true">
                          {unit.hp}
                        </span>
                      ) : null}
                      {intent ? (
                        <span className={styles.intent} aria-hidden="true">
                          <IntentMark verb={intent.intentVerb} />
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
              <ul className={styles.upgradeList} ref={upgradesRef}>
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
                      aria-pressed={selectedId === p.id}
                      onClick={() => {
                        setSelectedId(p.id);
                        setCursor({ x: p.x, y: p.y });
                      }}
                    >
                      <span className={styles.rosterIcon}>
                        <PieceGlyph kind={p.kind} fallen={!p.alive} />
                      </span>
                      <span className={styles.rosterText}>
                        <span className={styles.rosterName}>
                          {p.name} · {t.kind[p.kind]}
                        </span>
                        <span className={cx('mono', styles.rosterStats)}>
                          {p.alive ? `${formatText(t.hp, { hp: p.hp, max: p.maxHp })} ${formatText(t.atk, { n: p.attack })}${p.shield > 0 ? ` ${formatText(t.shield, { n: p.shield })}` : ''}` : t.down}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {playing ? (
                <>
                  <h3 className={styles.subtitle}>{t.waveTitle}</h3>
                  <ul className={styles.wave}>
                    {livingEnemies(state).map((e) => (
                      <li key={e.id} className={styles.waveItem}>
                        <span className={styles.waveIcon}>
                          <EnemyGlyph kind={e.kind} />
                        </span>
                        <span className={styles.waveText}>
                          {t.enemy[e.kind]} <span className="mono">{e.hp}/{e.maxHp}</span>: {nextText(state, e, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}

          <h3 className={styles.subtitle}>{t.logTitle}</h3>
          <div className={styles.log} aria-live="polite" data-testid="roguelike-chess-log-box">
            {recent.length === 0 ? <p>{t.selectPrompt}</p> : null}
            {recent.map((line, i) => (
              <p key={`${state.step}-${i}`} data-testid={i === recent.length - 1 ? 'roguelike-chess-log' : undefined} className={i === recent.length - 1 ? undefined : styles.older}>
                {line}
              </p>
            ))}
          </div>
          <p className={styles.legend}>{t.legend}</p>
        </div>
      </div>

      {endText ? (
        <div className={styles.banner} role="status" data-result={outcome?.result}>
          <p className={styles.bannerTitle}>{endText}</p>
          <p className={styles.bannerSub}>{formatText(t.summary, { rooms: state.roomsCleared, turns: state.totalTurns, n: alive })}</p>
        </div>
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

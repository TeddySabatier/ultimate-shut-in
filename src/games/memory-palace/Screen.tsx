/**
 * Memory Palace Screen: six illustrated rooms, a timed look at each thing in
 * its room, then a recall where every thing goes back to its room. Touch,
 * mouse and keyboard all work (pick a thing and a room in either order;
 * dragging a thing onto a room is an extra). State comes only from the engine
 * through `useEngine`; the look is driven by `tick` actions.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Meter } from '../../components/Meter';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  ROOM_IDS,
  ROUND_COUNT,
  captionText,
  capitalise,
  currentItem,
  currentPlay,
  currentRound,
  engine,
  isOver,
  promptText,
  remainingChoices,
  roomAtText,
  roomCounts,
  secondsLeft,
  tally,
  tipIndex,
  type MemoryPalaceState,
  type RoomId,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import { wordText } from './words';
import styles from './Screen.module.css';

/** The six scenes: one distinctive silhouette each, readable at 80 px wide. Outline in the accent, details in amber. */
function RoomArt({ room, className }: { room: RoomId; className?: string | undefined }) {
  return (
    <svg className={cx(styles.art, className)} viewBox="0 0 96 56" aria-hidden="true" focusable="false">
      <path className={styles.ground} d="M2 52 H94" />
      {room === 'gate' ? (
        <>
          <path className={styles.line} d="M10 52 V20 H20 V52 M76 52 V20 H86 V52" />
          <path className={styles.line} d="M20 52 V28 A28 20 0 0 1 76 28 V52" />
          <path className={styles.thin} d="M30 52 V22 M40 52 V16 M48 52 V14 M56 52 V16 M66 52 V22" />
          <path className={styles.thin} d="M48 4 V10" />
          <rect className={styles.gold} x="44" y="10" width="8" height="9" />
        </>
      ) : null}
      {room === 'hall' ? (
        <>
          <path className={styles.line} d="M6 10 H90" />
          <path className={styles.line} d="M12 10 V52 M32 10 V52 M64 10 V52 M84 10 V52" />
          <path className={styles.thin} d="M48 10 V18" />
          <path className={styles.line} d="M40 18 H56 L52 26 H44 Z" />
          <circle className={styles.goldDot} cx="40" cy="30" r="2" />
          <circle className={styles.goldDot} cx="56" cy="30" r="2" />
          <circle className={styles.goldDot} cx="48" cy="33" r="2" />
          <path className={styles.thin} d="M20 46 H76 M28 52 L32 46 M48 52 V46 M68 52 L64 46" />
        </>
      ) : null}
      {room === 'kitchen' ? (
        <>
          <path className={styles.line} d="M8 52 V18 H48 V52" />
          <path className={styles.gold} d="M20 52 C14 44 22 40 22 34 C28 40 34 44 28 52 Z" />
          <path className={styles.thin} d="M28 18 V8 M18 8 H38" />
          <path className={styles.line} d="M16 20 H40" />
          <circle className={styles.line} cx="64" cy="22" r="7" />
          <path className={styles.thin} d="M71 22 H80 M64 29 V35" />
          <path className={styles.line} d="M56 44 H90 M60 44 V52 M86 44 V52" />
          <path className={styles.line} d="M66 44 V38 H80 V44" />
        </>
      ) : null}
      {room === 'library' ? (
        <>
          <path className={styles.line} d="M6 6 H90 V52 H6 Z" />
          <path className={styles.thin} d="M6 20 H90 M6 36 H90" />
          <path className={styles.solid} d="M10 20 V10 H16 V20 Z M18 20 V8 H22 V20 Z M24 20 V12 H32 V20 Z M56 20 V9 H62 V20 Z M64 20 V12 H68 V20 Z" />
          <path className={styles.gold} d="M12 36 V26 H18 V36 Z M20 36 V24 H26 V36 Z M50 36 V28 H58 V36 Z" />
          <path className={styles.solid} d="M30 52 V42 H42 V52 Z M60 52 V44 H72 V52 Z M74 52 V40 H80 V52 Z" />
          <path className={styles.line} d="M86 4 L74 52" />
        </>
      ) : null}
      {room === 'garden' ? (
        <>
          <circle className={styles.line} cx="22" cy="20" r="14" />
          <path className={styles.line} d="M22 34 V52" />
          <circle className={styles.goldDot} cx="16" cy="18" r="2.5" />
          <circle className={styles.goldDot} cx="27" cy="23" r="2.5" />
          <path className={styles.line} d="M54 52 H88 M60 52 L62 42 H80 L82 52" />
          <path className={styles.thin} d="M71 42 V26 M71 26 C62 26 60 34 62 36 M71 26 C80 26 82 34 80 36" />
          <path className={styles.gold} d="M40 52 V44 M44 52 V40 M48 52 V46" />
        </>
      ) : null}
      {room === 'tower' ? (
        <>
          <path className={styles.line} d="M30 52 V14 H26 V8 H34 V12 H44 V8 H52 V12 H62 V8 H70 V14 H66 V52" />
          <path className={styles.line} d="M42 52 V42 A6 6 0 0 1 54 42 V52" />
          <path className={styles.thin} d="M42 28 V22 A6 6 0 0 1 54 22 V28 Z" />
          <path className={styles.thin} d="M48 8 V0 M48 0 H58 L54 3 L58 6 H48" />
          <circle className={styles.goldDot} cx="82" cy="14" r="5" />
          <path className={styles.thin} d="M8 52 L20 44 L30 52" />
        </>
      ) : null}
    </svg>
  );
}

function lastPlacement(state: MemoryPalaceState) {
  const play = currentPlay(state);
  return play && play.placements.length > 0 ? play.placements[play.placements.length - 1]! : null;
}

export default function MemoryPalaceScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [paused, setPaused] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomId | null>(null);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const over = isOver(state);
  const round = currentRound(state);
  const play = currentPlay(state);
  const looking = currentItem(state);
  const { correct, total } = tally(state);
  const placedCount = play?.placements.length ?? 0;
  const memberName = (id: string) => props.party.members.find((m) => m.id === id)?.name ?? '';

  useFixedStep(() => dispatch({ type: 'tick' }), { running: state.phase === 'memorise' && !paused && !over });

  // Keep the keyboard where the action is: the primary button of each phase, and the next thing after a placement.
  useEffect(() => {
    const root = stageRef.current;
    if (!root || over) return;
    const active = document.activeElement;
    const focusLost = !active || active === document.body || !root.contains(active);
    if (!focusLost && state.phase !== 'intro') return;
    const target = root.querySelector<HTMLElement>('[data-primary]');
    if (target && (focusLost || state.phase === 'intro')) target.focus({ preventScroll: true });
  }, [state.phase, state.roundIndex, placedCount, over]);

  const place = (wordId: number, roomId: RoomId) => {
    dispatch({ type: 'place', wordId, roomId });
    setSelectedRoom(null);
    setSelectedItem(null);
  };
  const pickRoom = (roomId: RoomId) => {
    if (selectedItem !== null) place(selectedItem, roomId);
    else setSelectedRoom((cur) => (cur === roomId ? null : roomId));
  };
  const pickItem = (wordId: number) => {
    if (selectedRoom !== null) place(wordId, selectedRoom);
    else setSelectedItem((cur) => (cur === wordId ? null : wordId));
  };

  // Arrow keys walk the rooms (focus only; Enter or Space picks).
  const onRoomKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    // Columns as laid out right now: the buttons that share the first row.
    const cols = Math.max(1, buttons.filter((b) => b.offsetTop === buttons[0]!.offsetTop).length);
    const to =
      e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowDown' ? at + cols : e.key === 'ArrowUp' ? at - cols : e.key === 'Home' ? 0 : buttons.length - 1;
    buttons[(to + buttons.length) % buttons.length]?.focus();
  };

  // What the live region says right now.
  const placement = lastPlacement(state);
  let live: string;
  if (outcome) live = `${s.end[outcome.result]}. ${formatText(s.endScore, { score: outcome.score })}`;
  else if (state.phase === 'intro') live = `${formatText(s.introRound, { n: state.roundIndex + 1, total: ROUND_COUNT })}. ${formatText(s.introBody, { count: round?.items.length ?? 0 })}`;
  else if (state.phase === 'memorise' && looking) live = promptText(state, looking, s);
  else if (selectedItem !== null) live = formatText(s.selectedItem, { item: wordText(selectedItem, locale) });
  else if (selectedRoom !== null) live = formatText(s.selectedRoom, { room: s.roomAt[selectedRoom] });
  else if (placement) {
    const room = s.roomAt[placement.roomId];
    const item = wordText(placement.wordId, locale);
    live = formatText(placement.correct ? s.placed : s.placedWrong, { item, room });
    if (!placement.correct && round && !round.items.some((it) => it.wordId === placement.wordId)) live = `${live} ${formatText(s.placedNever, { item })}`;
  } else live = s.nothingChosen;

  const maxTicks = state.displayTicksByRound[state.roundIndex] ?? 1;
  const choices = remainingChoices(state);
  const noPerks = !state.hasStudy && !state.hasSleep && !state.hasSocial;
  const tip = s.tips[tipIndex(state.seed, state.roundIndex)] ?? '';
  const hints = play?.hints ?? [];

  return (
    <SystemWindow
      className={cx(styles.palace, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      actions={
        <>
          {state.phase === 'memorise' && !over ? (
            <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? s.resume : s.pause}
            </button>
          ) : null}
          {over ? null : (
            <button type="button" className="btn btn--danger" onClick={() => dispatch({ type: 'forfeit' })}>
              {s.forfeit}
            </button>
          )}
          <button type="button" className="btn" onClick={exit}>
            {s.leave}
          </button>
        </>
      }
    >
      <p className={styles.status}>
        <span className="mono" data-testid="memory-palace-round">
          {formatText(s.round, { n: Math.min(state.roundIndex + 1, ROUND_COUNT), total: ROUND_COUNT })}
        </span>
        <span className="mono">{over ? s.phaseDone : state.phase === 'recall' ? s.phaseRecall : state.phase === 'memorise' ? s.phaseMemorise : s.phaseIntro}</span>
        <span className="mono" data-testid="memory-palace-score">
          {formatText(s.progress, { correct, total })}
        </span>
      </p>

      <div
        className={cx(styles.live, (outcome || state.phase === 'memorise') && 'srOnly')}
        aria-live="polite"
        role="status"
        data-testid="memory-palace-prompt"
      >
        {live}
      </div>

      <div ref={stageRef}>
        {state.phase === 'intro' && round ? (
          <section className={styles.card} aria-label={formatText(s.introRound, { n: state.roundIndex + 1, total: ROUND_COUNT })}>
            <p className={styles.intro}>{s.intro}</p>
            <ul className={styles.perkList}>
              {state.hasStudy ? <li>{formatText(s.studyPerk, { name: memberName(state.studyMemberId) })}</li> : null}
              {state.hasSleep ? <li>{formatText(s.sleepPerk, { name: memberName(state.sleepMemberId) })}</li> : null}
              {state.hasSocial ? <li>{formatText(s.socialPerk, { name: memberName(state.socialMemberId) })}</li> : null}
              {noPerks ? <li>{s.noPerks}</li> : null}
            </ul>
            {state.hasSocial ? (
              <p className={styles.tip}>
                <strong>{s.tipTitle}:</strong> {tip}
              </p>
            ) : null}
            <button type="button" className={cx('btn', 'btn--primary', styles.wide)} data-primary onClick={() => dispatch({ type: 'advance' })}>
              {s.begin}
            </button>
          </section>
        ) : null}

        {state.phase === 'memorise' && looking && round ? (
          <section className={styles.card} aria-label={s.phaseMemorise}>
            <div className={styles.scene}>
              <RoomArt room={looking.roomId} className={styles.sceneArt} />
              <p className={styles.roomName}>{roomAtText(looking.roomId, s)}</p>
              <p className={styles.thing}>{wordText(looking.wordId, locale)}</p>
              <p className={styles.caption}>{captionText(looking, s)}</p>
              <p className={cx('mono', styles.count)}>{formatText(s.thingNumber, { n: state.showIndex + 1, count: round.items.length })}</p>
            </div>
            {reducedMotion ? (
              <p className={styles.timeText}>{paused ? s.paused : formatText(s.timeLeft, { n: secondsLeft(state.ticksLeft) })}</p>
            ) : (
              <Meter value={state.ticksLeft} max={maxTicks} label={s.timeBar} text={paused ? s.paused : formatText(s.timeLeft, { n: secondsLeft(state.ticksLeft) })} tone="bright" />
            )}
            <button type="button" className={cx('btn', 'btn--primary', styles.wide)} data-primary onClick={() => dispatch({ type: 'advance' })}>
              {s.ready}
            </button>
            <h3 className={styles.subtitle}>{s.routeTitle}</h3>
            <ol className={styles.route}>
              {ROOM_IDS.map((roomId) => {
                const here = roomId === looking.roomId;
                return (
                  <li key={roomId} className={cx(styles.stop, here && styles.here)} aria-current={here ? 'step' : undefined}>
                    <RoomArt room={roomId} className={styles.stopArt} />
                    <span className={styles.stopLabel}>{s.roomShort[roomId]}</span>
                    {here ? <span className={cx('mono', styles.stopNow)}>{s.routeNow}</span> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {state.phase === 'recall' && round && play ? (
          <section className={styles.recall} aria-label={s.phaseRecall}>
            {state.hasSocial ? (
              <div className={styles.tips}>
                <h3 className={styles.subtitle}>{s.socialTitle}</h3>
                <ul className={styles.counts}>
                  {roomCounts(round).map((row) => (
                    <li key={row.roomId}>{formatText(s.socialTip, { room: s.roomShort[row.roomId], n: row.count })}</li>
                  ))}
                </ul>
                <p className={styles.tip}>{tip}</p>
              </div>
            ) : null}

            {hints.length > 0 ? (
              <div>
                <h3 className={styles.subtitle}>{s.hintsTitle}</h3>
                <ul className={styles.hintList}>
                  {hints.map((h) => (
                    <li key={h.wordId}>{formatText(s.hintUsed, { room: capitalise(s.roomAt[h.roomId]), letter: h.prefix })}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {state.hintsLeft > 0 ? (
              <button type="button" className={cx('btn', styles.wide, styles.hintBtn)} onClick={() => dispatch({ type: 'hint' })}>
                {s.hint} · {formatText(s.hintsLeft, { n: state.hintsLeft })}
              </button>
            ) : null}

            <h3 className={styles.subtitle}>{s.itemsTitle}</h3>
            {choices.length > 0 ? (
              <ul className={styles.items} data-testid="memory-palace-items">
                {choices.map((wordId, i) => (
                  <li key={wordId}>
                    <button
                      type="button"
                      className={cx('btn', styles.itemBtn, selectedItem === wordId && styles.chosen)}
                      aria-pressed={selectedItem === wordId}
                      data-primary={i === 0 ? '' : undefined}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(wordId));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => pickItem(wordId)}
                    >
                      {wordText(wordId, locale)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{s.itemsEmpty}</p>
            )}

            <h3 className={styles.subtitle}>{s.roomsTitle}</h3>
            <ul className={styles.rooms} data-testid="memory-palace-rooms" onKeyDown={onRoomKey}>
              {ROOM_IDS.map((roomId) => {
                const filled = play.placements.filter((p) => p.roomId === roomId);
                return (
                  <li key={roomId}>
                    <button
                      type="button"
                      className={cx('btn', styles.roomBtn, selectedRoom === roomId && styles.chosen)}
                      aria-pressed={selectedRoom === roomId}
                      onClick={() => pickRoom(roomId)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = Number(e.dataTransfer.getData('text/plain'));
                        if (Number.isInteger(id)) place(id, roomId);
                      }}
                    >
                      <RoomArt room={roomId} className={styles.roomArt} />
                      <span className={styles.roomLabel}>{s.roomShort[roomId]}</span>
                      {filled.length > 0 ? (
                        <span className={styles.marks}>
                          {filled.map((p) => (
                            <span key={p.wordId} className={cx(styles.mark, p.correct ? styles.right : styles.wrong)}>
                              <span aria-hidden="true">{p.correct ? '✓' : '×'}</span> {wordText(p.wordId, locale)}
                              <span className="srOnly"> ({p.correct ? s.markRight : s.markWrong})</span>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={cx('muted', styles.keys)}>{s.keys}</p>
          </section>
        ) : null}
      </div>

      {outcome ? (
        <div className={styles.banner} data-result={outcome.result} data-testid="memory-palace-end">
          <p className={styles.bannerTitle}>{s.end[outcome.result]}</p>
          <p className={cx('mono', styles.bannerScore)}>{formatText(s.endScore, { score: outcome.score })}</p>
          {outcome.learned ? <p className={styles.tip}>{outcome.learned.note[locale]}</p> : null}
          {state.reviveUsed ? <p className="muted">{formatText(s.reviveNote, { n: state.revivedRound + 1 })}</p> : null}
        </div>
      ) : null}
    </SystemWindow>
  );
}

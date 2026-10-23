/**
 * Memory Palace Screen: six illustrated rooms, a look phase, then a recall
 * phase. Touch, mouse and keyboard; drag is extra. State comes only from
 * the engine through `useEngine`.
 */
import { useEffect, useState } from 'react';
import { Meter } from '../../components/Meter';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  ROOM_IDS,
  ROUND_COUNT,
  currentItem,
  currentPlay,
  currentRound,
  engine,
  isOver,
  promptText,
  remainingChoices,
  roomCounts,
  secondsLeft,
  tally,
  type RoomId,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import { wordText } from './words';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function RoomArt({ room }: { room: RoomId }) {
  return (
    <svg className={styles.art} viewBox="0 0 80 48" aria-hidden="true" focusable="false">
      {room === 'gate' ? (
        <>
          <rect x="8" y="10" width="64" height="34" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M20 44 V22 A20 16 0 0 1 60 22 V44" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="52" cy="32" r="2" fill="currentColor" />
        </>
      ) : null}
      {room === 'hall' ? (
        <>
          <rect x="6" y="20" width="8" height="24" fill="currentColor" />
          <rect x="24" y="16" width="8" height="28" fill="currentColor" />
          <rect x="48" y="16" width="8" height="28" fill="currentColor" />
          <rect x="66" y="20" width="8" height="24" fill="currentColor" />
          <path d="M4 16 H76" stroke="currentColor" strokeWidth="3" />
        </>
      ) : null}
      {room === 'kitchen' ? (
        <>
          <rect x="10" y="22" width="36" height="20" fill="none" stroke="currentColor" strokeWidth="3" />
          <rect x="18" y="12" width="20" height="10" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="58" cy="30" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M58 20 V12" stroke="currentColor" strokeWidth="3" />
        </>
      ) : null}
      {room === 'library' ? (
        <>
          <rect x="8" y="8" width="64" height="36" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M8 20 H72 M8 32 H72 M24 8 V44 M48 8 V44" stroke="currentColor" strokeWidth="2" />
          <rect x="12" y="22" width="8" height="8" fill="currentColor" />
          <rect x="52" y="34" width="10" height="6" fill="currentColor" />
        </>
      ) : null}
      {room === 'garden' ? (
        <>
          <path d="M16 40 C16 24 40 16 40 8 C40 16 64 24 64 40 Z" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="28" cy="30" r="4" fill="currentColor" />
          <circle cx="52" cy="28" r="3" fill="currentColor" />
          <path d="M8 40 H72" stroke="currentColor" strokeWidth="3" />
        </>
      ) : null}
      {room === 'tower' ? (
        <>
          <path d="M28 44 V18 H20 L40 6 L60 18 H52 V44 Z" fill="none" stroke="currentColor" strokeWidth="3" />
          <rect x="36" y="28" width="8" height="10" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

export default function MemoryPalaceScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [paused, setPaused] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomId | null>(null);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const over = isOver(state);
  const round = currentRound(state);
  const play = currentPlay(state);
  const looking = currentItem(state);
  const { correct, total } = tally(state);
  const running = outcome === null && state.phase === 'memorise' && !paused;

  useFixedStep(() => dispatch({ type: 'tick' }), { running });

  useEffect(() => {
    if (over || state.phase !== 'recall') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const from = selectedRoom ?? ROOM_IDS[0];
        const i = ROOM_IDS.indexOf(from);
        const next = e.key === 'ArrowRight' ? ROOM_IDS[(i + 1) % ROOM_IDS.length]! : ROOM_IDS[(i + ROOM_IDS.length - 1) % ROOM_IDS.length]!;
        setSelectedRoom(next);
        return;
      }
      if (e.key === 'Enter' && selectedItem !== null && selectedRoom) {
        e.preventDefault();
        dispatch({ type: 'place', wordId: selectedItem, roomId: selectedRoom });
        setSelectedRoom(null);
        setSelectedItem(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, state.phase, selectedRoom, selectedItem, dispatch]);

  const placePair = (wordId: number | null, roomId: RoomId | null) => {
    if (wordId === null || roomId === null) return;
    dispatch({ type: 'place', wordId, roomId });
    setSelectedRoom(null);
    setSelectedItem(null);
    setDragId(null);
  };

  const pickRoom = (roomId: RoomId) => {
    setSelectedRoom(roomId);
    if (selectedItem !== null) placePair(selectedItem, roomId);
  };

  const pickItem = (wordId: number) => {
    setSelectedItem(wordId);
    if (selectedRoom) placePair(wordId, selectedRoom);
  };

  const live =
    state.phase === 'memorise' && looking
      ? promptText(state, looking, s)
      : play?.placements.length
        ? play.placements[play.placements.length - 1]!.correct
          ? formatText(s.placed, {
              item: wordText(play.placements[play.placements.length - 1]!.wordId, locale),
              room: s.rooms[play.placements[play.placements.length - 1]!.roomId],
            })
          : formatText(s.placedWrong, {
              item: wordText(play.placements[play.placements.length - 1]!.wordId, locale),
              room: s.rooms[play.placements[play.placements.length - 1]!.roomId],
            })
        : s.intro;

  const endText = outcome ? s.end[outcome.result] : null;
  const maxTicks = state.displayTicksByRound[state.roundIndex] ?? 1;
  const choices = remainingChoices(state);
  const lastHint = play?.hints[play.hints.length - 1];

  return (
    <SystemWindow
      className={cx(styles.palace, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      actions={
        <>
          {over || state.phase !== 'memorise' ? null : (
            <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? s.resume : s.pause}
            </button>
          )}
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
      <p className={styles.intro}>{s.intro}</p>
      <p className={styles.status}>
        <span className="mono" data-testid="memory-palace-round">
          {formatText(s.round, { n: Math.min(state.roundIndex + 1, ROUND_COUNT), total: ROUND_COUNT })}
        </span>
        <span className="mono">{state.phase === 'memorise' ? s.phaseMemorise : s.phaseRecall}</span>
        <span className="mono" data-testid="memory-palace-score">
          {formatText(s.progress, { correct, total })}
        </span>
      </p>

      <div className={styles.live} aria-live="polite" data-testid="memory-palace-prompt">
        {live}
      </div>

      {state.hasStudy || state.hasSleep || state.hasSocial ? (
        <p className={cx('muted', styles.perks)}>
          {state.hasStudy && state.studyMemberId
            ? formatText(s.studyPerk, { name: props.party.members.find((m) => m.id === state.studyMemberId)?.name ?? '' })
            : null}{' '}
          {state.hasSleep && state.sleepMemberId
            ? formatText(s.sleepPerk, { name: props.party.members.find((m) => m.id === state.sleepMemberId)?.name ?? '' })
            : null}{' '}
          {state.hasSocial && state.socialMemberId
            ? formatText(s.socialPerk, { name: props.party.members.find((m) => m.id === state.socialMemberId)?.name ?? '' })
            : null}
        </p>
      ) : null}

      {state.phase === 'memorise' && looking ? (
        <div className={styles.look}>
          <div className={styles.lookRoom}>
            <RoomArt room={looking.roomId} />
            <p className={styles.roomLabel}>{s.roomShort[looking.roomId]}</p>
          </div>
          {reducedMotion ? (
            <p className={styles.timeText}>{formatText(s.timeLeft, { n: secondsLeft(state.ticksLeft) })}</p>
          ) : (
            <Meter
              value={state.ticksLeft}
              max={maxTicks}
              label={s.timeBar}
              text={formatText(s.timeLeft, { n: secondsLeft(state.ticksLeft) })}
              tone="bright"
            />
          )}
          <button type="button" className={cx('btn', 'btn--primary', styles.ready)} onClick={() => dispatch({ type: 'advance' })}>
            {s.ready}
          </button>
        </div>
      ) : null}

      {state.phase === 'recall' && round && play ? (
        <div className={styles.recall}>
          {state.hasSocial ? (
            <div className={styles.tips}>
              <h3 className={styles.subtitle}>{s.socialTitle}</h3>
              <ul>
                {roomCounts(round).map((row) => (
                  <li key={row.roomId}>{formatText(s.socialTip, { room: s.rooms[row.roomId], n: row.count })}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {lastHint ? (
            <p className={styles.hintLine}>
              {formatText(s.hintUsed, { room: s.rooms[lastHint.roomId], letter: lastHint.prefix })}
            </p>
          ) : null}

          {state.hintsLeft > 0 ? (
            <button type="button" className={cx('btn', styles.hintBtn)} onClick={() => dispatch({ type: 'hint' })}>
              {s.hint} · {formatText(s.hintsLeft, { n: state.hintsLeft })}
            </button>
          ) : null}

          {selectedRoom ? <p className="muted">{formatText(s.selectedRoom, { room: s.rooms[selectedRoom] })}</p> : null}
          {selectedItem !== null ? (
            <p className="muted">{formatText(s.selectedItem, { item: wordText(selectedItem, locale) })}</p>
          ) : null}

          <h3 className={styles.subtitle}>{s.roomsTitle}</h3>
          <ul className={styles.rooms} data-testid="memory-palace-rooms">
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
                      const raw = e.dataTransfer.getData('text/plain');
                      const id = Number(raw);
                      if (Number.isInteger(id)) placePair(id, roomId);
                    }}
                    onPointerUp={() => {
                      if (dragId !== null) {
                        placePair(dragId, roomId);
                        setDragId(null);
                      }
                    }}
                  >
                    <RoomArt room={roomId} />
                    <span className={styles.roomLabel}>{s.roomShort[roomId]}</span>
                    {filled.length > 0 ? (
                      <span className={styles.marks}>
                        {filled.map((p) => (p.correct ? '✓' : '×')).join(' ')} {filled.length}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <h3 className={styles.subtitle}>{s.itemsTitle}</h3>
          <ul className={styles.items} data-testid="memory-palace-items">
            {choices.map((wordId) => (
              <li key={wordId}>
                <button
                  type="button"
                  className={cx('btn', styles.itemBtn, selectedItem === wordId && styles.chosen)}
                  aria-pressed={selectedItem === wordId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(wordId));
                    setDragId(wordId);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onPointerDown={() => setDragId(wordId)}
                  onClick={() => pickItem(wordId)}
                >
                  {formatText(s.selectItem, { item: wordText(wordId, locale) })}
                </button>
              </li>
            ))}
          </ul>
          <p className={cx('muted', styles.hint)}>{s.keys}</p>
        </div>
      ) : null}

      {endText ? (
        <p className={styles.banner} role="status" data-result={outcome?.result}>
          {endText}
        </p>
      ) : null}
    </SystemWindow>
  );
}

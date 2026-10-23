/**
 * Reading Race screen. State comes only from the engine through `useEngine`.
 * Ticks are dispatched with `useFixedStep`. Pause is a Screen flag; re-read,
 * pace, hints and answers are engine actions. Forfeit ends the game as fled
 * (the engine's own leave action); Leave is a separate button.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  MAX_WPM,
  MIN_WPM,
  PASSAGES_PER_GAME,
  QUESTIONS_PER_PASSAGE,
  QUESTIONS_TOTAL,
  REREAD_COST,
  WPM_STEP,
  SOCIAL_STRONG_POWER,
  currentPlan,
  engine,
  highlightTopic,
  inTopicSentence,
  isOver,
  paceFloor,
  passageCorrect,
  rampedWpm,
  visibleOptions,
  visibleRange,
  type ReadingRaceState,
} from './engine';
import game from './manifest';
import { passageById, type Passage } from './passages';
import { strings } from './strings';
import { pivotIndex, wordList } from './text';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName);
}

/** The course: three legs, a flag at the end of each, and a runner whose place follows the words read. */
function Track({ progress, label }: { progress: number; label: string }) {
  const x = 14 + Math.round(272 * Math.max(0, Math.min(1, progress)));
  return (
    <svg className={styles.trackSvg} viewBox="0 0 300 44" role="img" aria-label={label} focusable="false">
      <line x1="14" y1="30" x2="286" y2="30" className={styles.lane} />
      {[1, 2, 3].map((leg) => {
        const fx = 14 + Math.round((272 * leg) / PASSAGES_PER_GAME);
        return (
          <g key={leg} className={styles.flag}>
            <line x1={fx} y1="30" x2={fx} y2="12" />
            <path d={`M${fx} 12 l9 4 l-9 4 z`} />
          </g>
        );
      })}
      <g className={styles.runner} transform={`translate(${x} 0)`}>
        <circle cx="0" cy="17" r="4" />
        <path d="M0 21 v7 M-5 24 h10 M0 28 l-4 5 M0 28 l4 5" />
      </g>
    </svg>
  );
}

export default function ReadingRaceScreen(props: GameScreenProps) {
  const { locale } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState(s.feed.ready);
  const over = isOver(state);
  const plan = currentPlan(state);
  const passage: Passage | undefined = plan ? passageById(locale, plan.id) : undefined;
  const words = useMemo(() => (passage ? wordList(passage.text) : []), [passage]);
  const range = visibleRange(state);
  const running = outcome === null && !paused && state.phase === 'reading';
  const tunable = state.phase === 'ready' || state.phase === 'interlude';
  const floor = paceFloor(state.difficulty);

  useFixedStep(() => dispatch({ type: 'tick' }), { running });

  // --- the feed: what an assistive technology hears, and a one-line status for everyone ---
  const prev = useRef<ReadingRaceState>(state);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before === state) return;
    if (before.phase !== 'reading' && state.phase === 'reading' && plan) {
      setMessage(
        formatText(s.feed.passage, { n: state.passageIndex + 1, total: PASSAGES_PER_GAME, topic: plan.topic, wpm: state.wpm }),
      );
    } else if (state.answers.length > before.answers.length) {
      const last = state.answers[state.answers.length - 1]!;
      const p = passageById(locale, state.plans[last.passageIndex]?.id ?? '');
      const q = p?.questions[last.questionIndex];
      let text = last.correct ? s.feed.right : formatText(s.feed.miss, { answer: q?.options[q.correct] ?? '' });
      if (state.phase === 'interlude' || (state.phase === 'done' && !state.forfeited)) {
        text += ' ' + formatText(s.feed.done, { n: last.passageIndex + 1, correct: passageCorrect(state, last.passageIndex), total: QUESTIONS_PER_PASSAGE });
      }
      setMessage(text);
    } else if (before.phase === 'reading' && state.phase === 'questions') {
      setMessage(formatText(s.feed.questions, { total: QUESTIONS_PER_PASSAGE }));
    } else if (state.hintsUsed > before.hintsUsed) {
      setMessage(s.feed.hint);
    } else if (state.wpm !== before.wpm && (state.phase === 'ready' || state.phase === 'interlude')) {
      setMessage(formatText(s.feed.pace, { wpm: state.wpm }));
    } else if (state.phase === 'reading' && state.wordIndex < before.wordIndex && state.passageIndex === before.passageIndex) {
      setMessage(s.feed.reread);
    }
  }, [state, plan, locale, s]);

  // --- focus follows the game, so the keyboard never has to hunt ---
  const stageRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.phase === 'reading') stageRef.current?.focus({ preventScroll: true });
    else if (state.phase === 'interlude') continueRef.current?.focus({ preventScroll: true });
  }, [state.phase, state.passageIndex]);
  useEffect(() => {
    if (state.phase === 'questions') promptRef.current?.focus({ preventScroll: true });
  }, [state.phase, state.questionIndex, state.passageIndex]);
  useEffect(() => {
    if (over) bannerRef.current?.focus({ preventScroll: true });
  }, [over]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      setMessage(p ? s.feed.resumed : s.feed.paused);
      return !p;
    });
  }, [s]);

  const setPace = useCallback((wpm: number) => dispatch({ type: 'setPace', wpm }), [dispatch]);
  const freeNow = state.passageFree || state.freePassagesLeft > 0;

  // --- keyboard: Space pauses, arrows set the pace, 1 to 4 answer ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target) || over) return;
      const key = e.key;
      if (state.phase === 'reading') {
        if (key === ' ' && !isButton(e.target)) {
          e.preventDefault();
          if (state.sentenceMode) dispatch({ type: 'advance' });
          else togglePause();
        } else if (key === 'ArrowRight' && state.sentenceMode) {
          e.preventDefault();
          dispatch({ type: 'advance' });
        } else if (key === 'r' || key === 'R') {
          e.preventDefault();
          dispatch({ type: 'reread' });
        }
        return;
      }
      if (tunable) {
        if (key === 'ArrowUp' || key === 'ArrowRight') {
          e.preventDefault();
          setPace(Math.min(MAX_WPM, state.wpm + WPM_STEP));
        } else if (key === 'ArrowDown' || key === 'ArrowLeft') {
          e.preventDefault();
          setPace(Math.max(floor, state.wpm - WPM_STEP));
        } else if (key === 'Enter' && state.phase === 'ready' && !isButton(e.target)) {
          e.preventDefault();
          dispatch({ type: 'start' });
        }
        return;
      }
      if (state.phase === 'questions') {
        const n = Number(key);
        if (Number.isInteger(n) && n >= 1 && n <= 4) {
          e.preventDefault();
          dispatch({ type: 'answer', option: n - 1 });
        } else if (key === 'h' || key === 'H') {
          e.preventDefault();
          dispatch({ type: 'hint' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, over, state.phase, state.wpm, state.sentenceMode, tunable, floor, setPace, togglePause]);

  // --- derived display values ---
  const questionIndex = state.questionIndex;
  const question = passage?.questions[questionIndex];
  const shownOptions = visibleOptions(state);
  const readFraction = plan && plan.wordCount > 0 ? Math.min(1, (state.phase === 'ready' ? 0 : state.wordsShown) / plan.wordCount) : 0;
  const legsDone = state.passageWpms.length;
  const trackProgress = over || legsDone >= PASSAGES_PER_GAME ? legsDone / PASSAGES_PER_GAME : (legsDone + (state.phase === 'reading' || state.phase === 'questions' ? readFraction : 0)) / PASSAGES_PER_GAME;
  const trackLabel = formatText(s.track, {
    n: Math.min(PASSAGES_PER_GAME, state.passageIndex + 1),
    total: PASSAGES_PER_GAME,
    percent: Math.round(trackProgress * 100),
  });
  const topicShown = highlightTopic(state) && range !== null && inTopicSentence(state, range[0]);
  const text = range ? words.slice(range[0], range[1]).join(' ') : '';
  const single = range && range[1] - range[0] === 1 ? (words[range[0]] ?? '') : null;
  const pivot = single !== null ? pivotIndex(single) : 0;
  const letters = single !== null ? Array.from(single) : [];
  const recap = plan && passage ? wordList(passage.text).slice(0, plan.topicEnd).join(' ') : '';
  const keys = state.phase === 'questions' ? s.keysQuestions : state.phase === 'reading' ? (state.sentenceMode ? s.keysSentence : s.keysReading) : s.keysReady;
  const lastAnswer = state.answers[state.answers.length - 1];
  const interludeRight = state.phase === 'interlude' && lastAnswer ? passageCorrect(state, lastAnswer.passageIndex) : 0;

  const paceControls = (
    <div className={styles.paceBlock}>
      <div className={styles.paceRow} role="group" aria-label={s.paceGroup}>
        <button type="button" className="btn" disabled={!tunable || state.wpm <= floor} onClick={() => setPace(state.wpm - WPM_STEP)}>
          {s.slower}
        </button>
        <p className={styles.wpm} data-testid="reading-race-wpm">
          {formatText(s.pace, { wpm: state.wpm })}
        </p>
        <button type="button" className="btn" disabled={!tunable || state.wpm >= MAX_WPM} onClick={() => setPace(state.wpm + WPM_STEP)}>
          {s.faster}
        </button>
      </div>
      {floor > MIN_WPM ? <p className={cx('muted', styles.small)}>{formatText(s.paceFloor, { wpm: floor })}</p> : null}
      {state.phase === 'interlude' && state.autoRamp ? (
        <p className={cx('muted', styles.small)} data-testid="reading-race-next-pace">
          {formatText(s.paceNext, { wpm: rampedWpm(state) })}
        </p>
      ) : null}
    </div>
  );

  const toggles = tunable ? (
    <div className={styles.toggles} role="group" aria-label={s.modes}>
      <Toggle pressed={state.phraseMode} onClick={() => dispatch({ type: 'setPhrase', on: !state.phraseMode })}>
        {s.phrase}
      </Toggle>
      <Toggle pressed={state.autoRamp} onClick={() => dispatch({ type: 'setRamp', on: !state.autoRamp })}>
        {s.ramp}
      </Toggle>
      <Toggle pressed={state.sentenceMode} onClick={() => dispatch({ type: 'setSentenceMode', on: !state.sentenceMode })}>
        {s.sentenceMode}
      </Toggle>
    </div>
  ) : null;

  return (
    <SystemWindow
      className={cx(styles.race, props.reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      actions={
        <>
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
      {state.phase === 'ready' ? (
        <>
          <p className={styles.intro}>{s.intro}</p>
          <p className={cx('muted', styles.small)} data-testid="reading-race-practice">
            {s.practice}
          </p>
        </>
      ) : null}
      <p className="srOnly" data-testid="reading-race-phase">
        {state.phase}
      </p>

      <div className={styles.track} data-testid="reading-race-progress">
        <Track progress={trackProgress} label={trackLabel} />
        <p className={styles.status}>
          <span className="mono">{formatText(s.passage, { n: Math.min(PASSAGES_PER_GAME, state.passageIndex + 1), total: PASSAGES_PER_GAME })}</span>
          <span className="mono">{formatText(s.wpmShort, { wpm: state.wpm })}</span>
        </p>
      </div>

      <p className={styles.feed} role="status" aria-live="polite" data-testid="reading-race-feed">
        {message}
      </p>

      {state.phase === 'ready' ? (
        <ul className={styles.perks} data-testid="reading-race-perks">
          {state.hasStudy ? <li>{s.perkStudy}</li> : null}
          {state.hasSleep ? <li>{s.perkSleep}</li> : null}
          {state.hasSocial ? <li>{state.socialPower >= SOCIAL_STRONG_POWER ? s.perkSocialStrong : s.perkSocial}</li> : null}
          {state.hintsLeft > 0 ? <li>{formatText(s.perkHint, { n: state.hintsLeft })}</li> : null}
          {state.freePassagesLeft > 0 ? <li>{s.perkTime}</li> : null}
          {state.luckApplied ? <li>{s.perkLuck}</li> : null}
        </ul>
      ) : null}

      {state.phase === 'ready' || state.phase === 'interlude' ? (
        <div className={styles.ready}>
          <h3 className={styles.subtitle}>
            {state.phase === 'interlude'
              ? formatText(s.feed.done, { n: state.passageIndex + 1, correct: interludeRight, total: QUESTIONS_PER_PASSAGE })
              : s.readyTitle}
          </h3>
          {paceControls}
          {toggles}
          {state.sentenceMode ? <p className={cx('muted', styles.small)}>{s.sentenceHelp}</p> : null}
          {state.autoRamp ? <p className={cx('muted', styles.small)}>{s.rampHelp}</p> : null}
          <button
            ref={continueRef}
            type="button"
            className="btn btn--primary"
            data-testid="reading-race-go"
            onClick={() => dispatch({ type: state.phase === 'ready' ? 'start' : 'continue' })}
          >
            {state.phase === 'ready' ? s.start : s.continue}
          </button>
        </div>
      ) : null}

      {state.phase === 'reading' ? (
        <div className={styles.reading}>
          <div
            ref={stageRef}
            tabIndex={-1}
            className={cx(styles.stage, topicShown && styles.topic, paused && styles.pausedStage)}
            data-testid="reading-race-word"
            data-paused={paused ? 'true' : 'false'}
          >
            {topicShown ? <span className={styles.topicLabel}>{s.topicLabel}</span> : null}
            {paused ? <span className={styles.pausedLabel}>{s.paused}</span> : null}
            {state.sentenceMode ? (
              <p className={styles.sentence} aria-label={s.sentenceStage}>
                {text}
              </p>
            ) : (
              <div role="img" aria-label={`${s.wordStage}: ${text}`} className={styles.rsvpBox}>
                {single !== null ? (
                  <p className={styles.rsvp} aria-hidden="true">
                    <span className={styles.before}>{letters.slice(0, pivot).join('')}</span>
                    <span className={styles.pivot}>{letters[pivot] ?? ''}</span>
                    <span className={styles.after}>{letters.slice(pivot + 1).join('')}</span>
                  </p>
                ) : (
                  <p className={styles.phrase} aria-hidden="true">
                    {text}
                  </p>
                )}
                <span className={styles.focusTop} aria-hidden="true" />
                <span className={styles.focusBottom} aria-hidden="true" />
              </div>
            )}
          </div>
          <div className={styles.readingActions}>
            {state.sentenceMode ? (
              <button type="button" className="btn btn--primary" data-testid="reading-race-next" onClick={() => dispatch({ type: 'advance' })}>
                {s.nextSentence}
              </button>
            ) : (
              <button type="button" className="btn" aria-pressed={paused} onClick={togglePause}>
                {paused ? s.resume : s.pause}
              </button>
            )}
            <button type="button" className="btn" data-testid="reading-race-reread" onClick={() => dispatch({ type: 'reread' })}>
              {freeNow ? s.rereadFree : formatText(s.reread, { n: REREAD_COST })}
            </button>
          </div>
        </div>
      ) : null}

      {state.phase === 'questions' && question ? (
        <div className={styles.questions}>
          <h3 className={styles.subtitle}>{s.questionsTitle}</h3>
          {state.hasStudy && recap ? (
            <p className={styles.recap} data-testid="reading-race-recap">
              {formatText(s.recap, { text: recap })}
            </p>
          ) : null}
          <p className={cx('muted', styles.small)}>{formatText(s.questionN, { n: questionIndex + 1, total: QUESTIONS_PER_PASSAGE })}</p>
          <p ref={promptRef} tabIndex={-1} className={styles.promptText} data-testid="reading-race-prompt">
            {question.prompt}
          </p>
          <ul className={styles.options} aria-label={s.optionsLabel}>
            {question.options.map((label, i) =>
              !shownOptions.includes(i) ? null : (
                <li key={i}>
                  <button type="button" className={cx('btn', styles.option)} data-testid={`reading-race-option-${i + 1}`} onClick={() => dispatch({ type: 'answer', option: i })}>
                    <span className={styles.optionN} aria-hidden="true">
                      {formatText(s.option, { n: i + 1 })}
                    </span>
                    <span className={styles.optionText}>{label}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
          {state.hintsLeft > 0 && shownOptions.length > 2 ? (
            <button type="button" className="btn" data-testid="reading-race-hint" onClick={() => dispatch({ type: 'hint' })}>
              {formatText(s.hint, { n: state.hintsLeft })}
            </button>
          ) : null}
        </div>
      ) : null}

      {over && outcome ? (
        <div className={styles.result}>
          <p ref={bannerRef} tabIndex={-1} className={styles.banner} data-result={outcome.result} data-testid="reading-race-banner">
            {s.end[outcome.result]}
          </p>
          <p className={styles.summary} data-testid="reading-race-summary">
            {formatText(s.comprehension, {
              correct: Number(outcome.stats?.correct ?? 0),
              total: Number(outcome.stats?.questions ?? QUESTIONS_TOTAL),
              percent: Number(outcome.stats?.comprehension ?? 0),
            })}{' '}
            {formatText(s.scoreLabel, { score: outcome.score })}
          </p>
          {outcome.learned ? <p className={styles.learned}>{outcome.learned.note[locale]}</p> : null}
          <p className={cx('muted', styles.small)}>{s.scoreHelp}</p>
        </div>
      ) : null}

      {over ? null : <p className={cx('muted', styles.hint)}>{keys}</p>}
    </SystemWindow>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={cx('btn', pressed && 'btn--primary')} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

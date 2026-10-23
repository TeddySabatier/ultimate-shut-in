/**
 * Reading Race screen. State comes only from the engine through `useEngine`.
 * Ticks are dispatched with `useFixedStep`. Pause is a Screen flag; re-read,
 * pace and answers are engine actions. Leave is a separate button from Forfeit.
 */
import { useEffect, useState } from 'react';
import { Meter } from '../../components/Meter';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  PASSAGES_PER_GAME,
  QUESTIONS_PER_PASSAGE,
  QUESTIONS_TOTAL,
  REREAD_COST,
  currentPassage,
  currentPlan,
  currentQuestion,
  engine,
  highlightTopic,
  inTopicSentence,
  isOver,
  MAX_WPM,
  MIN_WPM,
  visibleText,
  WPM_STEP,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

export default function ReadingRaceScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [paused, setPaused] = useState(false);
  const over = isOver(state);
  const plan = currentPlan(state);
  const passage = currentPassage(state);
  const question = currentQuestion(state);
  const word = visibleText(state);
  const running = outcome === null && !paused && state.phase === 'reading';

  useFixedStep(() => dispatch({ type: 'tick' }), { running });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === ' ' && state.phase === 'reading' && !over) {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      if ((state.phase === 'ready' || state.phase === 'interlude') && !over) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          dispatch({ type: 'setPace', wpm: Math.min(MAX_WPM, state.wpm + WPM_STEP) });
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          dispatch({ type: 'setPace', wpm: Math.max(MIN_WPM, state.wpm - WPM_STEP) });
          return;
        }
      }
      if (state.phase === 'questions' && !over) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= 4) {
          e.preventDefault();
          dispatch({ type: 'answer', option: n - 1 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, over, state.phase, state.wpm]);

  const endText = outcome ? s.end[outcome.result] : null;
  const canTune = state.phase === 'ready' || state.phase === 'interlude';
  const hidden = state.hiddenByQuestion[state.questionIndex] ?? [];
  const last = state.answers[state.answers.length - 1];
  const topicOn = highlightTopic(state);

  const paceControls = (
    <div className={styles.paceRow}>
      <button type="button" className="btn" disabled={!canTune || state.wpm <= MIN_WPM} onClick={() => dispatch({ type: 'setPace', wpm: state.wpm - WPM_STEP })}>
        {s.slower}
      </button>
      <p className={styles.wpm} data-testid="reading-race-wpm">
        {formatText(s.pace, { wpm: state.wpm })}
      </p>
      <button type="button" className="btn" disabled={!canTune || state.wpm >= MAX_WPM} onClick={() => dispatch({ type: 'setPace', wpm: Math.min(MAX_WPM, state.wpm + WPM_STEP) })}>
        {s.faster}
      </button>
    </div>
  );

  const toggles = canTune ? (
    <div className={styles.toggles}>
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
      className={cx(styles.race, reducedMotion && styles.still)}
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
      <p className={styles.intro}>{s.intro}</p>
      <p className="srOnly" data-testid="reading-race-phase">
        {state.phase}
      </p>

      <ul className={styles.perks}>
        {state.hasStudy ? <li>{s.perkStudy}</li> : null}
        {state.hasSleep ? <li>{s.perkSleep}</li> : null}
        {state.hasSocial ? <li>{s.perkSocial}</li> : null}
        {state.hintsLeft > 0 && state.phase !== 'done' ? <li>{s.perkHint}</li> : null}
        {state.freeRereadsLeft > 0 ? <li>{s.perkTime}</li> : null}
        {state.luckApplied ? <li>{s.perkLuck}</li> : null}
      </ul>

      {plan && state.phase !== 'ready' ? (
        <p className={styles.status}>
          <span className="mono">{formatText(s.passage, { n: state.passageIndex + 1, total: PASSAGES_PER_GAME })}</span>
          <span className="mono">{formatText(s.wpmShort, { wpm: state.wpm })}</span>
        </p>
      ) : null}

      {plan && (state.phase === 'reading' || state.phase === 'questions' || state.phase === 'interlude' || over) ? (
        <div className={styles.track} data-testid="reading-race-progress">
          <Meter
            value={state.wordsShown}
            max={plan.wordCount}
            label={s.progress}
            tone="xp"
            text={`${state.wordsShown}/${plan.wordCount}`}
          />
        </div>
      ) : null}

      <div className={styles.live} aria-live="polite">
        {last && (state.phase === 'questions' || state.phase === 'interlude' || over) ? (last.correct ? s.correct : s.miss) : null}
        {endText ? (
          <p className={styles.banner} role="status" data-result={outcome?.result}>
            {endText}
          </p>
        ) : null}
      </div>

      {state.phase === 'ready' || state.phase === 'interlude' ? (
        <div className={styles.ready}>
          <h3 className={styles.subtitle}>{state.phase === 'interlude' && passage ? passage.topic : s.readyTitle}</h3>
          {paceControls}
          {toggles}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => dispatch({ type: state.phase === 'ready' ? 'start' : 'continue' })}
          >
            {state.phase === 'ready' ? s.start : s.continue}
          </button>
        </div>
      ) : null}

      {state.phase === 'reading' ? (
        <div className={styles.reading}>
          <div
            className={cx(styles.stage, topicOn && inTopicSentence(state, state.wordIndex) && styles.topic)}
            data-testid="reading-race-word"
            role="img"
            aria-label={word ? `${s.wordStage}: ${word}` : s.wordStage}
          >
            <p className={styles.word}>{word || '…'}</p>
            <span className={styles.focus} aria-hidden="true" />
          </div>
          <div className={styles.readingActions}>
            <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? s.resume : s.pause}
            </button>
            <button
              type="button"
              className="btn"
              title={formatText(s.rereadHint, { n: REREAD_COST })}
              onClick={() => dispatch({ type: 'reread' })}
            >
              {state.freeRereadsLeft > 0 ? s.rereadFree : s.reread}
            </button>
            {state.sentenceMode ? (
              <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'advance' })}>
                {s.nextSentence}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.phase === 'questions' && question ? (
        <div className={styles.questions}>
          <h3 className={styles.subtitle}>{s.questionsTitle}</h3>
          <p className={styles.prompt}>{formatText(s.questionN, { n: state.questionIndex + 1, total: QUESTIONS_PER_PASSAGE })}</p>
          <p className={styles.promptText}>{question.prompt}</p>
          <ul className={styles.options}>
            {question.options.map((label, i) =>
              hidden.includes(i) ? null : (
                <li key={i}>
                  <button type="button" className={cx('btn', styles.option)} onClick={() => dispatch({ type: 'answer', option: i })}>
                    <span className={styles.optionN}>{formatText(s.option, { n: i + 1 })}</span>
                    <span className={styles.optionText}>{label}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}

      {over && outcome ? (
        <p className={styles.summary}>
          {formatText(s.comprehension, {
            correct: Number(outcome.stats?.correct ?? 0),
            total: Number(outcome.stats?.questions ?? QUESTIONS_TOTAL),
            percent: Number(outcome.stats?.comprehension ?? 0),
          })}{' '}
          {formatText(s.scoreLabel, { score: outcome.score })}
        </p>
      ) : null}

      <p className={cx('muted', styles.hint)}>{s.keys}</p>
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

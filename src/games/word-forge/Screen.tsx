/**
 * Word Forge Screen: cards, four options or a typed field, a heat bar, and a
 * coarse timer. State comes only from the engine through `useEngine`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import { EXAMPLES } from './examples';
import {
  currentPrompt,
  currentTarget,
  currentWord,
  engine,
  heat,
  isOver,
  targetOf,
  type WordForgeState,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import { getWord } from './words';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function firstLetter(text: string): string {
  const ch = text.normalize('NFC').charAt(0);
  return ch ? ch.toUpperCase() : '';
}

function lastVerdict(state: WordForgeState): WordForgeState['marks'][number] | undefined {
  return state.marks[state.marks.length - 1];
}

function TypeForm({
  label,
  placeholder,
  submitLabel,
  onForge,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  onForge: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onForge(draft);
  };
  return (
    <form className={styles.typeForm} onSubmit={onSubmit}>
      <label className={styles.typeLabel} htmlFor="word-forge-input">
        {label}
      </label>
      <input
        id="word-forge-input"
        data-testid="word-forge-input"
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
      />
      <button type="submit" className={cx('btn', styles.submit)}>
        {submitLabel}
      </button>
    </form>
  );
}

export default function WordForgeScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const over = isOver(state);
  const word = currentWord(state);
  const prompt = currentPrompt(state);
  const target = currentTarget(state);
  const [paused, setPaused] = useState(false);

  useFixedStep(() => dispatch({ type: 'second' }), { running: outcome === null && !paused, dtMs: 1000 });

  useEffect(() => {
    if (over) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (state.inputMode !== 'choice') return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 4) return;
      e.preventDefault();
      dispatch({ type: 'choose', index: n - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, state.inputMode, dispatch]);

  const remaining = Math.max(0, state.parSeconds - state.seconds);
  const example = word && state.hasStudy ? EXAMPLES[word.id] : undefined;
  const exampleText = example ? example[state.learns === 'fr' ? 'en' : 'fr'] : '';
  const last = lastVerdict(state);
  const endText = outcome ? s.end[outcome.result] : null;
  const langName = state.learns === 'fr' ? s.langFr : s.langEn;

  return (
    <SystemWindow
      className={cx(styles.forge, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      actions={
        <>
          {over ? null : (
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
        <span className="mono" data-testid="word-forge-progress">
          {formatText(s.progress, { n: state.marks.length + (over ? 0 : 1) })}
        </span>
        <span className="mono" data-testid="word-forge-time">
          {formatText(s.time, { n: remaining })}
        </span>
        <span className="mono" data-testid="word-forge-streak">
          {formatText(s.streak, { n: state.streak })}
        </span>
      </p>

      <div className={styles.heatRow}>
        <div
          className={styles.heat}
          role="progressbar"
          aria-label={formatText(s.heat, { n: heat(state) })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={heat(state)}
          data-testid="word-forge-heat"
        >
          <span className={styles.heatFill} style={{ width: `${heat(state)}%` }} />
          {reducedMotion ? null : <span className={styles.sparks} aria-hidden="true" />}
        </div>
        <button type="button" className={cx('btn', styles.dir)} onClick={() => dispatch({ type: 'flip' })} disabled={over}>
          {formatText(s.learns, { lang: langName })}
          <span className={styles.dirHint}>{s.switchDirection}</span>
        </button>
      </div>

      <div className={styles.live} aria-live="polite">
        {last ? <p className={styles.verdict} data-verdict={last.verdict}>{s.verdict[last.verdict]}</p> : null}
      </div>

      {endText ? (
        <p className={styles.banner} role="status" data-result={outcome?.result}>
          {endText}
        </p>
      ) : word ? (
        <>
          <h3 className={styles.promptLabel}>{s.prompt}</h3>
          <p className={styles.prompt} data-testid="word-forge-prompt">
            {prompt}
          </p>
          <p className={styles.meta}>
            <span>{s.pos[word.pos]}</span>
            {word.gender !== 'n' && state.learns === 'fr' ? <span>{s.gender[word.gender]}</span> : null}
          </p>
          {exampleText ? (
            <p className={styles.example}>
              <span className={styles.exampleLabel}>{s.example}</span> {exampleText}
            </p>
          ) : null}
          {state.revealed ? <p className={styles.hintLetter}>{formatText(s.firstLetter, { letter: firstLetter(target) })}</p> : null}

          {state.inputMode === 'choice' ? (
            <>
              <h3 className={styles.subtitle}>{s.options}</h3>
              <ul className={styles.options} data-testid="word-forge-options">
                {state.options.map((id, i) => {
                  const opt = getWord(id);
                  const label = opt ? targetOf(opt, state.learns) : id;
                  return (
                    <li key={id}>
                      <button type="button" className={cx('btn', styles.option)} onClick={() => dispatch({ type: 'choose', index: i })}>
                        <span className={styles.optionKey}>{i + 1}</span>
                        <span>{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <TypeForm
              key={state.currentId ?? 'none'}
              label={s.typeLabel}
              placeholder={s.typePlaceholder}
              submitLabel={s.submit}
              onForge={(text) => dispatch({ type: 'type', text })}
            />
          )}

          <p className={cx('muted', styles.tools)}>
            {state.inputMode === 'choice' ? s.keysChoice : s.keysType}
            {state.hasEat ? ` ${s.eatBonus}` : ''}
            {state.hasStudy ? ` ${s.studyHelp}` : ''}
            {state.hasSocial ? ` ${s.socialHelp}` : ''}
          </p>
          <div className={styles.toggles}>
            {state.inputMode === 'typed' ? (
              <button type="button" className="btn" aria-pressed={state.accentTolerance} onClick={() => dispatch({ type: 'toggleAccents' })}>
                {state.accentTolerance ? s.accentOn : s.accentOff}
              </button>
            ) : null}
            {state.hintsLeft > 0 ? (
              <button type="button" className="btn" onClick={() => dispatch({ type: 'hint' })}>
                {formatText(s.hint, { n: state.hintsLeft })}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </SystemWindow>
  );
}

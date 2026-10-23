/**
 * Scroll Room Screen: a lobby to pick the decks, then one scroll at a time
 * (four options, a typed field, or steps to put in order), the explanation
 * with its source after every answer, and a short result line at the end.
 * State comes only from the engine through `useEngine`. Deck selection and
 * per-card progress live in localStorage under the game's own key (v1,
 * no SaveFile change): read at mount, written once at the outcome.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
// eslint-disable-next-line no-restricted-imports -- src/games/shared holds cross-game helpers (CONTRACT.md section 2); eslint.config.js does not list it yet, see docs/review/notes/game-subject-scrolls.md
import { DECKS, SUBJECT_IDS, type SubjectId } from '../shared/decks';
import { useEngine } from '../ui/useEngine';
import { currentCard, engine, isOver, optionTexts } from './engine';
import game from './manifest';
import { STORAGE_KEY, deckStats, emptyStored, historyOf, mergeRun, parseStored, type Stored } from './progress';
import { strings } from './strings';
import styles from './Screen.module.css';

function readStored(): Stored {
  try {
    // eslint-disable-next-line no-restricted-globals -- deck choice and card progress are the player's study table (v1 lives in the game's own key; see the notes file)
    return parseStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyStored();
  }
}

function writeStored(value: Stored): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- same reason as in readStored
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private mode or full storage: progress is simply not kept */
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/.exec(url);
  return m?.[1] ?? url;
}

function TypeForm({ label, placeholder, submitLabel, onAnswer }: { label: string; placeholder: string; submitLabel: string; onAnswer: (text: string) => void }) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onAnswer(draft);
  };
  return (
    <form className={styles.typeForm} onSubmit={onSubmit}>
      <label className={styles.typeLabel} htmlFor="subject-scrolls-input">
        {label}
      </label>
      <input
        ref={input}
        id="subject-scrolls-input"
        data-testid="subject-scrolls-input"
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

export default function SubjectScrollsScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const over = isOver(state);
  const card = currentCard(state);
  const [stored] = useState<Stored>(() => readStored());
  const [lobby, setLobby] = useState(true);
  const [selected, setSelected] = useState<SubjectId[]>(stored.decks);
  // The partial order of the current deal (keyed by card and deal, so a card that comes back starts empty).
  const dealKey = `${state.currentId ?? ''}:${state.marks.length}`;
  const [pickState, setPickState] = useState<{ key: string; list: number[] }>({ key: '', list: [] });
  const picks = pickState.key === dealKey ? pickState.list : [];
  const setPicks = (update: (cur: number[]) => number[]) => setPickState((cur) => ({ key: dealKey, list: update(cur.key === dealKey ? cur.list : []) }));
  const saved = useRef(false);
  const nextButton = useRef<HTMLButtonElement>(null);

  // Keep the stored progress once, when the outcome appears.
  useEffect(() => {
    if (!outcome || saved.current) return;
    saved.current = true;
    writeStored(mergeRun(stored, state));
  }, [outcome, state, stored]);

  // The Next button takes focus when the explanation shows.
  useEffect(() => {
    if (state.explaining) nextButton.current?.focus();
  }, [state.explaining]);

  const begin = () => {
    if (selected.length === 0) return;
    const next = { ...stored, decks: selected };
    writeStored(next);
    dispatch({ type: 'setup', decks: selected, history: historyOf(next) });
    setLobby(false);
  };

  const toggleDeck = (subject: SubjectId) => {
    setSelected((cur) => (cur.includes(subject) ? cur.filter((d) => d !== subject) : SUBJECT_IDS.filter((d) => d === subject || cur.includes(d))));
  };

  const submitOrder = () => {
    if (!card?.steps || picks.length !== card.steps.length) return;
    dispatch({ type: 'order', order: picks });
  };

  useEffect(() => {
    if (over || lobby) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (state.explaining) return;
      if (state.mode === 'choice') {
        const n = Number(e.key);
        if (!Number.isInteger(n) || n < 1 || n > state.options.length) return;
        e.preventDefault();
        dispatch({ type: 'choose', index: n - 1 });
        return;
      }
      if (state.mode === 'ordered' && card?.steps) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= state.order.length) {
          e.preventDefault();
          const step = state.order[n - 1];
          if (step !== undefined) setPicks((cur) => (cur.includes(step) ? cur : [...cur, step]));
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          setPicks((cur) => cur.slice(0, -1));
        } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          submitOrder();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const open = new Set<string>(state.queue);
  if (state.currentId) open.add(state.currentId);
  const total = state.cardIds.length;
  const last = state.marks[state.marks.length - 1];
  const endText = outcome ? s.end[outcome.result] : null;
  const texts = card ? optionTexts(card) : [];
  const topic = card ? DECKS[card.subject].topics.find((t) => t.id === card.topic)?.name[locale] ?? card.topic : '';
  const answerText = card ? (card.steps && state.mode === 'ordered' ? card.steps.join(' → ') : card.answer) : '';
  const keysHelp = state.mode === 'choice' ? s.keysChoice : state.mode === 'typed' ? s.keysType : s.keysOrder;

  return (
    <SystemWindow
      className={cx(styles.room, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      actions={
        <>
          {over || lobby ? null : (
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

      {lobby && !over ? (
        <div className={styles.lobby} data-testid="subject-scrolls-lobby">
          <h3 className={styles.subtitle}>{s.lobby.title}</h3>
          <p className={cx('muted', styles.small)}>{s.cardsLanguage}</p>
          <ul className={styles.decks}>
            {SUBJECT_IDS.map((subject) => {
              const st = deckStats(stored, subject);
              const on = selected.includes(subject);
              const label = formatText(s.lobby.deck, { name: DECKS[subject].name[locale], total: st.total, seen: st.seen, mastered: st.mastered });
              const pct = st.total === 0 ? 0 : Math.round((100 * st.mastered) / st.total);
              return (
                <li key={subject}>
                  <button type="button" className={cx('btn', styles.deck)} aria-pressed={on} onClick={() => toggleDeck(subject)} data-testid={`subject-scrolls-deck-${subject}`}>
                    <span className={styles.ring} aria-hidden="true" style={{ ['--pct' as string]: `${pct}%` }}>
                      <span className={styles.ringLabel}>{pct}%</span>
                    </span>
                    <span className={styles.deckText}>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length === 0 ? <p className={styles.warn}>{s.lobby.none}</p> : null}
          <button type="button" className="btn btn--primary" onClick={begin} disabled={selected.length === 0} data-testid="subject-scrolls-begin">
            {s.lobby.begin}
          </button>
          <p className={cx('muted', styles.small)}>{s.lobby.keys}</p>
        </div>
      ) : (
        <>
          <p className={styles.status}>
            <span className="mono" data-testid="subject-scrolls-progress">
              {formatText(s.progress, { n: state.marks.length + (over || state.explaining ? 0 : 1), done: total - open.size, total })}
            </span>
            <span className="mono" data-testid="subject-scrolls-streak">
              {formatText(s.streak, { n: state.streak })}
            </span>
            <span className="mono">{formatText(s.hints, { n: state.hintsLeft })}</span>
          </p>

          <div className={styles.live} aria-live="polite" data-testid="subject-scrolls-live">
            {last && !over && state.explaining ? (
              <p className={styles.verdict} data-verdict={last.verdict}>
                {s.verdict[last.verdict]} {formatText(s.answerLine, { answer: answerText })}
              </p>
            ) : null}
            {endText ? (
              <p className={styles.banner} role="status" data-result={outcome?.result}>
                {endText}
              </p>
            ) : null}
          </div>

          {card && !over ? (
            <div className={styles.scroll} data-testid="subject-scrolls-card">
              <p className={styles.meta}>
                <span className={styles.tag}>{DECKS[card.subject].name[locale]}</span>
                <span className={styles.tag}>{topic}</span>
                <span className={styles.tag}>{s.tier[card.tier]}</span>
              </p>
              <p className={styles.prompt} data-testid="subject-scrolls-prompt">
                {card.prompt}
              </p>

              {state.explaining ? (
                <div className={styles.explain} data-testid="subject-scrolls-explain">
                  <p className={styles.explanation}>{card.explanation}</p>
                  <p className={styles.sourceLine}>
                    <a className={styles.sourceLink} href={card.sourceUrl} target="_blank" rel="noreferrer">
                      {s.source}: {hostOf(card.sourceUrl)}
                    </a>
                  </p>
                  <button ref={nextButton} type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'next' })} data-testid="subject-scrolls-next">
                    {s.next}
                  </button>
                  <p className={cx('muted', styles.small)}>{s.keysNext}</p>
                </div>
              ) : (
                <>
                  <h3 className={styles.subtitle}>{s.modes[state.mode]}</h3>
                  {state.revealed && state.mode === 'typed' ? <p className={styles.hintLine}>{formatText(s.firstLetters, { letters: card.answer.slice(0, card.answer.length > 8 ? 3 : 1) })}</p> : null}
                  {state.revealed && state.mode === 'ordered' && card.steps ? <p className={styles.hintLine}>{formatText(s.firstStep, { step: card.steps[0] ?? '' })}</p> : null}

                  {state.mode === 'choice' ? (
                    <ul className={styles.options} data-testid="subject-scrolls-options">
                      {state.options.map((opt, i) => (
                        <li key={opt}>
                          <button type="button" className={cx('btn', styles.option)} onClick={() => dispatch({ type: 'choose', index: i })}>
                            <span className={styles.key}>{i + 1}</span>
                            <span className={styles.optionText}>{texts[opt]}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : state.mode === 'typed' ? (
                    <TypeForm key={state.currentId ?? 'none'} label={s.modes.typed} placeholder={s.typePlaceholder} submitLabel={s.submit} onAnswer={(text) => dispatch({ type: 'type', text })} />
                  ) : (
                    <div className={styles.orderBox}>
                      <ul className={styles.options} data-testid="subject-scrolls-steps">
                        {state.order.map((step, i) => {
                          const pos = picks.indexOf(step);
                          return (
                            <li key={step}>
                              <button
                                type="button"
                                className={cx('btn', styles.option)}
                                aria-pressed={pos >= 0}
                                disabled={pos >= 0}
                                onClick={() => setPicks((cur) => (cur.includes(step) ? cur : [...cur, step]))}
                              >
                                <span className={styles.key}>{pos >= 0 ? `#${pos + 1}` : i + 1}</span>
                                <span className={styles.optionText}>{card.steps?.[step]}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <p className={styles.sequence} data-testid="subject-scrolls-sequence">
                        {picks.length === 0 ? s.sequenceEmpty : formatText(s.sequence, { list: picks.map((p) => card.steps?.[p] ?? '').join(' → ') })}
                      </p>
                      <div className={styles.toggles}>
                        <button type="button" className="btn" onClick={() => setPicks(() => [])} disabled={picks.length === 0}>
                          {s.clear}
                        </button>
                        <button type="button" className="btn btn--primary" onClick={submitOrder} disabled={picks.length !== (card.steps?.length ?? 0)} data-testid="subject-scrolls-order-submit">
                          {s.submit}
                        </button>
                      </div>
                    </div>
                  )}

                  <p className={cx('muted', styles.tools)}>
                    {keysHelp}
                    {state.hasStudy ? ` ${s.studyHelp}` : ''}
                    {state.hasSocial ? ` ${s.socialHelp}` : ''}
                  </p>
                  {state.hintsLeft > 0 && !state.revealed ? (
                    <div className={styles.toggles}>
                      <button type="button" className="btn" onClick={() => dispatch({ type: 'hint' })}>
                        {formatText(s.hint, { n: state.hintsLeft })}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </SystemWindow>
  );
}

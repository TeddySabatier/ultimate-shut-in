import { useId, useState, type FormEvent } from 'react';
import { DEFAULT_NAME, habits, NAME_MAX_LENGTH, strings, type Difficulty, type HabitId } from '../game';
import { habitIcons, logo } from '../assets';
import { useGameStore } from '../state/gameStore';
import { cx } from '../utils/cx';
import { Icon } from '../components/Icon';
import { SystemWindow } from '../components/SystemWindow';
import { Typewriter } from '../components/Typewriter';
import styles from './OnboardingScreen.module.css';

const DIFFICULTIES: readonly Difficulty[] = ['gentle', 'steady', 'hardcore'];

/** First launch: the opening vignette, a name, then habits and difficulty. */
export function OnboardingScreen() {
  const existing = useGameStore((s) => s.save);
  const finishOnboarding = useGameStore((s) => s.finishOnboarding);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(true);
  const [name, setName] = useState(existing?.player.name ?? '');
  const [enabled, setEnabled] = useState<HabitId[]>(
    () => existing?.settings.enabledHabits ?? habits.filter((h) => h.defaultEnabled).map((h) => h.id),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(existing?.settings.difficulty ?? 'steady');
  const nameId = useId();

  const toggleHabit = (id: HabitId) =>
    setEnabled((list) => (list.includes(id) ? (list.length > 1 ? list.filter((h) => h !== id) : list) : [...list, id]));

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const open = () => finishOnboarding(name.trim() === '' ? DEFAULT_NAME : name, { enabledHabits: enabled, difficulty });

  return (
    <div className={styles.screen}>
      <main className={styles.main}>
        <img src={logo.title} alt={strings.app.name} className={styles.logo} width={240} height={90} />
        <p className={cx('muted', styles.step)} aria-live="polite">
          Step {step + 1} of 3
        </p>

        {step === 0 ? (
          <SystemWindow
            title="Protocol online"
            headingLevel={1}
            tone="accent"
            actions={
              <>
                {typing ? (
                  <button type="button" className="btn" onClick={() => setTyping(false)}>
                    Skip
                  </button>
                ) : null}
                <button type="button" className="btn btn--primary" onClick={() => setStep(1)}>
                  Continue
                </button>
              </>
            }
          >
            <p className={styles.vignette}>
              <Typewriter text={strings.opening} speed={16} active={typing} onDone={() => setTyping(false)} />
            </p>
          </SystemWindow>
        ) : null}

        {step === 1 ? (
          <form onSubmit={submitName}>
            <SystemWindow
              title="Register the Absolute"
              headingLevel={1}
              tone="accent"
              actions={
                <>
                  <button type="button" className="btn" onClick={() => setStep(0)}>
                    Back
                  </button>
                  <button type="submit" className="btn btn--primary">
                    Continue
                  </button>
                </>
              }
            >
              <p>The one who stays home and keeps the books. What should the Ledger call you?</p>
              <label htmlFor={nameId} className={styles.label}>
                Name
              </label>
              <input
                id={nameId}
                type="text"
                value={name}
                placeholder={DEFAULT_NAME}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                autoComplete="nickname"
                className={styles.nameInput}
              />
              <p className={cx('muted', styles.help)}>1 to {NAME_MAX_LENGTH} characters. Leave it and you are "{DEFAULT_NAME}".</p>
            </SystemWindow>
          </form>
        ) : null}

        {step === 2 ? (
          <SystemWindow
            title="Assign the vassals"
            headingLevel={1}
            tone="accent"
            actions={
              <>
                <button type="button" className="btn" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="btn btn--primary" onClick={open}>
                  Open the Haven
                </button>
              </>
            }
          >
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Habits to track (at least one)</legend>
              <ul className={styles.habitList}>
                {habits.map((h) => {
                  const on = enabled.includes(h.id);
                  return (
                    <li key={h.id}>
                      <label htmlFor={`${nameId}-habit-${h.id}`} className={cx(styles.habit, on && styles.habitOn)} style={{ color: h.color }}>
                        <input
                          id={`${nameId}-habit-${h.id}`}
                          type="checkbox"
                          aria-label={h.label}
                          checked={on}
                          onChange={() => toggleHabit(h.id)}
                          disabled={on && enabled.length === 1}
                        />
                        <Icon src={habitIcons[h.id]} size={22} />
                        <span className={styles.habitText}>
                          <span className={styles.habitLabel}>{h.label}</span>
                          <span className={cx('muted', styles.habitDesc)}>
                            {h.vassal.name} {h.vassal.epithet}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Pace</legend>
              <ul className={styles.choiceList}>
                {DIFFICULTIES.map((d) => (
                  <li key={d}>
                    <label htmlFor={`${nameId}-pace-${d}`} className={cx(styles.choice, difficulty === d && styles.choiceOn)}>
                      <input
                        id={`${nameId}-pace-${d}`}
                        type="radio"
                        name="difficulty"
                        value={d}
                        aria-label={strings.difficulty[d].label}
                        checked={difficulty === d}
                        onChange={() => setDifficulty(d)}
                      />
                      <span>
                        <span className={styles.choiceLabel}>{strings.difficulty[d].label}</span>
                        <span className={cx('muted', styles.choiceDesc)}>{strings.difficulty[d].blurb}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </SystemWindow>
        ) : null}
      </main>
    </div>
  );
}

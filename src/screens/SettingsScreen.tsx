import { useId, useRef, useState, type ChangeEvent } from 'react';
import { exportSave, habits, strings, type Benevolence, type Difficulty, type HabitId } from '../game';
import { habitIcons } from '../assets';
import { useGameStore, useSave } from '../state/gameStore';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { cx } from '../utils/cx';
import { hourLabel } from '../utils/format';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { SystemWindow } from '../components/SystemWindow';
import styles from './SettingsScreen.module.css';

const DIFFICULTIES: readonly Difficulty[] = ['gentle', 'steady', 'hardcore'];
const BENEVOLENCES: readonly Benevolence[] = ['benevolent', 'strict'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const RESET_CONFIRM = 'RESET';

function HourSelect({ id, value, onChange }: { id: string; value: number; onChange: (h: number) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  );
}

export function SettingsScreen() {
  const save = useSave();
  const updateSettings = useGameStore((s) => s.updateSettings);
  const resetSave = useGameStore((s) => s.resetSave);
  const importSave = useGameStore((s) => s.importSave);
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { reset: useId(), lights: useId(), wake: useId(), motion: useId(), file: useId() };
  const settings = save.settings;

  const toggleHabit = (id: HabitId) => {
    const on = settings.enabledHabits.includes(id);
    const next = on ? settings.enabledHabits.filter((h) => h !== id) : [...settings.enabledHabits, id];
    if (next.length === 0) return;
    updateSettings({ enabledHabits: next });
  };

  const onExport = () => {
    const text = exportSave(save);
    if (typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `haven-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setPendingImport(parsed);
    } catch {
      setImportError('That file could not be read as a save.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <h1>Settings</h1>

      <SystemWindow title="Pace">
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Difficulty</legend>
          <ul className={styles.choices}>
            {DIFFICULTIES.map((d) => (
              <li key={d}>
                <label htmlFor={`${ids.reset}-pace-${d}`} className={cx(styles.choice, settings.difficulty === d && styles.choiceOn)}>
                  <input
                    id={`${ids.reset}-pace-${d}`}
                    type="radio"
                    name="difficulty"
                    value={d}
                    aria-label={strings.difficulty[d].label}
                    checked={settings.difficulty === d}
                    onChange={() => updateSettings({ difficulty: d })}
                  />
                  <span>
                    <span className={styles.choiceLabel}>{strings.difficulty[d].label}</span>
                    <span className={cx('muted', styles.choiceDesc)}>{strings.difficulty[d].blurb}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className={cx('muted', styles.help)}>Takes effect on the next board.</p>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Benevolence</legend>
          <ul className={styles.choices}>
            {BENEVOLENCES.map((b) => (
              <li key={b}>
                <label htmlFor={`${ids.reset}-benev-${b}`} className={cx(styles.choice, settings.benevolence === b && styles.choiceOn)}>
                  <input
                    id={`${ids.reset}-benev-${b}`}
                    type="radio"
                    name="benevolence"
                    value={b}
                    aria-label={strings.benevolence[b].label}
                    checked={settings.benevolence === b}
                    onChange={() => updateSettings({ benevolence: b })}
                  />
                  <span>
                    <span className={styles.choiceLabel}>{strings.benevolence[b].label}</span>
                    <span className={cx('muted', styles.choiceDesc)}>{strings.benevolence[b].blurb}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className={cx('muted', styles.help)}>
            Benevolent is the default and vassals never leave. In Strict mode a vassal who reaches 0 loyalty takes leave: their quests pause, the card greys
            out, and one tap on Welcome back returns them at 50 loyalty. Level, XP and lifetime counts are kept either way.
          </p>
        </fieldset>
      </SystemWindow>

      <SystemWindow title="Habits">
        <ul className={styles.habits}>
          {habits.map((h) => {
            const on = settings.enabledHabits.includes(h.id);
            const last = on && settings.enabledHabits.length === 1;
            return (
              <li key={h.id}>
                <label htmlFor={`${ids.reset}-habit-${h.id}`} className={cx(styles.habit, on && styles.habitOn)} style={{ color: h.color }}>
                  <input
                    id={`${ids.reset}-habit-${h.id}`}
                    type="checkbox"
                    aria-label={h.label}
                    checked={on}
                    disabled={last}
                    onChange={() => toggleHabit(h.id)}
                    aria-describedby={last ? `${ids.reset}-min` : undefined}
                  />
                  <Icon src={habitIcons[h.id]} size={22} />
                  <span className={styles.habitText}>
                    <span className={styles.habitLabel}>{h.label}</span>
                    <span className={cx('muted', styles.habitDesc)}>{h.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p id={`${ids.reset}-min`} className={cx('muted', styles.help)}>
          At least one habit stays on. Disabling a habit hides its vassal and utility and freezes them; the board changes from tomorrow.
        </p>
      </SystemWindow>

      <SystemWindow title="Hours">
        <div className={styles.row}>
          <label htmlFor={ids.reset}>{strings.ui.resetHour}</label>
          <HourSelect id={ids.reset} value={settings.resetHour} onChange={(h) => updateSettings({ resetHour: h })} />
        </div>
        <p className={cx('muted', styles.help)}>Today keeps its board; the next boundary happens at the new hour.</p>
        <div className={styles.row}>
          <label htmlFor={ids.lights}>{strings.ui.lightsOut}</label>
          <HourSelect id={ids.lights} value={settings.lightsOutHour} onChange={(h) => updateSettings({ lightsOutHour: h })} />
        </div>
        <div className={styles.row}>
          <label htmlFor={ids.wake}>{strings.ui.wakeHour}</label>
          <HourSelect id={ids.wake} value={settings.wakeHour} onChange={(h) => updateSettings({ wakeHour: h })} />
        </div>
        <p className={cx('muted', styles.help)}>Sleep quests refer to these hours, never to the clock on the device.</p>
      </SystemWindow>

      <SystemWindow title="Display">
        <label className={styles.toggle} htmlFor={ids.motion}>
          <input id={ids.motion} type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.target.checked })} />
          <span>Reduce motion (no typing effect, no glow, numbers appear at once)</span>
        </label>
        {isInstalled ? (
          <p className="muted">Installed as an app.</p>
        ) : canInstall ? (
          <button type="button" className="btn btn--primary" onClick={() => void promptInstall()}>
            Install app
          </button>
        ) : (
          <p className="muted">To install, use your browser's "Add to Home Screen".</p>
        )}
      </SystemWindow>

      <SystemWindow title="Save file">
        <div className={styles.actions}>
          <button type="button" className="btn" onClick={onExport}>
            Export save
          </button>
          <label className="btn" htmlFor={ids.file}>
            Import save
          </label>
          <input ref={fileRef} id={ids.file} type="file" accept="application/json,.json" className="srOnly" onChange={(e) => void onPickFile(e)} />
        </div>
        {importError ? <p className={styles.error}>{importError}</p> : null}
        <p className={cx('muted', styles.help)}>The save is a JSON file. Importing replaces everything in this Haven.</p>
      </SystemWindow>

      <SystemWindow title="Reset" tone="danger">
        <p>Start over with a new Haven. Everything in the Ledger goes; export first if you want it kept.</p>
        <button type="button" className="btn btn--danger" onClick={() => setResetOpen(true)}>
          Reset everything
        </button>
      </SystemWindow>

      <SystemWindow title="About">
        <p>
          <strong>{strings.app.name}</strong> v{__APP_VERSION__}
        </p>
        <p className="muted">{strings.app.tagline}</p>
        <p className={cx('muted', styles.help)}>{strings.app.nonAffiliation}</p>
      </SystemWindow>

      <ConfirmDialog
        open={resetOpen}
        title="Reset everything?"
        danger
        confirmLabel="Reset"
        confirmText={RESET_CONFIRM}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false);
          resetSave();
        }}
      >
        <p>The Haven, the Ledger and every vassal start again from one room.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingImport !== null}
        title="Import this save?"
        confirmLabel="Import"
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          const raw = pendingImport;
          setPendingImport(null);
          if (raw !== null) importSave(raw);
        }}
      >
        <p>The current Haven is replaced by the file. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

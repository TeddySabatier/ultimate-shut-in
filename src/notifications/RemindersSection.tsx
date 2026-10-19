import { useEffect, useId, useState } from 'react';
import { strings } from '../game';
import { useSave } from '../state/gameStore';
import { cx } from '../utils/cx';
import { hourLabel } from '../utils/format';
import { SystemWindow } from '../components/SystemWindow';
import { useReminderPrefs, type ReminderPrefs } from './prefs';
import { notificationPermission, requestNotificationPermission } from './runtime';
import styles from './RemindersSection.module.css';

const ui = strings.reminders.ui;

function toTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function fromTimeValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** Settings window for the opt-in local reminders. Permission is asked on the master toggle tap only. */
export function RemindersSection() {
  const save = useSave();
  const [prefs, setPrefs] = useReminderPrefs();
  const [permission, setPermission] = useState(notificationPermission);
  const [attempted, setAttempted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ids = { master: useId(), board: useId(), wave: useId(), timer: useId(), boardTime: useId(), waveTime: useId() };

  // The user may change the site permission in the browser UI and come back.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setPermission(notificationPermission());
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  const unsupported = permission === 'unsupported';
  const active = prefs.enabled && permission === 'granted';
  // The explanation shows once the user tried to turn reminders on (or they were on and got revoked), not to everyone who blocked notifications.
  const blocked = permission === 'denied' && (attempted || prefs.enabled);

  const onMaster = async (checked: boolean) => {
    setDismissed(false);
    setAttempted(checked);
    if (!checked) {
      setPrefs({ ...prefs, enabled: false });
      return;
    }
    if (unsupported) return;
    const result = permission === 'default' ? await requestNotificationPermission() : permission;
    setPermission(result);
    if (result === 'granted') setPrefs({ ...prefs, enabled: true });
    else setDismissed(result === 'default');
  };

  const patch = (next: Partial<ReminderPrefs>) => setPrefs({ ...prefs, ...next });
  const { lightsOutHour, wakeHour } = save.settings;

  return (
    <SystemWindow title={ui.window}>
      <p className={cx('muted', styles.intro)}>{ui.intro}</p>
      <label className={styles.toggle} htmlFor={ids.master}>
        <input
          id={ids.master}
          type="checkbox"
          checked={active}
          disabled={unsupported}
          aria-describedby={`${ids.master}-note`}
          onChange={(e) => void onMaster(e.target.checked)}
        />
        <span>{ui.master}</span>
      </label>
      <div id={`${ids.master}-note`}>
        {unsupported ? <p className={styles.note}>{ui.unsupported}</p> : null}
        {blocked ? (
          <p className={styles.note} role="status">
            {ui.denied}
          </p>
        ) : null}
        {dismissed && !blocked ? (
          <p className={styles.note} role="status">
            {ui.dismissed}
          </p>
        ) : null}
      </div>

      {active ? (
        <ul className={styles.list}>
          <li className={styles.item}>
            <label className={styles.toggle} htmlFor={ids.board}>
              <input id={ids.board} type="checkbox" aria-label={ui.board.label} checked={prefs.board.on} onChange={(e) => patch({ board: { ...prefs.board, on: e.target.checked } })} />
              <span className={styles.text}>
                <span className={styles.label}>{ui.board.label}</span>
                <span className={cx('muted', styles.help)}>{ui.board.help}</span>
              </span>
            </label>
            <input
              id={ids.boardTime}
              type="time"
              className={styles.time}
              aria-label={`${ui.board.label} ${ui.timeSuffix}`}
              value={toTimeValue(prefs.board.minutes)}
              disabled={!prefs.board.on}
              onChange={(e) => {
                const minutes = fromTimeValue(e.target.value);
                if (minutes !== null) patch({ board: { ...prefs.board, minutes } });
              }}
            />
          </li>
          <li className={styles.item}>
            <label className={styles.toggle} htmlFor={ids.wave}>
              <input id={ids.wave} type="checkbox" aria-label={ui.wave.label} checked={prefs.wave.on} onChange={(e) => patch({ wave: { ...prefs.wave, on: e.target.checked } })} />
              <span className={styles.text}>
                <span className={styles.label}>{ui.wave.label}</span>
                <span className={cx('muted', styles.help)}>{ui.wave.help}</span>
              </span>
            </label>
            <input
              id={ids.waveTime}
              type="time"
              className={styles.time}
              aria-label={`${ui.wave.label} ${ui.timeSuffix}`}
              value={toTimeValue(prefs.wave.minutes)}
              disabled={!prefs.wave.on}
              onChange={(e) => {
                const minutes = fromTimeValue(e.target.value);
                if (minutes !== null) patch({ wave: { ...prefs.wave, minutes } });
              }}
            />
          </li>
          <li className={styles.item}>
            <label className={styles.toggle} htmlFor={ids.timer}>
              <input id={ids.timer} type="checkbox" aria-label={ui.timer.label} checked={prefs.timer.on} onChange={(e) => patch({ timer: { on: e.target.checked } })} />
              <span className={styles.text}>
                <span className={styles.label}>{ui.timer.label}</span>
                <span className={cx('muted', styles.help)}>{ui.timer.help}</span>
              </span>
            </label>
          </li>
        </ul>
      ) : null}

      <p className={cx('muted', styles.help)}>{ui.honesty}</p>
      {active ? <p className={cx('muted', styles.help)}>{ui.quiet.replace('{from}', hourLabel(lightsOutHour)).replace('{to}', hourLabel(wakeHour))}</p> : null}
    </SystemWindow>
  );
}

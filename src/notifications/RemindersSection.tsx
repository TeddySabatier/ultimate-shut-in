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

type TimedKind = 'board' | 'wave';

/** Settings window for the opt-in local reminders. Permission is asked on the master toggle tap only. */
export function RemindersSection() {
  const save = useSave();
  const [prefs, setPrefs] = useReminderPrefs();
  const [permission, setPermission] = useState(notificationPermission);
  const [attempted, setAttempted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const uid = useId();
  const ids = {
    intro: `${uid}-intro`,
    note: `${uid}-note`,
    honesty: `${uid}-honesty`,
    master: `${uid}-master`,
    board: `${uid}-board`,
    wave: `${uid}-wave`,
    timer: `${uid}-timer`,
  };

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

  /** Writes the prefs; when the browser will not keep them the switch stays as it was and a note says so. */
  const persist = (next: ReminderPrefs): boolean => {
    const ok = setPrefs(next);
    setSaveFailed(!ok);
    return ok;
  };

  const onMaster = async (checked: boolean) => {
    setDismissed(false);
    setSaveFailed(false);
    setAttempted(checked);
    if (!checked) {
      persist({ ...prefs, enabled: false });
      return;
    }
    if (unsupported) return;
    const result = permission === 'default' ? await requestNotificationPermission() : permission;
    setPermission(result);
    if (result === 'granted') persist({ ...prefs, enabled: true });
    else setDismissed(result === 'default');
  };

  const setTime = (kind: TimedKind, value: string) => {
    const minutes = fromTimeValue(value);
    if (minutes !== null) persist({ ...prefs, [kind]: { ...prefs[kind], minutes } });
  };
  const { lightsOutHour, wakeHour } = save.settings;

  const timed = (kind: TimedKind) => (
    <li className={styles.item}>
      <div className={styles.text}>
        <label className={styles.toggle} htmlFor={ids[kind]}>
          <input
            id={ids[kind]}
            type="checkbox"
            aria-describedby={`${ids[kind]}-help`}
            checked={prefs[kind].on}
            onChange={(e) => persist({ ...prefs, [kind]: { ...prefs[kind], on: e.target.checked } })}
          />
          <span className={styles.label}>{ui[kind].label}</span>
        </label>
        <span id={`${ids[kind]}-help`} className={cx('muted', styles.help, styles.indented)}>
          {ui[kind].help}
        </span>
      </div>
      <input
        type="time"
        className={styles.time}
        aria-label={`${ui[kind].label} ${ui.timeSuffix}`}
        value={toTimeValue(prefs[kind].minutes)}
        disabled={!prefs[kind].on}
        onChange={(e) => setTime(kind, e.target.value)}
      />
    </li>
  );

  return (
    <SystemWindow title={ui.window}>
      <p id={ids.intro} className={cx('muted', styles.intro)}>
        {ui.intro}
      </p>
      <label className={styles.toggle} htmlFor={ids.master}>
        <input
          id={ids.master}
          type="checkbox"
          checked={active}
          disabled={unsupported}
          aria-describedby={`${ids.intro} ${ids.honesty} ${ids.note}`}
          onChange={(e) => void onMaster(e.target.checked)}
        />
        <span>{ui.master}</span>
      </label>
      <div id={ids.note}>
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
        {saveFailed ? (
          <p className={styles.note} role="status">
            {ui.saveFailed}
          </p>
        ) : null}
      </div>

      {active ? (
        <ul className={styles.list}>
          {timed('board')}
          {timed('wave')}
          <li className={styles.item}>
            <div className={styles.text}>
              <label className={styles.toggle} htmlFor={ids.timer}>
                <input
                  id={ids.timer}
                  type="checkbox"
                  aria-describedby={`${ids.timer}-help`}
                  checked={prefs.timer.on}
                  onChange={(e) => persist({ ...prefs, timer: { on: e.target.checked } })}
                />
                <span className={styles.label}>{ui.timer.label}</span>
              </label>
              <span id={`${ids.timer}-help`} className={cx('muted', styles.help, styles.indented)}>
                {ui.timer.help}
              </span>
            </div>
          </li>
        </ul>
      ) : null}

      <p id={ids.honesty} className={cx('muted', styles.help)}>
        {ui.honesty}
      </p>
      {active ? <p className={cx('muted', styles.help)}>{ui.quiet.replace('{from}', hourLabel(lightsOutHour)).replace('{to}', hourLabel(wakeHour))}</p> : null}
    </SystemWindow>
  );
}

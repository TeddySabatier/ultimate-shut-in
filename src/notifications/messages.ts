import { DAY_MS, strings } from '../game';
import type { PlannedReminder } from './scheduler';

export interface ReminderMessage {
  title: string;
  body: string;
}

/** System-window voice: title "SYSTEM", then a warm one-liner that changes by day. */
export function reminderMessage(r: PlannedReminder): ReminderMessage {
  const pool = strings.reminders[r.kind];
  const line = pool[Math.floor(r.at / DAY_MS) % pool.length] ?? pool[0] ?? '';
  return { title: strings.reminders.title, body: line.replace('{quest}', r.label ?? 'Your quest') };
}

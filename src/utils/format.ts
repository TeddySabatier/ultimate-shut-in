/** Display formatting helpers. No game logic lives here. */

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** `mm:ss` from a millisecond duration (hours fold into minutes). */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** `04:00` from an hour of the day. */
export function hourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

/** "9h" / "45m" for a millisecond duration ahead. */
export function roughDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

/** Signed delta for reward lines: "+24". */
export function signed(n: number): string {
  return n >= 0 ? `+${fmtNum(n)}` : `-${fmtNum(Math.abs(n))}`;
}

/** "25 min", "x8" or "Check": the effort of a quest in a few characters. */
export function effortLabel(kind: 'check' | 'timer' | 'count', durationMin?: number, targetCount?: number): string {
  if (kind === 'timer' && durationMin !== undefined) return `${durationMin} min`;
  if (kind === 'count' && targetCount !== undefined) return `x${targetCount}`;
  return 'Check';
}

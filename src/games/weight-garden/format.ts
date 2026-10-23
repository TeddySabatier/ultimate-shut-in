/** Small text helpers shared by the Screen and the curves. */
import { formatText } from '../contract';
import type { HistoryEntry } from './engine';
import { strings } from './strings';

export function fmtLoss(l: number): string {
  return l >= 99 ? '99+' : l.toFixed(2);
}

/** The text a screen reader gets for a curve. */
export function lossAlt(history: readonly HistoryEntry[], locale: 'en' | 'fr'): string {
  const s = strings[locale].chart;
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return s.empty;
  return formatText(s.loss, { from: fmtLoss(first.l), to: fmtLoss(last.l) });
}

export function accAlt(history: readonly HistoryEntry[], locale: 'en' | 'fr'): string {
  const s = strings[locale].chart;
  const last = history[history.length - 1];
  if (!last) return s.empty;
  return formatText(s.acc, { tr: last.tr, te: last.te });
}


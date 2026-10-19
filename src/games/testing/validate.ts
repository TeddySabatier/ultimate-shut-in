/**
 * Small validators shared by the contract kit, `useEngine` (development
 * warnings) and the Games Lab (outcome problems in red). No fixtures, no
 * vitest: cheap to import from a Screen.
 */
import { GAME_RESULTS, MAX_SCORE, type Outcome } from '../contract';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Problems with a `{ en, fr }` text: both non-empty, at most `maxLength` characters, no other key. */
export function localizedProblems(v: unknown, path: string, maxLength: number, out: string[]): void {
  if (!isRecord(v)) {
    out.push(`${path} must be { en: string; fr: string }`);
    return;
  }
  for (const locale of ['en', 'fr'] as const) {
    const text = v[locale];
    if (!nonEmptyString(text)) out.push(`${path}.${locale} must be a non-empty string`);
    else if (text.length > maxLength) out.push(`${path}.${locale} is ${text.length} characters (at most ${maxLength})`);
  }
  for (const k of Object.keys(v)) if (k !== 'en' && k !== 'fr') out.push(`${path}.${k}: unknown locale (only en and fr)`);
}

/** Problems that make `value` something other than plain JSON data (at most `limit` of them). */
export function plainDataProblems(value: unknown, path: string, out: string[], limit = 5): void {
  if (out.length >= limit) return;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value} (numbers must be finite)`);
    return;
  }
  if (value === undefined) {
    out.push(`${path} is undefined (omit the key or use null)`);
    return;
  }
  if (typeof value !== 'object') {
    out.push(`${path} is a ${typeof value} (state and actions must be plain JSON data)`);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) {
        out.push(`${path}[${i}] is a hole (sparse array: fill every index)`);
        return;
      }
      plainDataProblems(value[i], `${path}[${i}]`, out, limit);
    }
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
    out.push(`${path} is a ${name} instance (use plain objects and arrays, no Map, Set, Date, typed arrays or classes)`);
    return;
  }
  for (const [k, v] of Object.entries(value)) plainDataProblems(v, `${path}.${k}`, out, limit);
}

const OUTCOME_KEYS = ['result', 'score', 'log', 'troopsUsed', 'durationMs', 'learned', 'stats'];

/** Problems with one outcome, given the ids of the party that played. Empty when it is valid. */
export function outcomeProblems(o: Outcome | null | undefined, partyIds: readonly string[]): string[] {
  const out: string[] = [];
  if (!isRecord(o)) return ['outcome must be an object'];
  for (const k of Object.keys(o)) if (!OUTCOME_KEYS.includes(k)) out.push(`outcome.${k}: unknown field`);
  if (!(GAME_RESULTS as readonly unknown[]).includes(o.result)) out.push(`result ${JSON.stringify(o.result)} must be won, lost or fled`);
  if (!Number.isInteger(o.score) || o.score < 0 || o.score > MAX_SCORE) out.push(`score ${String(o.score)} must be an integer from 0 to ${MAX_SCORE} (use clampScore)`);
  if (!Array.isArray(o.log) || o.log.length === 0) out.push('log must have at least one line');
  else
    o.log.forEach((line, i) => {
      if (!nonEmptyString(line)) out.push(`log[${i}] must be a non-empty string`);
    });
  if (!Array.isArray(o.troopsUsed)) out.push('troopsUsed must be an array of member ids');
  else {
    const seen = new Set<string>();
    for (const id of o.troopsUsed) {
      if (!partyIds.includes(id)) out.push(`troopsUsed has "${String(id)}", which is not in the party (${partyIds.join(', ')})`);
      if (seen.has(id)) out.push(`troopsUsed lists "${id}" twice`);
      seen.add(id);
    }
  }
  if (o.durationMs !== undefined && !(typeof o.durationMs === 'number' && Number.isFinite(o.durationMs) && o.durationMs >= 0)) out.push('durationMs must be a finite number >= 0');
  if (o.learned !== undefined) {
    if (!isRecord(o.learned)) out.push('learned must be { topic, note }');
    else {
      localizedProblems(o.learned.topic, 'learned.topic', 100, out);
      localizedProblems(o.learned.note, 'learned.note', 400, out);
    }
  }
  if (o.stats !== undefined) {
    if (!isRecord(o.stats)) out.push('stats must be a record');
    else for (const [k, v] of Object.entries(o.stats)) if (!(typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) out.push(`stats.${k} must be a finite number or a string`);
  }
  plainDataProblems(o, 'outcome', out);
  return out;
}

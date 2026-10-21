/**
 * Pieces and monsters drawn in code (SVG, no assets). Allies are outlined or
 * filled chess-like silhouettes, monsters are rounded creatures with eyes, and
 * the shapes differ so colour is never the only signal.
 */
import type { EnemyKind, IntentVerb, PieceKind } from './engine';

const PIECE_PATHS: Record<PieceKind, string> = {
  knight: 'M6 21h13v-2c0-5-2-7-4-9l2-3-2-5-3 3-5 4-1 4 3 1 2-2-1 3c-2 2-4 3-4 6z',
  bishop: 'M12 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 7c-3 2-5 5-3 8l-2 2h10l-2-2c2-3 0-6-3-8zM6 19h12v2H6z',
  rook: 'M6 4h3v2h2V4h2v2h2V4h3v6l-2 2v5l2 2v2H6v-2l2-2v-5l-2-2z',
  queenLite: 'M4 8l3 6 2-8 3 7 3-7 2 8 3-6-2 12H6z',
  king: 'M11 1.5h2V3h1.5v2H13v2h-2V5H9.5V3H11zM7 9h10l1.5 11h-13z',
  pawn: 'M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM8 20c0-4 1-6 4-6s4 2 4 6z',
  rookLite: 'M6 4h3v2h2V4h2v2h2V4h3v6l-2 2v5l2 2v2H6v-2l2-2v-5l-2-2z',
  bishopLite: 'M12 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 7c-3 2-5 5-3 8l-2 2h10l-2-2c2-3 0-6-3-8zM6 19h12v2H6z',
};

const LITE: ReadonlySet<PieceKind> = new Set<PieceKind>(['rookLite', 'bishopLite']);

const ENEMY_PATHS: Record<EnemyKind, string> = {
  blob: 'M12 4c5 0 8 4 8 9 0 4-3 7-8 7s-8-3-8-7c0-5 3-9 8-9z',
  moth: 'M12 7L3 3l3 9-3 8 9-4 9 4-3-8 3-9z',
  wyrm: 'M2 17c3-9 6 3 10-5s7 3 10-4v8c-3 7-7-3-10 5s-7-4-10 4z',
  bunny: 'M7 2c2 0 3 5 3 7H5c0-2 0-7 2-7zM17 2c2 0 2 5 2 7h-5c0-2 1-7 3-7zM12 8a7 7 0 1 1 0 14 7 7 0 0 1 0-14z',
  golem: 'M4 6h16v5h2v7h-4v3H6v-3H2v-7h2z',
  leech: 'M12 2c4 5 8 8 8 13a8 8 0 0 1-16 0c0-5 4-8 8-13z',
  wraith: 'M5 21V11a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2z',
  imp: 'M3 2l6 5h6l6-5-1 9c1 6-3 11-8 11s-9-5-8-11z',
  specter: 'M12 2c-5 0-8 5-8 10l3 9 2-3 3 3 3-3 2 3 3-9c0-5-3-10-8-10z',
  static: 'M12 1l3 7 8-2-5 6 5 6-8-1-3 7-3-7-8 1 5-6-5-6 8 2z',
};

export function PieceGlyph({ kind, fallen = false }: { kind: PieceKind; fallen?: boolean }) {
  const lite = LITE.has(kind);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="100%" height="100%">
      <path
        d={PIECE_PATHS[kind]}
        fill={lite || fallen ? 'none' : 'var(--color-info)'}
        stroke="var(--color-info)"
        strokeWidth={lite || fallen ? 1.6 : 0.8}
        strokeLinejoin="round"
        strokeDasharray={fallen ? '2 2' : undefined}
      />
    </svg>
  );
}

export function EnemyGlyph({ kind }: { kind: EnemyKind }) {
  const boss = kind === 'static';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="100%" height="100%">
      <path d={ENEMY_PATHS[kind]} fill={boss ? 'var(--color-accent-2)' : 'var(--color-danger)'} stroke="var(--color-bg)" strokeWidth="0.8" strokeLinejoin="round" />
      <circle cx="9" cy="13" r="1.5" fill="var(--color-bg)" />
      <circle cx="15" cy="13" r="1.5" fill="var(--color-bg)" />
    </svg>
  );
}

const INTENT_PATHS: Record<Exclude<IntentVerb, 'wait'>, string> = {
  step: 'M3 2l6 6-6 6',
  strike: 'M3 3l10 10M13 3L3 13',
  split: 'M8 2v12M2 8h12',
  drain: 'M8 2c3 4 5 6 5 8a5 5 0 0 1-10 0c0-2 2-4 5-8z',
};

/** A small mark in the corner of the square a monster is about to act on. */
export function IntentMark({ verb }: { verb: IntentVerb }) {
  if (verb === 'wait') return null;
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" width="100%" height="100%">
      <path d={INTENT_PATHS[verb]} fill="none" stroke="var(--color-danger)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

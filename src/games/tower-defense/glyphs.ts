/**
 * One glyph per tower, as SVG path data in a 24 by 24 box: chevrons, rays, a fan,
 * notes, a book, a crescent, a flame, rings. The cards draw them as inline SVG and
 * the canvas strokes the same paths, so a tower is told apart by shape and letter,
 * never by colour alone.
 */
import type { MonsterId, TowerKind } from './engine';

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const GLYPH: Record<TowerKind, string> = {
  runner: 'M5 5l7 7-7 7M12 5l7 7-7 7',
  lantern: `${circle(12, 12, 4)}M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M20 4l-2 2M6 18l-2 2`,
  sweeper: 'M3 9Q12 0 21 9M12 20L3 9M12 20L8 5M12 20V3M12 20L16 5M12 20L21 9',
  chorus: `M9 18V6l10-2v12${circle(6.5, 18, 2.5)}${circle(16.5, 16, 2.5)}`,
  archivist: 'M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z',
  lull: 'M17 3a9 9 0 1 0 4 12A7 7 0 0 1 17 3z',
  hearth: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 1 1 2 2 3 1-2 1-5 1-8z',
  bubble: `${circle(9, 15, 5)}${circle(17, 7, 3)}${circle(18, 17, 2)}`,
};

/** The design token each tower is drawn with (the habit colours of src/styles/tokens.css). */
export const TOWER_TOKEN: Record<TowerKind, string> = {
  runner: '--habit-move',
  lantern: '--habit-outside',
  sweeper: '--habit-clean',
  chorus: '--habit-social',
  archivist: '--habit-study',
  lull: '--habit-sleep',
  hearth: '--habit-eat',
  bubble: '--habit-hygiene',
};

export const TOWER_FALLBACK: Record<TowerKind, string> = {
  runner: '#f2893b',
  lantern: '#5ba7d9',
  sweeper: '#7c8fb8',
  chorus: '#e0b33a',
  archivist: '#a98bd6',
  lull: '#5e6ed8',
  hearth: '#d9774f',
  bubble: '#4fc3c7',
};

/** Body shape of a monster on the canvas: 0 round, 1 square, 2 diamond, 3 hexagon. */
export const MONSTER_SHAPE: Record<MonsterId, number> = {
  'clutter-blob': 0,
  'dust-bunny': 0,
  'procrastination-moth': 2,
  'junk-food-imp': 1,
  'fog-wraith': 2,
  'couch-leech': 1,
  'snooze-golem': 1,
  'silence-specter': 2,
  'doomscroll-wyrm': 3,
  'the-static': 3,
};

/** Body radius of a monster, in tenths of a cell. */
export const MONSTER_SIZE: Record<MonsterId, number> = {
  'clutter-blob': 2,
  'dust-bunny': 1.4,
  'procrastination-moth': 1.6,
  'junk-food-imp': 1.8,
  'fog-wraith': 2,
  'couch-leech': 2.4,
  'snooze-golem': 2.8,
  'silence-specter': 2,
  'doomscroll-wyrm': 3,
  'the-static': 3.6,
};

/** Which of the seven monster colours of the palette a monster wears. */
export const MONSTER_TONE: Record<MonsterId, number> = {
  'clutter-blob': 0,
  'dust-bunny': 5,
  'procrastination-moth': 2,
  'junk-food-imp': 1,
  'fog-wraith': 4,
  'couch-leech': 3,
  'snooze-golem': 6,
  'silence-specter': 5,
  'doomscroll-wyrm': 1,
  'the-static': 2,
};

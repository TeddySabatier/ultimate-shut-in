/**
 * The small pictures of Maze Learner, drawn in code (SVG, no files). Every
 * shape differs from the others by outline, not only by colour, so the board
 * reads in greyscale: a cheese wedge with holes, a drop with a minus for the
 * puddle, a house, doors with one or three pips, a star.
 */
import type { CSSProperties } from 'react';

interface GlyphProps {
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

const base = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  focusable: false,
} as const;

/** A wedge of cheese: the reward. */
export function CheeseGlyph({ className, style }: GlyphProps) {
  return (
    <svg {...base} className={className} style={style}>
      <path d="M2.5 17.5 L21.5 17.5 L21.5 9.5 L2.5 5.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="13.2" r="1.7" fill="var(--glyph-hole, #0f0f14)" />
      <circle cx="14.5" cy="12.2" r="1.3" fill="var(--glyph-hole, #0f0f14)" />
      <circle cx="18" cy="15" r="1" fill="var(--glyph-hole, #0f0f14)" />
    </svg>
  );
}

/** A drop with a minus: the penalty. */
export function PuddleGlyph({ className, style }: GlyphProps) {
  return (
    <svg {...base} className={className} style={style}>
      <path d="M12 2.5 C12 2.5 4.5 10.5 4.5 15 a7.5 7.5 0 0 0 15 0 C19.5 10.5 12 2.5 12 2.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="8.2" y="14" width="7.6" height="2.4" rx="0.6" fill="var(--glyph-hole, #0f0f14)" />
    </svg>
  );
}

/** The creature's home. */
export function HomeGlyph({ className, style }: GlyphProps) {
  return (
    <svg {...base} className={className} style={style}>
      <path d="M3 11.5 L12 3.5 L21 11.5 L19 11.5 L19 20.5 L5 20.5 L5 11.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="10" y="14" width="4" height="6.5" fill="var(--glyph-hole, #0f0f14)" />
    </svg>
  );
}

/** A door: the exit. `size` is the cheese behind it: 0 none (the player writes it), 1 small, 2 big. */
export function DoorGlyph({ className, style, size = 0 }: GlyphProps & { size?: number }) {
  return (
    <svg {...base} className={className} style={style}>
      <path d="M4 21.5 L4 9 C4 5 7.5 2.5 12 2.5 C16.5 2.5 20 5 20 9 L20 21.5 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M2.5 21.5 L21.5 21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {size === 0 ? <circle cx="15.5" cy="14" r="1.6" fill="currentColor" /> : null}
      {size === 1 ? <path d="M9 18 L15 18 L15 14.5 L9 12.8 Z" fill="currentColor" /> : null}
      {size === 2 ? <path d="M6.5 19 L17.5 19 L17.5 11.5 L6.5 8.5 Z" fill="currentColor" /> : null}
    </svg>
  );
}

/** A four-pointed star: the bonus tile that gives a snack every visit. */
export function StarGlyph({ className, style }: GlyphProps) {
  return (
    <svg {...base} className={className} style={style}>
      <path d="M12 2 L14.4 9.6 L22 12 L14.4 14.4 L12 22 L9.6 14.4 L2 12 L9.6 9.6 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** An arrow pointing up; rotate it with `dir` (0 up, 1 right, 2 down, 3 left). */
export function ArrowGlyph({ dir, className, style }: GlyphProps & { dir: number }) {
  return (
    <svg {...base} className={className} style={{ transform: `rotate(${dir * 90}deg)`, ...style }}>
      <path d="M12 3 L19 12 L14 12 L14 21 L10 21 L10 12 L5 12 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** The learner: a round little mouse. */
export function CreatureGlyph({ className, style }: GlyphProps) {
  return (
    <svg {...base} className={className} style={style}>
      <path d="M3.5 16 C6.5 20.5 12 21 12 21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="13.5" cy="14" rx="7.2" ry="5.8" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      <circle cx="17.5" cy="7.2" r="3.4" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      <circle cx="12.2" cy="7.8" r="3.2" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      <circle cx="19.8" cy="13.2" r="1.1" fill="var(--glyph-hole, #0f0f14)" />
      <circle cx="21.2" cy="14.6" r="0.9" fill="var(--glyph-hole, #0f0f14)" />
    </svg>
  );
}

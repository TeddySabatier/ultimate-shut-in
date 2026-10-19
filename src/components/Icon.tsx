import type { CSSProperties } from 'react';
import { cx } from '../utils/cx';
import styles from './Icon.module.css';

interface IconProps {
  /** URL of a monochrome SVG (drawn with `currentColor`); it is masked and tinted with CSS `color`. */
  src: string;
  /** Accessible name; omit for purely decorative icons. */
  label?: string | undefined;
  /** Pixels, or any CSS length (e.g. `1.375rem` so the icon scales with the text). */
  size?: number | string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/** Monochrome icon rendered through `mask-image` so it inherits the text colour. */
export function Icon({ src, label, size = 20, className, style }: IconProps) {
  const vars = { '--icon': `url("${src}")`, width: size, height: size, ...style } as CSSProperties;
  return (
    <span
      className={cx(styles.icon, className)}
      style={vars}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

interface SpriteProps {
  src: string;
  alt: string;
  size?: number | undefined;
  className?: string | undefined;
}

/** Full-colour art (portraits, scenes, monsters) as a plain image. */
export function Sprite({ src, alt, size, className }: SpriteProps) {
  return <img src={src} alt={alt} width={size} height={size} className={cx(styles.sprite, className)} draggable={false} />;
}

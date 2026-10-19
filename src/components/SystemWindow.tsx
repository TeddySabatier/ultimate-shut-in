import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { panelFrameImage, PANEL_FRAME_SLICE } from '../assets/frame';
import { cx } from '../utils/cx';
import styles from './SystemWindow.module.css';

export type WindowTone = 'default' | 'accent' | 'danger' | 'success';

const TONE_COLOR: Record<WindowTone, string> = {
  default: '#6b6b8a',
  accent: '#ffb84d',
  danger: '#ff6b85',
  success: '#4dff9a',
};

const frameStyle = (tone: WindowTone): CSSProperties => ({
  borderImageSource: panelFrameImage(TONE_COLOR[tone]),
  borderImageSlice: PANEL_FRAME_SLICE,
});

interface SystemWindowProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  children: ReactNode;
  /** Buttons rendered in a row under the body. */
  actions?: ReactNode;
  tone?: WindowTone | undefined;
  as?: 'section' | 'div' | 'article';
  headingLevel?: 1 | 2 | 3;
  /** Drop the inner padding (for edge-to-edge content). */
  flush?: boolean;
  /** Extra class on the body wrapper (overlays make it the internal scroller). */
  bodyClassName?: string | undefined;
}

/**
 * Retro "system window": 9-slice pixel frame, Press Start 2P heading,
 * subtle scanlines. The voice of the Protocol lives in these.
 */
export function SystemWindow({
  title,
  children,
  actions,
  tone = 'default',
  as: Tag = 'section',
  headingLevel = 2,
  flush = false,
  bodyClassName,
  className,
  style,
  ...rest
}: SystemWindowProps) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <Tag className={cx(styles.window, styles[tone], flush && styles.flush, className)} style={{ ...frameStyle(tone), ...style }} {...rest}>
      {title !== undefined && title !== null ? <Heading className={styles.title}>{title}</Heading> : null}
      <div className={cx(styles.body, bodyClassName)}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      <span className={styles.scanlines} aria-hidden="true" />
    </Tag>
  );
}

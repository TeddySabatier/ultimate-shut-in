import type { ReactNode } from 'react';
import { uiIcons } from '../assets';
import { cx } from '../utils/cx';
import { Icon } from './Icon';
import styles from './Meter.module.css';

export type MeterTone = 'xp' | 'dp' | 'loyalty' | 'bright' | 'flickering' | 'dim' | 'out' | 'attack' | 'defense' | 'neutral';

interface MeterProps {
  value: number;
  max: number;
  /** Accessible name of the bar ("Power", "XP"). */
  label: string;
  tone?: MeterTone | undefined;
  /** Text shown at the right end; defaults to `value/max`. */
  text?: ReactNode;
  /** Hide the text (the aria-valuetext still carries it). */
  hideText?: boolean;
  /** Pixel end-caps from the asset set. */
  caps?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string | undefined;
}

/** Accessible progress bar with the pixel look. */
export function Meter({ value, max, label, tone = 'neutral', text, hideText = false, caps = false, size = 'md', className }: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(safeMax, value));
  const pct = Math.round((clamped / safeMax) * 100);
  const valueText = `${Math.round(clamped)} of ${Math.round(safeMax)}`;
  return (
    <div className={cx(styles.meter, styles[size], className)}>
      {caps ? <Icon src={uiIcons.xpBarCap} size={size === 'lg' ? 24 : 16} className={styles.capLeft} /> : null}
      <div
        className={cx(styles.track, styles[`tone-${tone}`])}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-valuenow={Math.round(clamped)}
        aria-valuetext={valueText}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      {caps ? <Icon src={uiIcons.xpBarCap} size={size === 'lg' ? 24 : 16} className={styles.capRight} /> : null}
      {hideText ? null : <span className={cx(styles.text, 'mono')}>{text ?? `${Math.round(clamped)}/${Math.round(safeMax)}`}</span>}
    </div>
  );
}

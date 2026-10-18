import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import styles from './overlays.module.css';

interface ModalFrameProps {
  children: ReactNode;
  labelledBy: string;
  /** Tap on the backdrop or the window body. */
  onTap: () => void;
  fullscreen?: boolean;
}

/** Dimmed backdrop confined to the app frame; focuses itself on mount. */
export function ModalFrame({ children, labelledBy, onTap, fullscreen = false }: ModalFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      className={cx(styles.backdrop, fullscreen && styles.fullscreen)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onClick={onTap}
    >
      <div className={styles.modalInner}>{children}</div>
    </div>
  );
}

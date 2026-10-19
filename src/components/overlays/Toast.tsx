import { useEffect, type ReactNode } from 'react';
import { uiIcons } from '../../assets';
import { Icon } from '../Icon';
import { SystemWindow, type WindowTone } from '../SystemWindow';
import { useDismissKeys } from '../../hooks/useDismissKeys';
import styles from './overlays.module.css';

interface ToastProps {
  title: string;
  line: string;
  tone?: WindowTone | undefined;
  children?: ReactNode;
  /** Auto-dismiss delay in ms; 0 disables. */
  autoMs?: number;
  onDismiss: () => void;
}

/** Small system-window toast at the bottom of the frame; tap, Enter or Escape dismisses. */
export function Toast({ title, line, tone = 'default', children, autoMs = 3200, onDismiss }: ToastProps) {
  useDismissKeys(onDismiss);
  useEffect(() => {
    if (autoMs <= 0) return;
    const id = window.setTimeout(onDismiss, autoMs);
    return () => window.clearTimeout(id);
  }, [autoMs, onDismiss]);

  return (
    <div className={styles.toastHost}>
      <SystemWindow
        as="div"
        tone={tone}
        title={title}
        headingLevel={2}
        className={styles.toast}
        role="status"
        aria-live="polite"
        onClick={onDismiss}
      >
        <p className={styles.toastLine}>{line}</p>
        {children}
        <button
          type="button"
          className={styles.close}
          aria-label="Dismiss"
          onClick={(e) => {
            // The window itself dismisses on tap; stop the bubble or the queue skips an event.
            e.stopPropagation();
            onDismiss();
          }}
        >
          <Icon src={uiIcons.close} size={16} />
        </button>
      </SystemWindow>
    </div>
  );
}

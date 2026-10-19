import { useEffect, useRef, type ReactNode } from 'react';
import { uiIcons } from '../../assets';
import { Icon } from '../../components/Icon';
import { cx } from '../../utils/cx';
import styles from './MapSheet.module.css';

interface MapSheetProps {
  open: boolean;
  /** Small amber line above the title ("Zone 6 of 7", "Outpost · Gym"). */
  kick: string;
  title: ReactNode;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  className?: string | undefined;
}

/**
 * The map's sheets (zone, outpost, new outpost): a native modal `<dialog>`
 * that slides up on phones and docks to the right from 768px. The browser
 * traps focus, closes on Escape and returns focus to the opener; the body
 * mounts only while open. Fits `100dvh` minus the safe areas and scrolls
 * inside (RESPONSIVE-RULES 10, 11).
 */
export function MapSheet({ open, kick, title, titleId, onClose, children, className }: MapSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.hasAttribute('open')) {
        const active = document.activeElement;
        openerRef.current = active instanceof HTMLElement ? active : null;
        if (typeof d.showModal === 'function') d.showModal();
        else d.setAttribute('open', '');
      }
    } else if (d.hasAttribute('open')) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && typeof opener.focus === 'function') opener.focus();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = [...d.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    d.addEventListener('keydown', onKey);
    return () => d.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, className)}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className={styles.sheet}>
          <div className={styles.head}>
            <div className={styles.headText}>
              <span className={styles.kick}>{kick}</span>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            </div>
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <Icon src={uiIcons.close} size={18} />
            </button>
          </div>
          <div className={styles.body}>{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

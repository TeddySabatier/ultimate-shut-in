import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SystemWindow } from './SystemWindow';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the player must type this exact text before confirming. */
  confirmText?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

interface BodyProps extends Omit<ConfirmDialogProps, 'open'> {
  titleId: string;
}

/** Mounted only while open, so the typed text resets on every opening. */
function DialogBody({ title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, confirmText, onConfirm, onCancel, titleId }: BodyProps) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const ready = confirmText === undefined || typed.trim() === confirmText;
  return (
    <SystemWindow
      as="div"
      tone={danger ? 'danger' : 'accent'}
      title={<span id={titleId}>{title}</span>}
      className={styles.window}
      actions={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'btn btn--danger' : 'btn btn--primary'} onClick={onConfirm} disabled={!ready}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {confirmText !== undefined ? (
        <p className={styles.guard}>
          <label htmlFor={inputId}>
            Type <code className="mono">{confirmText}</code> to confirm
          </label>
          <input id={inputId} type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </p>
      ) : null}
    </SystemWindow>
  );
}

/** Native `<dialog>` confirmation with an optional type-to-confirm guard. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onCancel } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.hasAttribute('open')) {
        if (typeof d.showModal === 'function') d.showModal();
        else d.setAttribute('open', '');
      }
    } else if (d.hasAttribute('open')) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancelEvent = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    d.addEventListener('cancel', onCancelEvent);
    return () => d.removeEventListener('cancel', onCancelEvent);
  }, [onCancel]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}>
      {open ? <DialogBody {...props} titleId={titleId} /> : null}
    </dialog>
  );
}

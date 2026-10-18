import { useEffect } from 'react';

/** Enter or Escape anywhere triggers `onDismiss` (overlays and toasts). */
export function useDismissKeys(onDismiss: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);
}

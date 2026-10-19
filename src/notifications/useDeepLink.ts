import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Compose deep link: `#/quests?compose=1` (the "Add my own quest" app shortcut).
 * True only while the link is in the URL, which is one render: the effect calls
 * `onCompose` once and clears the parameter, so a refresh does not reopen it.
 */
export function useComposeDeepLink(onCompose?: () => void): boolean {
  const [params, setParams] = useSearchParams();
  const requested = params.get('compose') === '1';

  useEffect(() => {
    if (!requested) return;
    onCompose?.();
    const next = new URLSearchParams(params);
    next.delete('compose');
    setParams(next, { replace: true });
    // Once per link: `params` and `onCompose` change on every render and must not refire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  return requested;
}

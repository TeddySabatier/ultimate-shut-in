import { useCallback, useEffect, useState } from 'react';

/** Chromium-only event; not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface InstallPromptState {
  /** True when the browser offered an install prompt we can trigger. */
  canInstall: boolean;
  /** True when running in standalone (already installed) mode. */
  isInstalled: boolean;
  /** Shows the native install dialog. Resolves to the user's choice, or null if unavailable. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null;
  return (mql?.matches ?? false) || nav.standalone === true;
}

/**
 * Captures the `beforeinstallprompt` event so the app can offer an
 * "Install app" button at a moment of its choosing.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(detectStandalone);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return null;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canInstall: deferred !== null, isInstalled, promptInstall };
}

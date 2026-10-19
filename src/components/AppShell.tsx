import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TabBar } from './TabBar';
import { OverlayHost } from './overlays/OverlayHost';
import styles from './AppShell.module.css';

/**
 * Mobile-sized frame: max 480px wide, centered, full viewport height,
 * scrollable content area with the tab bar pinned to the bottom. Overlays
 * (toasts and system windows) are confined to the frame.
 */
export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const el = mainRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className={styles.shell}>
      <main className={styles.content} id="main" ref={mainRef}>
        <Outlet />
      </main>
      <TabBar />
      <OverlayHost />
    </div>
  );
}

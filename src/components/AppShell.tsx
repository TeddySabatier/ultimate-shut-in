import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { havenSceneForRing } from '../assets';
import { useGameStore } from '../state/gameStore';
import { cx } from '../utils/cx';
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
  const ring = useGameStore((s) => s.save?.player.ring ?? 1);
  useEffect(() => {
    const el = mainRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: 0 });
  }, [pathname]);
  // Tablet and desktop draw the current ring's scene, dimmed, behind the frame (global.css).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--haven-backdrop', `url("${havenSceneForRing(ring - 1)}")`);
    return () => {
      root.style.removeProperty('--haven-backdrop');
    };
  }, [ring]);
  return (
    <div className={cx(styles.shell, pathname === '/map' && styles.wide)}>
      <main className={styles.content} id="main" ref={mainRef}>
        <Outlet />
      </main>
      <TabBar />
      <OverlayHost />
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import { OverlayHost } from './overlays/OverlayHost';
import styles from './AppShell.module.css';

/**
 * Mobile-sized frame: max 480px wide, centered, full viewport height,
 * scrollable content area with the tab bar pinned to the bottom. Overlays
 * (toasts and system windows) are confined to the frame.
 */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.content} id="main">
        <Outlet />
      </main>
      <TabBar />
      <OverlayHost />
    </div>
  );
}

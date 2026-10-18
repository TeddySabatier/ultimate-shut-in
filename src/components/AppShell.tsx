import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import styles from './AppShell.module.css';

/**
 * Mobile-sized frame: max 480px wide, centered, full viewport height,
 * scrollable content area with the tab bar pinned to the bottom.
 */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}

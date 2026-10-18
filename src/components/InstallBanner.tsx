import { useInstallPrompt } from '../hooks/useInstallPrompt';
import styles from './InstallBanner.module.css';

/** Shows an "Install app" call-to-action when the browser allows it. */
export function InstallBanner() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  if (isInstalled || !canInstall) return null;

  return (
    <div className={styles.banner} role="region" aria-label="Install app">
      <span className={styles.text}>Install Ultimate Shut-In for the full quest experience.</span>
      <button type="button" className={styles.button} onClick={() => void promptInstall()}>
        Install
      </button>
    </div>
  );
}

import { Panel } from '../components/Panel';
import { usePlayerStore } from '../state/playerStore';

export function SettingsScreen() {
  const name = usePlayerStore((s) => s.name);
  const setName = usePlayerStore((s) => s.setName);
  const reset = usePlayerStore((s) => s.reset);

  return (
    <>
      <h1>Settings</h1>
      <Panel title="Player">
        <label>
          Name{' '}
          <input
            type="text"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            aria-label="Player name"
          />
        </label>
      </Panel>
      <Panel title="Danger zone">
        <button type="button" onClick={reset}>
          Reset progress
        </button>
      </Panel>
      <Panel title="About">
        <p>Ultimate Shut-In v{__APP_VERSION__}</p>
      </Panel>
    </>
  );
}

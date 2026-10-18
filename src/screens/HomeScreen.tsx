import { InstallBanner } from '../components/InstallBanner';
import { Panel } from '../components/Panel';
import { usePlayerStore } from '../state/playerStore';

export function HomeScreen() {
  const name = usePlayerStore((s) => s.name);
  const level = usePlayerStore((s) => s.level);
  const xp = usePlayerStore((s) => s.xp);

  return (
    <>
      <h1>Ultimate Shut-In</h1>
      <InstallBanner />
      <Panel title="Status">
        <p>
          {name} · Lv {level} · {xp} XP
        </p>
        <p>Do things in real life, level up in the game.</p>
      </Panel>
      <Panel title="Today">
        <p>No quests yet. The quest system arrives in a later milestone.</p>
      </Panel>
    </>
  );
}

import { Panel } from '../components/Panel';
import { usePlayerStore } from '../state/playerStore';

export function CharacterScreen() {
  const name = usePlayerStore((s) => s.name);
  const level = usePlayerStore((s) => s.level);
  const xp = usePlayerStore((s) => s.xp);
  const gainXp = usePlayerStore((s) => s.gainXp);

  return (
    <>
      <h1>Character</h1>
      <Panel title={name}>
        <p>Level {level}</p>
        <p>{xp} XP</p>
        <button type="button" onClick={() => gainXp(10)}>
          +10 XP (debug)
        </button>
      </Panel>
    </>
  );
}

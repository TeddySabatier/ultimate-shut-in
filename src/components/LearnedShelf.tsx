import { strings, type SaveFile } from '../game';
import { SystemWindow } from './SystemWindow';
import { LearnedField } from './LearnedField';
import styles from './LearnedShelf.module.css';

/** Notes for quests that are not on today's board, still editable. */
export function LearnedShelf({ save, onChange }: { save: SaveFile; onChange: (templateId: string, text: string) => void }) {
  const onBoard = new Set((save.board?.quests ?? []).map((q) => q.templateId));
  const shelf = save.notes.filter((n) => !onBoard.has(n.templateId));
  if (shelf.length === 0) return null;
  return (
    <SystemWindow title={strings.ui.learned}>
      <p className="muted">{strings.ui.learnedShelf}</p>
      <ul className={styles.list}>
        {shelf.map((note) => (
          <li key={note.templateId}>
            <h3 className={styles.title}>{note.title}</h3>
            <LearnedField
              value={note.text}
              label={`${strings.ui.learned}, ${note.title}`}
              hint={strings.ui.learnedHint}
              onCommit={(text) => onChange(note.templateId, text)}
            />
          </li>
        ))}
      </ul>
    </SystemWindow>
  );
}

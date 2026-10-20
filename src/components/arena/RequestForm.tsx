import { useCallback, useId, useState } from 'react';
import { arenaContent, strings } from '../../game';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useGameStore } from '../../state/gameStore';
import { SystemWindow } from '../SystemWindow';
import styles from './arena.module.css';

const a = strings.arena;
const c = strings.compose;

export function RequestForm() {
  const id = useId();
  const submit = useGameStore((s) => s.submitArenaRequest);
  const [text, setText] = useState('');
  const [source, setSource] = useState<'text' | 'voice'>('text');
  const [sent, setSent] = useState(false);
  const onFinal = useCallback((phrase: string) => {
    setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${phrase}`);
    setSource('voice');
  }, []);
  const speech = useSpeechRecognition(typeof navigator === 'undefined' ? 'en' : navigator.language, onFinal);

  const send = () => {
    if (!text.trim()) return;
    if (submit(text, source)) {
      setText('');
      setSent(true);
    }
  };

  return (
    <SystemWindow title={a.requestTitle} data-testid="arena-request">
      <p className={styles.intro}>{a.requestIntro}</p>
      {sent ? (
        <p className={styles.meta} role="status">
          {a.requestSent}
        </p>
      ) : null}
      <div className={styles.form}>
        <label htmlFor={id} className={styles.meta}>
          {a.requestWrite}
        </label>
        <textarea
          id={id}
          className={styles.textarea}
          rows={4}
          maxLength={arenaContent.requests.textMax}
          value={text}
          placeholder={a.requestPlaceholder}
          onChange={(e) => {
            setText(e.target.value);
            setSource('text');
            setSent(false);
          }}
        />
        <div className={styles.actions}>
          {speech.supported ? (
            <button
              type="button"
              className="btn"
              onClick={() => (speech.status === 'listening' ? speech.stop() : speech.start())}
            >
              {speech.status === 'listening' ? c.stop : a.requestSpeak}
            </button>
          ) : (
            <button type="button" className="btn" disabled>
              {a.requestSpeak}
            </button>
          )}
          <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={send} data-testid="arena-request-send">
            {a.requestSend}
          </button>
        </div>
      </div>
    </SystemWindow>
  );
}

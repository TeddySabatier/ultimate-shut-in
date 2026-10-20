/**
 * "Ask for a game" (docs/design/ARENA.md 9): a text box and the same voice
 * input as the Compose sheet (`useSpeechRecognition`, its fallbacks and its
 * privacy line). Requests stay in the save; nothing is sent anywhere.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { uiIcons } from '../../assets';
import { arenaContent, formatLine, requestsLeft, strings, type SaveFile } from '../../game';
import { useNow } from '../../hooks/useNow';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useGameStore } from '../../state/gameStore';
import { cx } from '../../utils/cx';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { errorLine, shortDate } from './format';
import { useArenaFeedback } from './useArenaFeedback';
import styles from './arena.module.css';

const u = strings.arena.ui;
const r = u.request;
const c = strings.compose;

export function RequestForm({ save }: { save: SaveFile }) {
  const arenaRequest = useGameStore((s) => s.arenaRequest);
  const now = useNow(true, 60_000);
  const ids = useId();
  const { message, report } = useArenaFeedback();
  const [text, setText] = useState('');
  const [usedVoice, setUsedVoice] = useState(false);
  const [heard, setHeard] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
  const max = arenaContent.requests.textMax;

  const speech = useSpeechRecognition(locale, (final) => {
    setText((prev) => (prev.trim() === '' ? final : `${prev.trim()} ${final}`).slice(0, max));
    setUsedVoice(true);
    setHeard(true);
  });
  const listening = speech.status === 'listening';

  // A refused microphone or an unreachable speech service sends the player to the text box.
  useEffect(() => {
    if (speech.status === 'denied' || speech.status === 'nomic' || speech.status === 'offline' || speech.status === 'error') textRef.current?.focus();
  }, [speech.status]);

  const voiceNote =
    speech.status === 'denied'
      ? c.denied
      : speech.status === 'nomic'
        ? c.noMic
        : speech.status === 'nospeech'
          ? c.noSpeech
          : speech.status === 'offline' || speech.status === 'error'
            ? c.offline
            : null;

  const left = requestsLeft(save, now);
  const mine = save.arena.requests.slice(-5).reverse();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (listening) speech.stop();
    const ok = arenaRequest(text, usedVoice ? 'voice' : 'text');
    if (ok) {
      setText('');
      setUsedVoice(false);
      setHeard(false);
    }
    report(ok, ok ? u.requestThanks : null);
  };

  return (
    <SystemWindow title={r.heading} data-testid="arena-request">
      <form className={styles.stack} onSubmit={submit} noValidate>
        <p className={styles.line}>{r.intro}</p>
        <label htmlFor={`${ids}-text`} className={styles.label}>
          {r.label}
        </label>
        <textarea
          id={`${ids}-text`}
          ref={textRef}
          className={styles.textarea}
          rows={3}
          maxLength={max}
          value={text}
          placeholder={r.placeholder}
          aria-describedby={`${ids}-count ${ids}-voice`}
          onChange={(e) => {
            setText(e.target.value);
            setHeard(false);
          }}
        />
        <p id={`${ids}-count`} className={styles.note}>
          {formatLine(r.count, { count: text.length, max })}
        </p>
        <div className={styles.voiceRow}>
          {speech.supported ? (
            <button type="button" className={cx('btn', listening && styles.listening)} onClick={listening ? speech.stop : speech.start}>
              <Icon src={uiIcons.mic} size={18} />
              {listening ? c.stop : c.speak}
            </button>
          ) : null}
          {listening ? (
            <span className={styles.rec} role="status">
              {c.listening}
            </span>
          ) : null}
        </div>
        {listening && speech.interim !== '' ? (
          <p className={styles.line} aria-live="polite">
            <span className="muted">{c.hearing}:</span> {speech.interim}
          </p>
        ) : null}
        {voiceNote !== null ? (
          <p className={styles.reason} role="alert">
            {voiceNote}
          </p>
        ) : null}
        {heard && voiceNote === null ? <p className={styles.ok}>{c.heard}</p> : null}
        <p id={`${ids}-voice`} className={styles.note}>
          {speech.supported ? c.voicePrivacy : c.unsupported}
        </p>
        <p className={styles.line} data-testid="arena-requests-left">
          {formatLine(r.left, { left })}
        </p>
        <button type="submit" className="btn btn--primary btn--block" disabled={left === 0} aria-describedby={left === 0 ? `${ids}-limit` : undefined}>
          {r.send}
        </button>
        {left === 0 ? (
          <p id={`${ids}-limit`} className={styles.reason}>
            {errorLine('request limit')}
          </p>
        ) : null}
        <p className={styles.live} role="status" aria-live="polite" data-testid="arena-request-status">
          {message}
        </p>
      </form>

      <h3 className={styles.subhead}>{r.yoursHeading}</h3>
      {mine.length === 0 ? (
        <p className={styles.note}>{r.empty}</p>
      ) : (
        <ul className={styles.list}>
          {mine.map((q) => (
            <li key={q.id} className={styles.request}>
              <p className={styles.note}>{formatLine(r.dated, { date: shortDate(q.at), source: c.myQuests.sources[q.source] })}</p>
              <p className={styles.line}>{q.text}</p>
            </li>
          ))}
        </ul>
      )}
    </SystemWindow>
  );
}

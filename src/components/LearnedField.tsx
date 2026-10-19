import { useEffect, useId, useRef, useState } from 'react';
import { LEARNED_MAX, tidyLearned } from '../game';
import styles from './LearnedField.module.css';

const DEBOUNCE_MS = 400;

/** A quest's "what I learned" box. Saves a moment after typing, and again on blur. */
export function LearnedField({
  value,
  label,
  hint,
  onCommit,
}: {
  value: string;
  label: string;
  hint: string;
  onCommit: (text: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const commit = useRef(onCommit);

  useEffect(() => {
    commit.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  useEffect(() => {
    if (tidyLearned(text) === value) return;
    const handle = window.setTimeout(() => commit.current(text), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [text, value]);

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={text}
        placeholder={hint}
        maxLength={LEARNED_MAX}
        rows={3}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (tidyLearned(text) !== value) commit.current(text);
        }}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}

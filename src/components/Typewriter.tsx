import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { cx } from '../utils/cx';
import styles from './Typewriter.module.css';

interface TypewriterProps {
  text: string;
  /** Milliseconds per character. */
  speed?: number;
  /** Set false to reveal the whole text at once (the "skip" affordance). */
  active?: boolean;
  onDone?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * Types `text` character by character. Screen readers always get the full
 * text; under reduced motion (setting or OS) the text appears at once.
 */
export function Typewriter({ text, speed = 18, active = true, onDone, className }: TypewriterProps) {
  const reduced = useReducedMotion();
  const instant = reduced || !active;
  const [count, setCount] = useState(0);
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    // New text: restart from the first character (state adjustment during render).
    setPrevText(text);
    setCount(0);
  }
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const shown = instant ? text.length : Math.min(count, text.length);
  const done = shown >= text.length;

  useEffect(() => {
    if (instant) {
      onDoneRef.current?.();
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onDoneRef.current?.();
      }
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, instant]);

  return (
    <span className={cx(styles.typewriter, className)} data-done={done ? 'true' : 'false'}>
      {done ? (
        text
      ) : (
        <>
          <span aria-hidden="true">
            {text.slice(0, shown)}
            <span className={styles.caret} />
          </span>
          <span className="srOnly">{text}</span>
        </>
      )}
    </span>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Thin wrapper over the Web Speech API (`SpeechRecognition`, prefixed
 * `webkitSpeechRecognition` in Chrome and Safari). Nothing is recorded or
 * stored here: the browser streams audio to its own speech service (in Chrome,
 * a network one), hands back text, and only the final text reaches `onFinal`.
 *
 * The DOM lib has no types for it, so the minimal shape we use is declared
 * below. Support is looked up at call time, never at import time, so tests
 * (and browsers that add it late) see the current `window`.
 */

interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternativeLike | undefined;
}
interface SpeechResultListLike {
  readonly length: number;
  [index: number]: SpeechResultLike | undefined;
}
export interface SpeechResultEventLike {
  resultIndex: number;
  results: SpeechResultListLike;
}
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/** The browser's constructor, or null where there is none (Firefox, some iOS builds). */
export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechStatus = 'idle' | 'listening' | 'denied' | 'nomic' | 'nospeech' | 'offline' | 'error';

export interface SpeechApi {
  supported: boolean;
  status: SpeechStatus;
  /** Live, not-yet-final words while listening. */
  interim: string;
  start: () => void;
  stop: () => void;
}

function statusForError(code: string | undefined): SpeechStatus {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'audio-capture':
      return 'nomic';
    case 'no-speech':
      return 'nospeech';
    case 'network':
      return 'offline';
    default:
      return 'error';
  }
}

/**
 * `lang` is a BCP 47 tag (`navigator.language`). `onFinal` receives each
 * finished phrase; interim results are only exposed for display.
 */
export function useSpeechRecognition(lang: string, onFinal: (text: string) => void): SpeechApi {
  const [supported] = useState(() => getSpeechRecognition() !== null);
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [interim, setInterim] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalText = '';
      let liveText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r?.[0]?.transcript ?? '';
        if (r?.isFinal) finalText += text;
        else liveText += text;
      }
      setInterim(liveText.trim());
      if (finalText.trim() !== '') {
        setInterim('');
        onFinalRef.current(finalText.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      setStatus(statusForError(e.error));
      setInterim('');
    };
    rec.onend = () => {
      setStatus((s) => (s === 'listening' ? 'idle' : s));
      setInterim('');
      if (recRef.current === rec) recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setStatus('listening');
      setInterim('');
    } catch {
      recRef.current = null;
      setStatus('error');
    }
  }, [lang]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  // Leaving the sheet always lets go of the microphone.
  useEffect(
    () => () => {
      const rec = recRef.current;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
        recRef.current = null;
      }
    },
    [],
  );

  return { supported, status, interim, start, stop };
}

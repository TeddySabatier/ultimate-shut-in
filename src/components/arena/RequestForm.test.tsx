import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { arenaContent, formatLine, strings } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { currentSave, renderWithRouter, seedStore } from '../../test/storeUtils';
import { RequestForm } from './RequestForm';

const r = strings.arena.ui.request;
const c = strings.compose;

function Live() {
  const save = useGameStore((s) => s.save);
  return save ? <RequestForm save={save} /> : null;
}

type SpeechWindow = { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };

afterEach(() => {
  delete (window as unknown as SpeechWindow).SpeechRecognition;
});

describe('RequestForm', () => {
  it('saves a request, clears the box, thanks the player and lists it', () => {
    seedStore('Asker');
    renderWithRouter(<Live />);
    const box = screen.getByLabelText(r.label) as HTMLTextAreaElement;
    expect(box).toHaveAttribute('maxLength', String(arenaContent.requests.textMax));
    expect(screen.getByTestId('arena-requests-left')).toHaveTextContent(formatLine(r.left, { left: 3 }));
    fireEvent.change(box, { target: { value: 'A chess puzzle with my vassals' } });
    expect(screen.getByText(formatLine(r.count, { count: 30, max: arenaContent.requests.textMax }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: r.send }));
    expect(currentSave().arena.requests).toMatchObject([{ text: 'A chess puzzle with my vassals', source: 'text' }]);
    expect(box.value).toBe('');
    expect(screen.getByTestId('arena-request-status')).toHaveTextContent(strings.arena.ui.requestThanks);
    expect(screen.getByTestId('arena-requests-left')).toHaveTextContent(formatLine(r.left, { left: 2 }));
    expect(screen.getByText('A chess puzzle with my vassals')).toBeInTheDocument();
  });

  it('says why a short request is refused, and closes Send at the daily limit', () => {
    seedStore('Asker');
    renderWithRouter(<Live />);
    const box = screen.getByLabelText(r.label);
    fireEvent.change(box, { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: r.send }));
    expect(screen.getByTestId('arena-request-status')).toHaveTextContent(strings.arena.errors['request too short']);
    for (const text of ['one game idea', 'two game idea', 'three game idea']) {
      fireEvent.change(box, { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: r.send }));
    }
    expect(currentSave().arena.requests).toHaveLength(3);
    expect(screen.getByRole('button', { name: r.send })).toBeDisabled();
    expect(screen.getByText(strings.arena.errors['request limit'])).toBeInTheDocument();
  });

  it('falls back to typing when the browser cannot listen', () => {
    seedStore('Asker');
    renderWithRouter(<Live />);
    expect(screen.queryByRole('button', { name: c.speak })).toBeNull();
    expect(screen.getByText(c.unsupported)).toBeInTheDocument();
  });

  it('uses the Compose voice input: spoken words fill the box and are saved as voice', () => {
    let instance: { onresult: ((e: unknown) => void) | null; onend: (() => void) | null } | null = null;
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
      stop() {}
      abort() {}
    }
    (window as unknown as SpeechWindow).SpeechRecognition = FakeRecognition;
    seedStore('Asker');
    renderWithRouter(<Live />);
    expect(screen.getByText(c.voicePrivacy)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    expect(screen.getByText(c.listening)).toBeInTheDocument();
    act(() => {
      instance?.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: 'a tower defense of my street' } } } });
      instance?.onend?.();
    });
    expect((screen.getByLabelText(r.label) as HTMLTextAreaElement).value).toBe('a tower defense of my street');
    fireEvent.click(screen.getByRole('button', { name: r.send }));
    expect(currentSave().arena.requests[0]).toMatchObject({ text: 'a tower defense of my street', source: 'voice' });
  });
});

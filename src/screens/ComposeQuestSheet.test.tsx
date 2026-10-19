import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '../game';
import type { SpeechRecognitionLike, SpeechResultEventLike } from '../hooks/useSpeechRecognition';
import { useGameStore } from '../state/gameStore';
import { currentSave, seedStore } from '../test/storeUtils';
import { ComposeQuestSheet } from './ComposeQuestSheet';

const c = strings.compose;

/** A stand-in for the browser's SpeechRecognition that the test drives by hand. */
class MockRecognition implements SpeechRecognitionLike {
  static last: MockRecognition | null = null;
  static count = 0;
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((e: SpeechResultEventLike) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    MockRecognition.last = this;
    MockRecognition.count += 1;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
    this.onend?.();
  }
  abort(): void {
    this.aborted = true;
  }
  say(transcript: string, isFinal: boolean): void {
    const result = { isFinal, length: 1, 0: { transcript } };
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: result } });
  }
  fail(error: string): void {
    this.onerror?.({ error });
    this.onend?.();
  }
}

type SpeechGlobals = { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
const w = window as unknown as SpeechGlobals;

function renderSheet(open = true) {
  const onClose = vi.fn();
  const view = render(<ComposeQuestSheet open={open} onClose={onClose} />);
  return { onClose, ...view };
}

const textbox = () => screen.getByLabelText(c.textLabel);
const type = (value: string) => fireEvent.change(textbox(), { target: { value } });

beforeEach(() => {
  MockRecognition.last = null;
  MockRecognition.count = 0;
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  seedStore('Tester');
});

afterEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});

describe('ComposeQuestSheet: text path', () => {
  it('renders nothing while closed and a labelled dialog with an empty hint while open', () => {
    const { rerender, onClose } = renderSheet(false);
    expect(screen.queryByLabelText(c.textLabel)).toBeNull();
    rerender(<ComposeQuestSheet open onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: c.title })).toBeInTheDocument();
    expect(screen.getByText(c.emptyHint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: c.actions.board })).toBeDisabled();
  });

  it('turns a sentence into editable fields and a rewards preview', () => {
    renderSheet();
    type('walk 30 minutes in the park every morning');
    expect(screen.getByRole('radio', { name: /Pell/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: c.kinds.timer })).toBeChecked();
    expect(screen.getByLabelText(c.labels.duration)).toHaveValue(30);
    expect(screen.getByLabelText(c.labels.name)).toHaveValue('Walk in the Park');
    expect(screen.getByLabelText(c.labels.recurrence)).toHaveValue('daily');
    expect(screen.getByLabelText(c.labels.timeSlot)).toHaveValue('morning');
    expect(screen.getByRole('radio', { name: /2 Steady/ })).toBeChecked();
    expect(screen.getByRole('list', { name: 'Rewards' })).toBeInTheDocument();
    // Walking and the park pull two ways, so the sheet asks which vassal.
    expect(screen.getByText(c.questions.habit)).toBeInTheDocument();
  });

  it('adds the quest to today\'s board and closes', () => {
    const { onClose } = renderSheet();
    const before = currentSave().board?.quests.length ?? 0;
    type('do 20 pushups');
    fireEvent.click(screen.getByRole('button', { name: c.actions.board }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const save = currentSave();
    expect(save.customTemplates).toHaveLength(1);
    expect(save.customTemplates[0]).toMatchObject({ title: 'Do 20 Pushups', kind: 'count', targetCount: 20, habit: 'move', source: 'text', recurrence: 'once' });
    expect(save.board?.quests).toHaveLength(before + 1);
    expect(save.board?.quests.at(-1)?.templateId).toBe(save.customTemplates[0]?.id);
    // One toast for "saved and on the board", not two.
    expect(useGameStore.getState().pendingEvents.map((e) => e.type)).toEqual(['customBoarded']);
  });

  it('keeps edits when the sentence changes and lets the player override every field', () => {
    renderSheet();
    type('tidy the kitchen');
    fireEvent.click(screen.getByRole('radio', { name: /Basil/ }));
    fireEvent.click(screen.getByRole('radio', { name: c.kinds.timer }));
    fireEvent.change(screen.getByLabelText(c.labels.duration), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText(c.labels.name), { target: { value: 'Big reset' } });
    fireEvent.change(screen.getByLabelText(c.labels.recurrence), { target: { value: 'pin:2' } });
    fireEvent.change(screen.getByLabelText(c.labels.timeSlot), { target: { value: 'evening' } });
    type('tidy the kitchen properly');
    expect(screen.getByRole('radio', { name: /Basil/ })).toBeChecked();
    expect(screen.getByLabelText(c.labels.name)).toHaveValue('Big reset');
    // 45 minutes earns tier 3 and the suggestion follows the effort.
    expect(screen.getByRole('radio', { name: /3 Hard/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: c.actions.recurring }));
    expect(currentSave().customTemplates[0]).toMatchObject({
      habit: 'eat',
      kind: 'timer',
      durationMin: 45,
      title: 'Big reset',
      tier: 3,
      recurrence: 'weekly:1',
      pinWeekday: 2,
      timeSlot: 'evening',
    });
  });

  it('holds the tier to the effort: a short timer cannot claim tier 3, a check stops at 2', () => {
    renderSheet();
    type('stretch for 5 minutes');
    expect(screen.getByRole('radio', { name: /2 Steady/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /3 Hard/ })).toBeDisabled();
    expect(screen.getByText(/can claim tier 1 at most/)).toBeInTheDocument();
    type('tidy the kitchen');
    expect(screen.getByRole('radio', { name: /2 Steady/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /3 Hard/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /2 Steady/ }));
    fireEvent.click(screen.getByRole('button', { name: c.actions.later }));
    expect(currentSave().customTemplates[0]?.tier).toBe(2);
    expect(currentSave().board?.quests.some((q) => q.templateId.startsWith('c-'))).toBe(false);
  });

  it('offers "Save for later" for a one-off and "Save as recurring" once it recurs, without boarding it', () => {
    renderSheet();
    type('read 10 pages');
    expect(screen.getByRole('button', { name: c.actions.later })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: c.actions.recurring })).toBeNull();
    type('read 10 pages every day');
    expect(screen.getByRole('button', { name: c.actions.recurring })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: c.actions.recurring }));
    const save = currentSave();
    expect(save.customTemplates[0]).toMatchObject({ recurrence: 'daily', habit: 'study' });
    expect(save.board?.quests.some((q) => q.templateId.startsWith('c-'))).toBe(false);
  });

  it('blocks an empty name and shows why', () => {
    renderSheet();
    type('tidy the kitchen');
    fireEvent.change(screen.getByLabelText(c.labels.name), { target: { value: '   ' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/give it a name/i);
    expect(screen.getByRole('button', { name: c.actions.board })).toBeDisabled();
    expect(screen.getByRole('button', { name: c.actions.later })).toBeDisabled();
  });

  it('keeps the sheet open and says so when the engine refuses a duplicate', () => {
    const { onClose } = renderSheet();
    type('tidy the kitchen');
    fireEvent.click(screen.getByRole('button', { name: c.actions.later }));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    type('tidy the kitchen');
    fireEvent.click(screen.getByRole('button', { name: c.actions.later }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/already have/i);
    expect(useGameStore.getState().notice).toBeNull();
    expect(currentSave().customTemplates).toHaveLength(1);
  });

  it('disables "Add to board today" and explains when two of your own are already there', () => {
    renderSheet();
    for (const sentence of ['tidy the kitchen', 'call my sister']) {
      type(sentence);
      fireEvent.click(screen.getByRole('button', { name: c.actions.board }));
    }
    expect(currentSave().board?.quests.filter((q) => q.templateId.startsWith('c-'))).toHaveLength(2);
    // A second sheet opens blank; the third quest can only be saved.
    document.body.innerHTML = '';
    renderSheet();
    type('read 10 pages');
    expect(screen.getByRole('button', { name: c.actions.board })).toBeDisabled();
    expect(screen.getByText(c.notes.full)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: c.actions.later })).toBeEnabled();
  });

  it('cancels without saving anything', () => {
    const { onClose } = renderSheet();
    type('tidy the kitchen');
    fireEvent.click(screen.getByRole('button', { name: c.actions.cancel }));
    expect(onClose).toHaveBeenCalled();
    expect(currentSave().customTemplates).toHaveLength(0);
  });

  it('closes on Escape (the dialog cancel event)', () => {
    const { onClose } = renderSheet();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ComposeQuestSheet: voice path', () => {
  it('without the Speech API it falls back to the text box and says so', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: c.speak })).toBeNull();
    expect(screen.getByText(c.unsupported)).toBeInTheDocument();
    type('tidy the kitchen');
    expect(screen.getByLabelText(c.labels.name)).toHaveValue('Tidy the Kitchen');
  });

  it('listens, shows interim words live, appends the final transcript for review, and saves nothing by itself', () => {
    w.SpeechRecognition = MockRecognition;
    renderSheet();
    // The privacy copy: the browser vendor's service may hear it; nothing else leaves the device.
    expect(screen.getByText(/speech service/i)).toHaveTextContent(/Chrome/);
    expect(screen.getByText(/speech service/i)).toHaveTextContent(/Nothing else leaves your device/);
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    const rec = MockRecognition.last;
    expect(rec).not.toBeNull();
    expect(rec?.started).toBe(true);
    expect(rec?.interimResults).toBe(true);
    expect(rec?.lang).toBe(navigator.language);
    expect(screen.getByRole('status')).toHaveTextContent(c.listening);
    expect(screen.getByRole('button', { name: c.stop })).toBeInTheDocument();

    act(() => rec?.say('walk 20', false));
    expect(screen.getByText(/Hearing/)).toBeInTheDocument();
    expect(screen.getByText('walk 20', { exact: false })).toBeInTheDocument();
    expect(textbox()).toHaveValue('');

    act(() => rec?.say('walk 20 minutes every day', true));
    expect(textbox()).toHaveValue('walk 20 minutes every day');
    expect(screen.getByText(c.heard)).toBeInTheDocument();
    expect(screen.getByLabelText(c.labels.duration)).toHaveValue(20);
    expect(screen.getByLabelText(c.labels.recurrence)).toHaveValue('daily');
    // Nothing is saved until a button is pressed.
    expect(currentSave().customTemplates).toHaveLength(0);

    act(() => rec?.stop());
    expect(screen.getByRole('button', { name: c.speak })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: c.actions.board }));
    expect(currentSave().customTemplates[0]).toMatchObject({ source: 'voice', durationMin: 20, recurrence: 'daily' });
  });

  it('appends a second utterance to the first and lets the player correct the text', () => {
    w.SpeechRecognition = MockRecognition;
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    act(() => MockRecognition.last?.say('read 10 pages', true));
    act(() => MockRecognition.last?.onend?.());
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    expect(MockRecognition.count).toBe(2);
    act(() => MockRecognition.last?.say('before bed', true));
    expect(textbox()).toHaveValue('read 10 pages before bed');
    type('read 12 pages before bed');
    fireEvent.click(screen.getByRole('button', { name: c.actions.later }));
    expect(currentSave().customTemplates[0]).toMatchObject({ targetCount: 12, timeSlot: 'evening', source: 'voice' });
  });

  it('works through the webkit-prefixed constructor too', () => {
    w.webkitSpeechRecognition = MockRecognition;
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    expect(MockRecognition.last?.started).toBe(true);
  });

  it('a refused microphone falls back to the text box with a clear message', () => {
    w.SpeechRecognition = MockRecognition;
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    act(() => MockRecognition.last?.fail('not-allowed'));
    expect(screen.getByRole('alert')).toHaveTextContent(c.denied);
    expect(screen.getByRole('button', { name: c.speak })).toBeInTheDocument();
    expect(document.activeElement).toBe(textbox());
    type('tidy the kitchen');
    expect(screen.getByLabelText(c.labels.name)).toHaveValue('Tidy the Kitchen');
  });

  it.each([
    ['audio-capture', c.noMic],
    ['no-speech', c.noSpeech],
    ['network', c.offline],
    ['language-not-supported', c.offline],
  ])('maps the %s error to its message', (error, message) => {
    w.SpeechRecognition = MockRecognition;
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    act(() => MockRecognition.last?.fail(error));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('survives start() throwing (a second start on some browsers)', () => {
    class Throwing extends MockRecognition {
      override start(): void {
        throw new Error('already started');
      }
    }
    w.SpeechRecognition = Throwing;
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    expect(screen.getByRole('alert')).toHaveTextContent(c.offline);
    expect(textbox()).toBeInTheDocument();
  });

  it('releases the microphone when the sheet closes mid-recording', () => {
    w.SpeechRecognition = MockRecognition;
    const { rerender, onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    const rec = MockRecognition.last;
    rerender(<ComposeQuestSheet open={false} onClose={onClose} />);
    expect(rec?.aborted).toBe(true);
  });

  it('keeps the Stop button inside the dialog and reachable by keyboard', () => {
    w.SpeechRecognition = MockRecognition;
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: c.speak }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: c.stop })).toHaveProperty('tabIndex', 0);
  });
});

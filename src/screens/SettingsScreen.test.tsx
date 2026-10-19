import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockNotification, removeNotification, type NotificationMock } from '../notifications/mockNotification';
import { REMINDERS_KEY, loadPrefs } from '../notifications/prefs';
import { useGameStore } from '../state/gameStore';
import { currentSave, seedStore } from '../test/storeUtils';
import { SettingsScreen } from './SettingsScreen';

/** App only mounts the screens while onboarded; mirror that gate here. */
function Gated() {
  const onboarded = useGameStore((s) => s.onboarded);
  return onboarded ? <SettingsScreen /> : <p>onboarding</p>;
}

describe('SettingsScreen', () => {
  it('disables the last enabled habit so at least one stays on', () => {
    seedStore('Tester', { enabledHabits: ['move', 'clean'] });
    render(<SettingsScreen />);
    const move = screen.getByRole('checkbox', { name: /^move/i });
    const clean = screen.getByRole('checkbox', { name: /^clean/i });
    expect(move).toBeEnabled();
    fireEvent.click(clean);
    expect(currentSave().settings.enabledHabits).toEqual(['move']);
    expect(screen.getByRole('checkbox', { name: /^move/i })).toBeDisabled();
  });

  it('changes difficulty and benevolence through the store', () => {
    seedStore();
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('radio', { name: /hardcore/i }));
    expect(currentSave().settings.difficulty).toBe('hardcore');
    fireEvent.click(screen.getByRole('radio', { name: /strict/i }));
    expect(currentSave().settings.benevolence).toBe('strict');
  });

  it('changes the reset hour and reduced motion', () => {
    seedStore();
    render(<SettingsScreen />);
    fireEvent.change(screen.getByLabelText(/day starts at/i), { target: { value: '6' } });
    expect(currentSave().settings.resetHour).toBe(6);
    fireEvent.click(screen.getByRole('checkbox', { name: /reduce motion/i }));
    expect(currentSave().settings.reducedMotion).toBe(false);
  });

  it('reset requires typing RESET and then returns to onboarding', () => {
    seedStore();
    render(<Gated />);
    fireEvent.click(screen.getByRole('button', { name: /reset everything/i }));
    const confirm = screen.getByRole('button', { name: /^reset$/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'RESET' } });
    fireEvent.click(confirm);
    expect(useGameStore.getState().save).toBeNull();
    expect(useGameStore.getState().onboarded).toBe(false);
    expect(screen.getByText('onboarding')).toBeInTheDocument();
  });

  it('shows the about block with the version and non-affiliation note', () => {
    seedStore();
    render(<SettingsScreen />);
    expect(screen.getByText(/haven protocol/i, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/not affiliated/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`v${__APP_VERSION__.replace(/\./g, '\\.')}`))).toBeInTheDocument();
  });
});

describe('SettingsScreen reminders', () => {
  let mock: NotificationMock | null = null;
  let restore: (() => void) | null = null;
  afterEach(() => {
    mock?.restore();
    restore?.();
    mock = null;
    restore = null;
    localStorage.removeItem(REMINDERS_KEY);
  });

  const master = () => screen.getByRole('checkbox', { name: /send me reminders/i });

  it('keeps the section collapsed and the permission untouched on load', () => {
    mock = mockNotification('default');
    seedStore();
    render(<SettingsScreen />);
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(master()).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Board issued' })).toBeNull();
    expect(screen.getByText(/when the app is closed nothing fires/i)).toBeInTheDocument();
  });

  it('asks for permission on the tap, then shows the three reminders with their defaults', async () => {
    mock = mockNotification('default', 'granted');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
    expect(master()).toBeChecked();
    expect(loadPrefs().enabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Board issued' })).toBeChecked();
    expect(screen.getByLabelText('Board issued time')).toHaveValue('08:30');
    expect(screen.getByLabelText('Wave tomorrow time')).toHaveValue('19:00');
    expect(screen.getByRole('checkbox', { name: 'Timer finished' })).toBeChecked();
    expect(screen.getByText(/nothing is sent between 23:00 and 08:00/i)).toBeInTheDocument();
  });

  it('does not ask again when permission was already granted', async () => {
    mock = mockNotification('granted');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(master()).toBeChecked();
  });

  it('stores each reminder toggle and time', async () => {
    mock = mockNotification('granted');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Timer finished' }));
    fireEvent.change(screen.getByLabelText('Board issued time'), { target: { value: '09:15' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wave tomorrow' }));
    expect(loadPrefs()).toMatchObject({ enabled: true, timer: { on: false }, board: { on: true, minutes: 9 * 60 + 15 }, wave: { on: false } });
    expect(screen.getByLabelText('Wave tomorrow time')).toBeDisabled();
  });

  it('explains a denied permission and stays off', async () => {
    mock = mockNotification('default', 'denied');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    expect(master()).not.toBeChecked();
    expect(loadPrefs().enabled).toBe(false);
    expect(screen.getByText(/notifications are blocked for this site/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Board issued' })).toBeNull();
  });

  it('explains an already denied permission on tap, without asking again', async () => {
    mock = mockNotification('denied');
    seedStore();
    render(<SettingsScreen />);
    expect(screen.queryByText(/notifications are blocked for this site/i)).toBeNull();
    await act(async () => {
      fireEvent.click(master());
    });
    expect(screen.getByText(/notifications are blocked for this site/i)).toBeInTheDocument();
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(loadPrefs().enabled).toBe(false);
  });

  it('says nothing was sent when the prompt is dismissed', async () => {
    mock = mockNotification('default', 'default');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    expect(master()).not.toBeChecked();
    expect(screen.getByText(/permission was not granted/i)).toBeInTheDocument();
  });

  it('turns itself off from the master toggle and keeps the choices', async () => {
    mock = mockNotification('granted');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    fireEvent.change(screen.getByLabelText('Board issued time'), { target: { value: '10:00' } });
    fireEvent.click(master());
    expect(loadPrefs()).toMatchObject({ enabled: false, board: { minutes: 600 } });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Board issued' })).toBeNull());
  });

  it('shows an unavailable state when the browser has no Notification API', () => {
    restore = removeNotification();
    seedStore();
    render(<SettingsScreen />);
    expect(master()).toBeDisabled();
    expect(screen.getByText(/cannot show notifications here/i)).toBeInTheDocument();
  });

  it('keeps the switch off with a note when the browser will not store the choice', async () => {
    mock = mockNotification('granted');
    seedStore();
    render(<SettingsScreen />);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      await act(async () => {
        fireEvent.click(master());
      });
    } finally {
      spy.mockRestore();
    }
    expect(master()).not.toBeChecked();
    expect(screen.getByText(/would not keep that choice/i)).toBeInTheDocument();
    expect(loadPrefs().enabled).toBe(false);
  });

  it('links the intro, the honesty note and each help line to its toggle for screen readers', async () => {
    mock = mockNotification('granted');
    seedStore();
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.click(master());
    });
    const described = (el: HTMLElement) =>
      (el.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    expect(described(master())).toMatch(/Opt-in and local/);
    expect(described(master())).toMatch(/when the app is closed nothing fires/i);
    expect(described(screen.getByRole('checkbox', { name: 'Board issued' }))).toMatch(/never before the day starts/i);
    expect(described(screen.getByRole('checkbox', { name: 'Wave tomorrow' }))).toMatch(/evening before a wave settles/i);
    expect(described(screen.getByRole('checkbox', { name: 'Timer finished' }))).toMatch(/running timer quest/i);
  });

  it('does not promise delivery while the app is closed or in the background', () => {
    mock = mockNotification('granted');
    seedStore();
    render(<SettingsScreen />);
    const copy = document.body.textContent ?? '';
    expect(copy).toMatch(/open on screen/i);
    expect(copy).toMatch(/phones pause apps in the background/i);
    expect(copy).not.toMatch(/schedule notifications itself/i);
  });
});

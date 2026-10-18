import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

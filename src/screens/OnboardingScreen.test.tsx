import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INITIAL_STATE, useGameStore } from '../state/gameStore';
import { OnboardingScreen } from './OnboardingScreen';

describe('OnboardingScreen', () => {
  it('walks vignette -> name -> habits and creates the save', () => {
    useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] });
    render(<OnboardingScreen />);
    expect(screen.getByRole('heading', { name: /protocol online/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('');
    expect(name).toHaveAttribute('placeholder', 'Absolute');
    fireEvent.change(name, { target: { value: 'Rin' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('heading', { name: /assign the vassals/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/hardcore/i));
    fireEvent.click(screen.getByLabelText(/^outside/i));
    fireEvent.click(screen.getByRole('button', { name: /open the haven/i }));

    const st = useGameStore.getState();
    expect(st.onboarded).toBe(true);
    expect(st.save?.player.name).toBe('Rin');
    expect(st.save?.settings.difficulty).toBe('hardcore');
    expect(st.save?.settings.enabledHabits).not.toContain('outside');
    expect(st.save?.board).not.toBeNull();
  });

  it('keeps at least one habit enabled', () => {
    useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] });
    render(<OnboardingScreen />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes.slice(1)) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    const checked = boxes.filter((b) => (b as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]).toBeDisabled();
  });
});

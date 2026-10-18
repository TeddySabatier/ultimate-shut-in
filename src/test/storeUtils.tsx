/** Shared helpers for the UI tests (not a test file). */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { SaveFile, Settings } from '../game';
import { INITIAL_STATE, useGameStore } from '../state/gameStore';

/** Start from a clean store, then create a save with today's board issued. */
export function seedStore(name = 'Tester', settings: Partial<Settings> = {}): SaveFile {
  useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] });
  useGameStore.getState().finishOnboarding(name, { reducedMotion: true, ...settings });
  useGameStore.setState({ pendingEvents: [] });
  const save = useGameStore.getState().save;
  if (!save) throw new Error('seedStore failed');
  return save;
}

export function currentSave(): SaveFile {
  const save = useGameStore.getState().save;
  if (!save) throw new Error('no save');
  return save;
}

export function renderWithRouter(ui: ReactElement): RenderResult {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

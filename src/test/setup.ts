import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { INITIAL_STATE, useGameStore } from '../state/gameStore';

afterEach(() => {
  cleanup();
  useGameStore.setState({ ...INITIAL_STATE, pendingEvents: [] });
  localStorage.clear();
});

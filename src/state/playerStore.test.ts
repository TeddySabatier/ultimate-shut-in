import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerStore, STORAGE_KEY } from './playerStore';

describe('playerStore', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it('starts at level 1 with 0 xp', () => {
    const { level, xp } = usePlayerStore.getState();
    expect(level).toBe(1);
    expect(xp).toBe(0);
  });

  it('levels up when xp crosses the threshold', () => {
    usePlayerStore.getState().gainXp(250);
    const { level, xp } = usePlayerStore.getState();
    expect(level).toBe(3);
    expect(xp).toBe(50);
  });

  it('persists to localStorage', () => {
    usePlayerStore.getState().setName('Tester');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.name).toBe('Tester');
  });
});

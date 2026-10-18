import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { seedStore } from './test/storeUtils';

describe('App', () => {
  it('opens on the onboarding vignette when no save exists', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /protocol online/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /main navigation/i })).toBeNull();
  });

  it('renders the Haven and the tab bar once onboarded', () => {
    seedStore('Keeper');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'The Room' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /haven/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /board/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ledger/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });
});

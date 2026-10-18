import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the home screen and the tab bar', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /ultimate shut-in/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /quests/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /character/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });
});

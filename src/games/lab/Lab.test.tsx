/**
 * The Games Lab through the real App router: the gate, the list, playing the
 * sample to an outcome, replaying the same seed, bot play, and no save written.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { OutcomeView } from './LabGame';

function at(hash: string) {
  window.location.hash = hash;
}

/** Click the first "Send" ally until the duel ends. */
function playDuel() {
  for (let i = 0; i < 5; i++) {
    const allies = screen.queryAllByRole('button', { name: /^Send / });
    if (allies.length === 0) return;
    fireEvent.click(allies[0]!);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  at('');
});

describe('Games Lab', () => {
  it('lists every game, dev-only ones included, in dev builds', async () => {
    at('#/lab');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Games Lab' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play Coin Duel' })).toHaveAttribute('href', '#/lab/sample');
    expect(screen.getByText('dev only')).toBeInTheDocument();
  });

  it('redirects to the Haven in production without the debug flag', async () => {
    vi.stubEnv('DEV', false);
    at('#/lab/sample');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /protocol online/i })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
  });

  it('opens in production when localStorage haven.debug is 1', async () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem('haven.debug', '1');
    at('#/lab');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Games Lab' })).toBeInTheDocument();
  });

  it('plays the sample to an outcome, replays the same seed identically, and never writes a save', async () => {
    at('#/lab/sample?seed=42&lang=en&rm=1');
    render(<App />);
    await screen.findAllByRole('button', { name: /^Send / });
    playDuel();
    const panel = screen.getByTestId('lab-outcome');
    const first = within(panel).getByTestId('lab-outcome-log').textContent;
    expect(within(panel).getByTestId('lab-outcome-result')).toHaveTextContent(/^(won|lost)$/);

    fireEvent.click(screen.getByRole('button', { name: 'Replay same seed' }));
    await screen.findAllByRole('button', { name: /^Send / });
    playDuel();
    expect(within(panel).getByTestId('lab-outcome-log').textContent).toBe(first);
    expect(screen.getByTestId('lab-compare')).toHaveTextContent('Matches the previous run.');
    expect(localStorage.getItem('haven.save')).toBeNull();
  });

  it('bot play shows the engine outcome; the toggles live in the URL', async () => {
    at('#/lab/sample?seed=7&lang=fr&rm=1');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Duel de pièces' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bot play' }));
    expect(screen.getByTestId('lab-outcome-result')).toHaveTextContent(/^(won|lost)$/);
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Party' }), { target: { value: 'starter' } });
    });
    expect(window.location.hash).toContain('party=starter');
    expect(await screen.findAllByRole('button', { name: /^Envoyer / })).toHaveLength(3);
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Difficulty' }), { target: { value: '5' } });
    });
    expect(window.location.hash).toContain('difficulty=5');
  });

  it('opens with the mixed party, the hard run and a difficulty from the URL', async () => {
    at('#/lab/sample?seed=4&lang=en&party=mixed&run=hard&difficulty=1&rm=1');
    render(<App />);
    expect(await screen.findByRole('button', { name: /^Send Ada/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Run' })).toHaveValue('hard');
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toHaveValue('1');
  });

  it('shows an invalid outcome in red, and nothing for a valid one', () => {
    const party = [{ id: 'move', name: 'Pell' }];
    const { unmount } = render(<OutcomeView result={{ source: 'player', outcome: { result: 'won', score: 1500, log: [''], troopsUsed: ['ghost'] } }} party={party} locale="en" />);
    const alert = screen.getByTestId('lab-outcome-problems');
    expect(alert).toHaveTextContent(/score 1500 must be an integer/);
    expect(alert).toHaveTextContent(/"ghost", which is not in the party/);
    unmount();
    render(<OutcomeView result={{ source: 'bot', outcome: { result: 'lost', score: 200, log: ['ok'], troopsUsed: ['move'] } }} party={party} locale="en" />);
    expect(screen.queryByTestId('lab-outcome-problems')).toBeNull();
  });

  it('adds a seed to the URL when there is none', async () => {
    at('#/lab/sample');
    render(<App />);
    await screen.findAllByRole('button', { name: /^Send |^Envoyer / });
    expect(window.location.hash).toMatch(/seed=\d+/);
  });
});

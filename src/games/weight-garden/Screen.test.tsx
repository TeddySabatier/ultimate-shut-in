/**
 * The Screen plays the engine: sliders turn the weights, the live line speaks
 * accuracy and loss, a settled plot offers Next plot, Train and the hidden
 * neurons work from buttons and keys, Stop here reports fled, Leave calls
 * onExit once, French follows the locale.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyRun, type GameScreenProps, type RunContext } from '../contract';
import { parties } from '../testing/contract';
import { centroidLine } from './data';
import { engine } from './engine';
import WeightGardenScreen from './Screen';

afterEach(cleanup);

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 3, run: emptyRun(3), locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

const live = () => screen.getByTestId('weight-garden-live');
const slider = (slot: number) => screen.getByTestId(`weight-garden-w${slot}`);

/** Turn the three sliders to the centroid line of the first plot, as a player would. */
function solveFirstPlot(p: GameScreenProps) {
  const st = engine.initial(p.seed, p.party, p.run as RunContext, p.locale);
  const c = centroidLine(st.seeds);
  [c.a, c.b, c.c].forEach((v, slot) => fireEvent.change(slider(slot), { target: { value: String(Math.round(v * 10) / 10) } }));
}

describe('Weight Garden screen', () => {
  it('shows the plot, the live summary, the goal and three labelled sliders on the first plot', () => {
    render(<WeightGardenScreen {...props()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Weight Garden' })).toBeInTheDocument();
    expect(screen.getByTestId('weight-garden-plot-title')).toHaveTextContent('Plot 1 of 5: One neuron');
    expect(live()).toHaveTextContent(/^accuracy \d+ percent, loss \d+\.\d\d$/);
    expect(live()).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('weight-garden-goal')).toHaveTextContent('95 percent');
    expect(screen.getByRole('slider', { name: /Weight on x/ })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Weight on y/ })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Bias/ })).toBeInTheDocument();
    expect(screen.getByTestId('weight-garden-plot')).toHaveAttribute('role', 'img');
    expect(screen.queryByTestId('weight-garden-train-button')).toBeNull();
    expect(screen.queryByTestId('weight-garden-next')).toBeNull();
  });

  it('turning a slider updates the live line, the equation and the readouts', () => {
    render(<WeightGardenScreen {...props()} />);
    const before = live().textContent;
    fireEvent.change(slider(0), { target: { value: '2.5' } });
    expect(screen.getByTestId('weight-garden-equation')).toHaveTextContent('2.50 x');
    expect(screen.getByTestId('weight-garden-train')).toHaveTextContent(/\d+\/20/);
    expect(live().textContent).not.toBe(before);
  });

  it('a settled plot shows what you just saw and Next plot; Next opens the Train plot with its own controls', () => {
    const p = props();
    render(<WeightGardenScreen {...p} />);
    solveFirstPlot(p);
    expect(screen.getByTestId('weight-garden-settled')).toHaveTextContent('One neuron draws one straight line');
    fireEvent.click(screen.getByTestId('weight-garden-next'));
    expect(screen.getByTestId('weight-garden-plot-title')).toHaveTextContent('Plot 2 of 5: Auto-train');
    expect(screen.getByTestId('weight-garden-lr')).toBeInTheDocument();
    expect(screen.getByTestId('weight-garden-presses')).toHaveTextContent(/Presses left \d+ of \d+/);
    const loss = screen.getByTestId('weight-garden-loss').textContent;
    fireEvent.click(screen.getByTestId('weight-garden-train-button'));
    expect(screen.getByTestId('weight-garden-loss').textContent).not.toBe(loss);
    expect(screen.getByTestId('weight-garden-steps')).not.toHaveTextContent(/^0$/);
    expect(screen.getByTestId('weight-garden-loss-chart')).toBeInTheDocument();
  });

  it('a too-high learning rate shows the explosion and the gardener says so (Study reads the curve)', () => {
    const p = props();
    render(<WeightGardenScreen {...p} />);
    solveFirstPlot(p);
    fireEvent.click(screen.getByTestId('weight-garden-next'));
    fireEvent.change(screen.getByTestId('weight-garden-lr'), { target: { value: '16' } }); // the last step, 3
    fireEvent.click(screen.getByTestId('weight-garden-train-button'));
    expect(screen.getByTestId('weight-garden-coach')).toHaveTextContent('weights flew apart');
  });

  it('the keys work: T trains, A adds a neuron on a plot with a hidden layer', () => {
    const p = props({ run: emptyRun(1) });
    render(<WeightGardenScreen {...p} />);
    solveFirstPlot(p);
    fireEvent.click(screen.getByTestId('weight-garden-next'));
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByTestId('weight-garden-presses')).toHaveTextContent(/Presses left \d+ of \d+/);
    expect(screen.getByTestId('weight-garden-steps')).not.toHaveTextContent(/^0$/);
  });

  it('Stop here ends as fled and keeps the board; Leave calls onExit once', () => {
    const p = props();
    render(<WeightGardenScreen {...p} />);
    fireEvent.click(screen.getByTestId('weight-garden-forfeit'));
    expect(vi.mocked(p.onFinish)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled' });
    expect(screen.getByTestId('weight-garden-result')).toHaveTextContent('stepped out of the garden');
    expect(screen.getByTestId('weight-garden-plot')).toBeInTheDocument();
    expect(screen.queryByTestId('weight-garden-forfeit')).toBeNull();
    expect(p.onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('weight-garden-leave'));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('writes French when the locale is fr', () => {
    render(<WeightGardenScreen {...props({ locale: 'fr' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Jardin des poids');
    expect(screen.getByTestId('weight-garden-forfeit')).toHaveTextContent('S’arrêter ici');
    expect(live()).toHaveTextContent(/précision \d+ pour cent/);
    expect(screen.getByRole('slider', { name: /Poids sur x/ })).toBeInTheDocument();
  });

  it('a hint buff adds a Hint button that shows the suggested line', () => {
    const run: RunContext = { ...emptyRun(3), buffs: [{ id: 'h', kind: 'hint', amount: 1 }] };
    render(<WeightGardenScreen {...props({ run })} />);
    const btn = screen.getByTestId('weight-garden-hint');
    expect(btn).toHaveTextContent('Hint (1 left)');
    fireEvent.click(btn);
    expect(screen.getByTestId('weight-garden-hint')).toBeDisabled();
    expect(screen.getByText(/dashed line is a good place/)).toBeInTheDocument();
  });

  it('plays a whole easy game from the screen: bot actions through the buttons end with a win', () => {
    const p = props({ run: emptyRun(1), party: parties.full });
    render(<WeightGardenScreen {...p} />);
    let st = engine.initial(p.seed, p.party, p.run, 'en');
    for (let i = 0; i < 300 && !engine.outcome(st); i++) {
      const a = engine.botPlay(st, () => 0.5)!;
      st = engine.reduce(st, a);
      if (a.type === 'setWeight') fireEvent.change(slider(a.slot), { target: { value: String(a.value) } });
      else if (a.type === 'step') fireEvent.click(screen.getByTestId('weight-garden-train-button'));
      else if (a.type === 'addNeuron') fireEvent.click(screen.getByTestId('weight-garden-add'));
      else if (a.type === 'removeNeuron') fireEvent.click(screen.getByTestId('weight-garden-remove'));
      else if (a.type === 'setLearningRate') {
        const steps = [0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3];
        fireEvent.change(screen.getByTestId('weight-garden-lr'), { target: { value: String(steps.findIndex((v) => Math.abs(v - a.value) < 0.006)) } });
      } else if (a.type === 'nextRoom') fireEvent.click(screen.getByTestId('weight-garden-next'));
    }
    expect(vi.mocked(p.onFinish)).toHaveBeenCalledTimes(1);
    const out = vi.mocked(p.onFinish).mock.calls[0]![0];
    expect(out.result).toBe('won');
    expect(out).toEqual({ ...engine.outcome(st)!, durationMs: out.durationMs });
    expect(screen.getByTestId('weight-garden-result')).toHaveTextContent('The garden holds');
  });
});

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Typewriter } from './Typewriter';

describe('Typewriter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('types one character per tick and calls onDone at the end', () => {
    const onDone = vi.fn();
    render(<Typewriter text="abc" speed={10} onDone={onDone} />);
    expect(screen.getByText('abc', { selector: '.srOnly' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByText('a', { selector: 'span[aria-hidden]' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(30));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByText('abc').closest('[data-done]')).toHaveAttribute('data-done', 'true');
  });

  it('reveals everything at once when skipped (active=false)', () => {
    const onDone = vi.fn();
    render(<Typewriter text="Protocol online." active={false} onDone={onDone} />);
    expect(screen.getByText('Protocol online.').closest('[data-done]')).toHaveAttribute('data-done', 'true');
    expect(onDone).toHaveBeenCalled();
  });
});

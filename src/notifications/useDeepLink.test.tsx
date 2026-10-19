import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useComposeDeepLink } from './useDeepLink';

function Probe({ onCompose }: { onCompose?: () => void }) {
  const once = useComposeDeepLink(onCompose);
  const { search } = useLocation();
  return (
    <p>
      <span data-testid="once">{String(once)}</span>
      <span data-testid="search">{search}</span>
    </p>
  );
}

describe('useComposeDeepLink', () => {
  it('reports the link once, calls the handler once and clears the parameter', () => {
    const onCompose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/quests?compose=1']}>
        <Probe onCompose={onCompose} />
      </MemoryRouter>,
    );
    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
    expect(screen.getByTestId('once')).toHaveTextContent('false'); // the link was consumed
  });

  it('does nothing without the parameter, and keeps other parameters', () => {
    const onCompose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/quests?other=1']}>
        <Probe onCompose={onCompose} />
      </MemoryRouter>,
    );
    expect(onCompose).not.toHaveBeenCalled();
    expect(screen.getByTestId('search')).toHaveTextContent('?other=1');
  });

  it('only accepts compose=1', () => {
    const onCompose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/quests?compose=0']}>
        <Probe onCompose={onCompose} />
      </MemoryRouter>,
    );
    expect(onCompose).not.toHaveBeenCalled();
  });
});

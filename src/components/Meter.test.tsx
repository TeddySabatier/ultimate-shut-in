import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from './Meter';

describe('Meter', () => {
  it('exposes an accessible progressbar with the value text', () => {
    render(<Meter value={42} max={100} label="Power" tone="bright" />);
    const bar = screen.getByRole('progressbar', { name: 'Power' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuetext', '42 of 100');
    expect(screen.getByText('42/100')).toBeInTheDocument();
  });

  it('clamps out-of-range values and never divides by zero', () => {
    render(<Meter value={150} max={0} label="Odd" hideText />);
    const bar = screen.getByRole('progressbar', { name: 'Odd' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
  });
});

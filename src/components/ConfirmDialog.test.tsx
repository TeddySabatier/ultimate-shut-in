import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing while closed and the body while open', () => {
    const { rerender } = render(
      <ConfirmDialog open={false} title="Sure?" onConfirm={() => {}} onCancel={() => {}}>
        body
      </ConfirmDialog>,
    );
    expect(screen.queryByText('Sure?')).toBeNull();
    rerender(
      <ConfirmDialog open title="Sure?" onConfirm={() => {}} onCancel={() => {}}>
        body
      </ConfirmDialog>,
    );
    expect(screen.getByText('Sure?')).toBeInTheDocument();
  });

  it('keeps Confirm disabled until the guard text is typed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Reset?" confirmText="RESET" confirmLabel="Reset" danger onConfirm={onConfirm} onCancel={onCancel}>
        gone
      </ConfirmDialog>,
    );
    const confirm = screen.getByRole('button', { name: 'Reset' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'RESET' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

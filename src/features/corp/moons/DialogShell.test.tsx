import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DialogShell } from './BookDialogs';

function setup(canConfirm: boolean) {
  const run = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <DialogShell
      open
      onClose={onClose}
      title="Pay"
      confirmLabel="Go"
      canConfirm={canConfirm}
      run={run}
    >
      <input aria-label="Amount" />
    </DialogShell>
  );
  return { run, onClose, user: userEvent.setup() };
}

describe('DialogShell', () => {
  it('Enter in a field submits when Confirm is on', async () => {
    const { run, user } = setup(true);
    await user.type(screen.getByLabelText('Amount'), '5{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps a disabled Confirm focusable, says why, and does not submit', async () => {
    const { run, user } = setup(false);
    await user.type(screen.getByLabelText('Amount'), '5{Enter}');
    expect(run).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Go' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toBeDisabled();
    expect(screen.getByText(/required fields/i)).toBeInTheDocument();
  });

  it('asks before Escape discards typed input', async () => {
    const { onClose, user } = setup(true);
    await user.type(screen.getByLabelText('Amount'), '5');
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard what you typed?')).toBeInTheDocument();
  });
});

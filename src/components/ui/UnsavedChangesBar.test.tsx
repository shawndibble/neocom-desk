import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedChangesBar } from './UnsavedChangesBar';

const base = {
  message: 'Unsaved changes',
  discardLabel: 'Discard',
  saveLabel: 'Save',
};

describe('UnsavedChangesBar', () => {
  it('saves and discards', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<UnsavedChangesBar {...base} onSave={onSave} onDiscard={onDiscard} />);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('shows the problems and does not save while one is open', async () => {
    const onSave = vi.fn();
    render(
      <UnsavedChangesBar
        {...base}
        problems="1 problem to fix before saving"
        onSave={onSave}
        onDiscard={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 problem to fix before saving');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { FittingSaveButton } from './FittingSaveButton';

function setup(canSave: boolean, onSave = vi.fn()) {
  render(
    <FittingSaveButton
      onSave={onSave}
      canSave={canSave}
      saveBlockedReason="Nothing to save yet"
      updating={false}
      onSaveAsNew={vi.fn()}
      onSaveToEve={vi.fn()}
      canSaveToEve={false}
    />
  );
  return onSave;
}

describe('FittingSaveButton', () => {
  it('blocks with aria-disabled, so the reason stays in a tooltip', async () => {
    const user = userEvent.setup();
    const onSave = setup(false);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toHaveAttribute('title');
    await user.hover(save);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Nothing to save yet');
    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves when it can', async () => {
    const user = userEvent.setup();
    const onSave = setup(true);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CORPS } from './addCorpsFixtures';
import { HiddenCorpsDialog } from './HiddenCorpsDialog';

describe('HiddenCorpsDialog', () => {
  it('lists the hidden corps, adds one back and closes with Done', async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(<HiddenCorpsDialog corps={CORPS.slice(10)} onAdd={onAdd} onClose={onClose} />);
    expect(screen.getByText('Wren Hollow Corp')).toBeInTheDocument();
    expect(screen.getByText('Dunmoor Freight')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Dunmoor Freight back' }));
    expect(onAdd).toHaveBeenCalledWith(CORPS[11]!.corporationId);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});

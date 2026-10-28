import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastStack } from './ToastStack';

const items = [
  { id: 'a', message: 'Deleted "A"' },
  { id: 'b', message: 'Deleted "B"' },
];

describe('ToastStack', () => {
  it('renders nothing for no items', () => {
    render(<ToastStack items={[]} undoLabel="Undo" onUndo={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('gives every entry its own Undo, oldest first', async () => {
    const onUndo = vi.fn();
    render(<ToastStack items={items} undoLabel="Undo" onUndo={onUndo} onClose={vi.fn()} />);
    const undos = screen.getAllByRole('button', { name: 'Undo' });
    expect(undos).toHaveLength(2);
    await userEvent.click(undos[0]);
    expect(onUndo).toHaveBeenCalledWith('a');
  });

  it('closes one entry on its close button, leaving the other', async () => {
    const onClose = vi.fn();
    render(<ToastStack items={items} undoLabel="Undo" onUndo={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getAllByRole('button', { name: /close/i })[1]);
    expect(onClose).toHaveBeenCalledExactlyOnceWith('b');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useInPlaceEdit, type InPlaceEditOptions } from './useInPlaceEdit';

function Field(props: Partial<InPlaceEditOptions> & { onCommit: InPlaceEditOptions['onCommit'] }) {
  const { editing, start, triggerRef, failure, inputProps } = useInPlaceEdit({
    initial: () => 'Alpha',
    ...props,
  });
  return (
    <div>
      {editing ? (
        <input aria-label="Name" {...inputProps} />
      ) : (
        <button ref={triggerRef} onClick={start}>
          Rename
        </button>
      )}
      {failure !== undefined && <p role="alert">{String(failure)}</p>}
    </div>
  );
}

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
  return screen.getByRole('textbox', { name: 'Name' });
};

describe('useInPlaceEdit', () => {
  it('saves a changed draft on Enter once, and hands focus back to the trigger', async () => {
    const onCommit = vi.fn();
    render(<Field onCommit={onCommit} />);
    const input = await open();
    expect(input).toHaveValue('Alpha');
    await userEvent.clear(input);
    await userEvent.type(input, 'Beta{Enter}');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Beta');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus());
  });

  it('cancels on Escape and saves nothing unchanged', async () => {
    const onCommit = vi.fn();
    render(<Field onCommit={onCommit} />);
    await userEvent.type(await open(), 'x{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.type(await open(), '{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('saves on blur', async () => {
    const onCommit = vi.fn();
    render(<Field onCommit={onCommit} />);
    await userEvent.type(await open(), '2');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith('Alpha2');
  });

  it('reopens with the draft kept when the save is refused', async () => {
    render(<Field onCommit={() => Promise.reject(new Error('refused'))} />);
    await userEvent.type(await open(), '3{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('refused');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alpha3');
  });

  it('opens already editing and reports the close', async () => {
    const onClose = vi.fn();
    const onCommit = vi.fn();
    render(<Field open onClose={onClose} onCommit={onCommit} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), '{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

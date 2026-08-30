import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { Modal } from './Modal';

/**
 * A trigger plus a controlled Modal — the shape both real call sites use, and
 * the only way to assert focus actually returns to the element that opened it.
 *
 * jsdom has no `<dialog>` behaviour of its own; `vitest.setup.ts` supplies the
 * observable parts (open state, initial focus, cancelable `cancel` on Escape).
 */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import plan">
        <button type="button">Inside</button>
      </Modal>
    </>
  );
}

async function open() {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  await user.click(trigger);
  return { user, trigger, dialog: screen.getByRole('dialog', { name: 'Import plan' }) };
}

describe('Modal', () => {
  it('opens as a modal dialog with an accessible name and content', async () => {
    const { dialog } = await open();
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('moves focus into the dialog on open and back to the trigger on close', async () => {
    const { user, trigger, dialog } = await open();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger } = await open();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on a backdrop click but not on a click inside the content', async () => {
    const { user, dialog } = await open();

    await user.click(screen.getByRole('button', { name: 'Inside' }));
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();

    // The ::backdrop is not an element of its own — backdrop clicks surface
    // with the <dialog> itself as the event target.
    await user.click(dialog);
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
  });

  it('closes and restores focus when unmounted while open', async () => {
    // PlanEditor gates ImportClipboardDialog on `{importOpen && …}`, so for that
    // call site "close" arrives as an unmount rather than an `open` flip.
    function UnmountHarness() {
      const [mounted, setMounted] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setMounted(true)}>
            Open
          </button>
          {mounted && (
            <Modal open onClose={() => setMounted(false)} title="Import plan">
              <button type="button">Inside</button>
            </Modal>
          )}
        </>
      );
    }

    const user = userEvent.setup();
    render(<UnmountHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders no content while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(screen.queryByText('Import plan')).not.toBeInTheDocument();
  });
});

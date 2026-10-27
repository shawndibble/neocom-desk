import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { Modal } from './Modal';

/**
 * A trigger plus a controlled Modal — the shape both real call sites use, and
 * the only way to assert focus returns to the element that opened it.
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
  it('Escape in a Modal opened inside another closes only the inner one', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <Modal open onClose={outerClose} title="Settings">
        <Modal open onClose={innerClose} title="Confirm">
          <p>Sure?</p>
        </Modal>
      </Modal>
    );
    const inner = screen.getByRole('dialog', { name: 'Confirm' });
    fireEvent(inner, new Event('cancel', { cancelable: true }));
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

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

    // The ::backdrop is not an element of its own — such clicks surface with
    // the <dialog> itself as the event target.
    await user.click(dialog);
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
  });

  it('ignores a backdrop click when dismissOnOutsidePress is off, but still closes on Escape', async () => {
    const onCloseSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onCloseSpy} title="Form" dismissOnOutsidePress={false}>
        <button type="button">Inside</button>
      </Modal>
    );
    await user.click(screen.getByRole('dialog', { name: 'Form' }));
    expect(onCloseSpy).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('closes and restores focus when unmounted while open', async () => {
    // PlanEditor gates ImportClipboardDialog on `{importOpen && …}`, so there
    // "close" arrives as an unmount rather than an `open` flip.
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

  it('renders the footer inside the dialog but outside its scrolling body, after it in focus order', async () => {
    const user = userEvent.setup();
    render(
      <Modal
        open
        onClose={() => {}}
        title="Filters"
        placement="sheet"
        footer={<button type="button">Apply</button>}
      >
        <button type="button">Inside</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    const inside = screen.getByRole('button', { name: 'Inside' });
    const apply = screen.getByRole('button', { name: 'Apply' });
    // The body is the one scroller: it carries `tabIndex={-1}` for open-time focus.
    const body = inside.closest('[tabindex="-1"]');
    expect(body).not.toBeNull();
    expect(body).not.toContainElement(apply);
    expect(dialog).toContainElement(apply);

    inside.focus();
    await user.tab();
    expect(apply).toHaveFocus();
  });

  it('renders no content while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(screen.queryByText('Import plan')).not.toBeInTheDocument();
  });

  it('hands focus to the fallback when nothing was focused as it opened', async () => {
    function Gone() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" id="fallback">
            Fallback
          </button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Import plan"
            returnFocusFallback={() => document.getElementById('fallback')}
          >
            <button type="button">Inside</button>
          </Modal>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Gone />);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fallback' })).toHaveFocus();
  });
});

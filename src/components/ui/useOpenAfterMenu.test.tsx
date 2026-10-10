import { describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { Modal } from './Modal';
import { useOpenAfterMenu } from './useOpenAfterMenu';

/** Records what held focus as the dialog's content mounted, just before `showModal()`. */
function FocusProbe({ onMount }: { onMount?: (focused: Element | null) => void }) {
  useEffect(() => {
    onMount?.(document.activeElement);
  }, [onMount]);
  return <p>Sure?</p>;
}

function Harness({
  keepFocus = false,
  onOpen,
  onCallerCloseAutoFocus,
  onDialogMount,
}: {
  keepFocus?: boolean;
  onOpen?: () => void;
  onCallerCloseAutoFocus?: (event: Event) => void;
  onDialogMount?: (focused: Element | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const afterMenu = useOpenAfterMenu(onCallerCloseAutoFocus);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button">Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onCloseAutoFocus={afterMenu.onCloseAutoFocus}>
          <DropdownMenuItem
            onSelect={() =>
              afterMenu.run(
                () => {
                  onOpen?.();
                  setOpen(true);
                },
                { keepFocus }
              )
            }
          >
            Delete…
          </DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete plan">
        <FocusProbe onMount={onDialogMount} />
      </Modal>
    </>
  );
}

async function chooseDelete(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const trigger = screen.getByRole('button', { name: 'Actions' });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Delete…' }));
  return { user, trigger };
}

describe('useOpenAfterMenu', () => {
  it('opens the dialog only once the menu has closed and handed focus to its trigger', async () => {
    let menuOpenAtCallback: boolean | null = null;
    let focusedAtDialogMount: Element | null = null;
    const { trigger } = await chooseDelete({
      onOpen: () => {
        menuOpenAtCallback = screen.queryByRole('menu') !== null;
      },
      onDialogMount: (focused) => {
        focusedAtDialogMount = focused;
      },
    });

    expect(screen.getByRole('dialog', { name: 'Delete plan' })).toBeInTheDocument();
    expect(menuOpenAtCallback).toBe(false);
    expect(focusedAtDialogMount).toBe(trigger);
  });

  it('puts focus back on the menu button when the dialog closes', async () => {
    const { user, trigger } = await chooseDelete();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('with keepFocus, stops the menu returning focus and still runs the callback', async () => {
    const onCallerCloseAutoFocus = vi.fn();
    const onOpen = vi.fn();
    await chooseDelete({ keepFocus: true, onOpen, onCallerCloseAutoFocus });

    expect(onOpen).toHaveBeenCalledTimes(1);
    const event = onCallerCloseAutoFocus.mock.calls[0]?.[0] as Event;
    expect(event.defaultPrevented).toBe(true);
  });

  it("still runs the caller's own onCloseAutoFocus, with or without a pending callback", async () => {
    const onCallerCloseAutoFocus = vi.fn();
    const user = userEvent.setup();
    render(<Harness onCallerCloseAutoFocus={onCallerCloseAutoFocus} />);
    const trigger = screen.getByRole('button', { name: 'Actions' });

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onCallerCloseAutoFocus).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    expect(onCallerCloseAutoFocus).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog', { name: 'Delete plan' })).toBeInTheDocument();
  });

  it('runs a stored callback once, not again on the next close', async () => {
    const onOpen = vi.fn();
    const { user, trigger } = await chooseDelete({ onOpen });
    await user.keyboard('{Escape}');

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

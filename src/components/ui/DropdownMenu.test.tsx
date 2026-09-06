import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { Modal } from './Modal';

function Harness({
  onRefresh,
  onDisabledSelect,
}: { onRefresh?: () => void; onDisabledSelect?: () => void } = {}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">Actions</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onRefresh}>Refresh</DropdownMenuItem>
        <DropdownMenuItem disabled onSelect={onDisabledSelect}>
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Remove character</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function openMenu(props?: { onRefresh?: () => void; onDisabledSelect?: () => void }) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const trigger = screen.getByRole('button', { name: 'Actions' });
  await user.click(trigger);
  return { user, trigger };
}

describe('DropdownMenu', () => {
  /**
   * `Modal` runs on `showModal()`, so the dialog sits in the browser's top
   * layer with everything outside it inert. A surface portalled to
   * `document.body` — Radix's default — would render behind it and take no
   * clicks; see `portalContainer.ts`.
   */
  it('portals its menu inside a Modal, not to the body', async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} title="Order detail">
        <Harness />
      </Modal>
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    expect(screen.getByRole('dialog', { name: 'Order detail' })).toContainElement(
      screen.getByRole('menu')
    );
  });

  it('opens on click and lists its items', async () => {
    await openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('opens with the keyboard and selects an item with Enter', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<Harness onRefresh={onRefresh} />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    trigger.focus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('marks a disabled item and never fires its select handler on click', async () => {
    const onDisabledSelect = vi.fn();
    const { user } = await openMenu({ onDisabledSelect });
    const item = screen.getByRole('menuitem', { name: 'Export CSV' });
    expect(item).toHaveAttribute('data-disabled');

    await user.click(item);
    expect(onDisabledSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger } = await openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

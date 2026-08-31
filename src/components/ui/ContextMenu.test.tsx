import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './ContextMenu';

function Harness({
  onCopyName,
  onDisabledSelect,
}: { onCopyName?: () => void; onDisabledSelect?: () => void } = {}) {
  return (
    <>
      <button type="button">Elsewhere</button>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div tabIndex={0}>Tritanium</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Add to Quickbar</ContextMenuItem>
          <ContextMenuItem disabled onSelect={onDisabledSelect}>
            No blueprint options
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>Copy</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={onCopyName}>Copy name</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}

function openMenu(props?: { onCopyName?: () => void; onDisabledSelect?: () => void }) {
  render(<Harness {...props} />);
  const target = screen.getByText('Tritanium');
  target.focus();
  fireEvent.contextMenu(target);
  return target;
}

describe('ContextMenu', () => {
  it('opens on right-click and lists its items', () => {
    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
  });

  it('marks a disabled item and never fires its select handler on click', async () => {
    const onDisabledSelect = vi.fn();
    const user = userEvent.setup();
    openMenu({ onDisabledSelect });
    const item = screen.getByRole('menuitem', { name: 'No blueprint options' });
    expect(item).toHaveAttribute('data-disabled');

    await user.click(item);
    expect(onDisabledSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('jumps to the matching item via typeahead', async () => {
    const user = userEvent.setup();
    openMenu();

    await user.keyboard('c');
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toHaveFocus();
  });

  it('opens a submenu via the keyboard and selects an item inside it', async () => {
    const onCopyName = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>Tritanium</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Add to Quickbar</ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Copy</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={onCopyName}>Copy name</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      </>
    );
    fireEvent.contextMenu(screen.getByText('Tritanium'));

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onCopyName).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const target = openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(target).toHaveFocus();
  });
});

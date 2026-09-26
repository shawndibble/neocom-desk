import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import {
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  RowActionsMenu,
  RowMoreActions,
} from './RowActions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';

function Row({ onInto }: { onInto: () => void }) {
  return (
    <RowActionsMenu
      name="Heavy Missile Launcher II"
      items={
        <>
          <MenuItem>Show info</MenuItem>
          <MenuSub>
            <MenuSubTrigger>Load charge from cargo</MenuSubTrigger>
            <MenuSubContent>
              <MenuSub>
                <MenuSubTrigger>Scourge Heavy Missile</MenuSubTrigger>
                <MenuSubContent>
                  <MenuItem onSelect={onInto}>Into this module</MenuItem>
                </MenuSubContent>
              </MenuSub>
            </MenuSubContent>
          </MenuSub>
        </>
      }
    >
      <div>
        Heavy Missile Launcher II
        <RowMoreActions />
      </div>
    </RowActionsMenu>
  );
}

function openMore() {
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'More actions for Heavy Missile Launcher II' }),
    { button: 0, pointerType: 'mouse' }
  );
}

/** A phone: the narrow-menu query matches. */
function narrowViewport() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (media: string) =>
      ({
        media,
        matches: media.includes('max-width'),
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
}

describe('RowActions submenus', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens a submenu in place on a phone, nested ones too, with no second menu panel', async () => {
    narrowViewport();
    const onInto = vi.fn();
    const user = userEvent.setup();
    render(<Row onInto={onInto} />);
    openMore();

    const load = await screen.findByRole('menuitem', { name: 'Load charge from cargo' });
    expect(load).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: 'Scourge Heavy Missile' })).toBeNull();

    await user.click(load);
    expect(load).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Scourge Heavy Missile' }));
    await user.click(screen.getByRole('menuitem', { name: 'Into this module' }));

    expect(onInto).toHaveBeenCalledOnce();
    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  it('works an in-place submenu from the keyboard as the side panel does', async () => {
    narrowViewport();
    const user = userEvent.setup();
    render(<Row onInto={() => {}} />);
    openMore();
    const load = await screen.findByRole('menuitem', { name: 'Load charge from cargo' });
    expect(load).toHaveAttribute('aria-haspopup', 'menu');

    // ArrowRight opens it and moves into it; ArrowLeft closes it and returns.
    load.focus();
    await user.keyboard('{ArrowRight}');
    const scourge = await screen.findByRole('menuitem', { name: 'Scourge Heavy Missile' });
    expect(scourge).toHaveFocus();
    expect(load).toHaveAttribute('aria-expanded', 'true');

    // A nested one: ArrowRight in, ArrowLeft back to its own trigger only.
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Into this module' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(scourge).toHaveFocus();
    expect(screen.queryByRole('menuitem', { name: 'Into this module' })).toBeNull();
    expect(load).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(load).toHaveFocus();
    expect(load).toHaveAttribute('aria-expanded', 'false');

    // Enter opens it too, and Escape still closes the whole menu.
    await user.keyboard('{Enter}');
    expect(load).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens a plain DropdownMenuSub in place on a phone too', async () => {
    narrowViewport();
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Plan actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to group</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Group A</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Plan actions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Move to group' }));
    expect(screen.getByRole('menuitem', { name: 'Group A' })).toBeInTheDocument();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('keeps the menu up while a submenu opens in place, all in one panel', async () => {
    narrowViewport();
    const user = userEvent.setup();
    render(<Row onInto={() => {}} />);
    openMore();
    await user.click(await screen.findByRole('menuitem', { name: 'Load charge from cargo' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('group')).toContainElement(
      screen.getByRole('menuitem', { name: 'Scourge Heavy Missile' })
    );
  });

  it('opens a submenu as a panel beside the menu on a wider screen', async () => {
    const user = userEvent.setup();
    render(<Row onInto={() => {}} />);
    openMore();
    const load = await screen.findByRole('menuitem', { name: 'Load charge from cargo' });
    load.focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Scourge Heavy Missile' })).toBeVisible();
    expect(screen.getAllByRole('menu')).toHaveLength(2);
  });
});

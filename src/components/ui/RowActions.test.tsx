import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { claimSessionHint, hintSeenCount, resetSessionHints, useHintCounts } from '@/lib/hintFlags';
import { stubViewport } from '@/test/viewport';
import {
  MenuGroup,
  MenuItem,
  MenuSeparator,
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

describe('openHref', () => {
  it('leads the ⋮ menu with a new-tab link, and none without one', async () => {
    const { unmount } = render(
      <RowActionsMenu name="Row" items={<MenuItem>Show info</MenuItem>} openHref="/market/1">
        <div>
          Row
          <RowMoreActions />
        </div>
      </RowActionsMenu>
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for Row' }), {
      button: 0,
      pointerType: 'mouse',
    });
    const link = await screen.findByRole('menuitem', { name: 'Open in new tab' });
    expect(link).toHaveAttribute('href', '/market/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    unmount();
    render(
      <RowActionsMenu name="Row" items={<MenuItem>Show info</MenuItem>}>
        <div>
          Row
          <RowMoreActions />
        </div>
      </RowActionsMenu>
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for Row' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await screen.findByRole('menuitem', { name: 'Show info' });
    expect(screen.queryByRole('menuitem', { name: 'Open in new tab' })).toBeNull();
  });
});

function openMore() {
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'More actions for Heavy Missile Launcher II' }),
    { button: 0, pointerType: 'mouse' }
  );
}

/** A phone: the narrow-menu query matches. */
function narrowViewport() {
  stubViewport((media) => media.includes('max-width'));
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

let seq = 0;
const uniqueName = () => `Tritanium ${seq++}`;

describe('restraint: a row menu needs at least two real actions (DESIGN.md §6c)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not count separators as actions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <RowActionsMenu
        name={uniqueName()}
        items={
          <>
            <MenuItem>Show info</MenuItem>
            <MenuSeparator />
            {false}
          </>
        }
      >
        <div>Tritanium</div>
      </RowActionsMenu>
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('one real action'));
  });

  it('warns in dev for a one-action menu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <RowActionsMenu name={uniqueName()} items={<MenuItem>Show info</MenuItem>}>
        <div>Tritanium</div>
      </RowActionsMenu>
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('one real action'));
  });

  it('stays quiet for two actions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <RowActionsMenu
        name={uniqueName()}
        items={
          <>
            <MenuItem>Rename</MenuItem>
            <MenuItem>Duplicate</MenuItem>
          </>
        }
      >
        <div>
          Tritanium
          <RowMoreActions />
        </div>
      </RowActionsMenu>
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once per row name, not per render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui = (
      <RowActionsMenu name="Once" items={<MenuItem>Show info</MenuItem>}>
        <div>Once</div>
      </RowActionsMenu>
    );
    const { rerender } = render(ui);
    rerender(ui);
    render(ui);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn on a lone submenu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <RowActionsMenu
        name={uniqueName()}
        items={
          <MenuSub>
            <MenuSubTrigger>Load</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem>Into module</MenuItem>
            </MenuSubContent>
          </MenuSub>
        }
      >
        <div>Row</div>
      </RowActionsMenu>
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('linksKeepBrowserMenu: a link in the row keeps the browser link menu (DESIGN.md §6c "Entities")', () => {
  function LinkRow() {
    return (
      <RowActionsMenu
        name="Plasmoids"
        linksKeepBrowserMenu
        items={
          <>
            <MenuItem>Show info</MenuItem>
            <MenuItem>View in Market</MenuItem>
          </>
        }
      >
        <div>
          <a href="/planetary-industry/map?product=2389">Plasmoids</a>
          <input aria-label="Units per day" />
          <span>row body</span>
        </div>
      </RowActionsMenu>
    );
  }

  it('opens the row menu on a right-click on the row body', async () => {
    render(<LinkRow />);
    fireEvent.contextMenu(screen.getByText('row body'));
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it('leaves a right-click on the link to the browser', () => {
    render(<LinkRow />);
    const link = screen.getByRole('link', { name: 'Plasmoids' });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
  it('leaves a right-click in a text field to the browser (paste, select)', () => {
    render(<LinkRow />);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    screen.getByRole('textbox', { name: 'Units per day' }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  // Touch-and-hold is checked in the browser: jsdom's pointer events carry no pointerType.
});

describe('row menu hints', () => {
  const plainRow = (
    <RowActionsMenu name="Row" items={<MenuItem>Show info</MenuItem>}>
      <div>
        Row
        <RowMoreActions />
      </div>
    </RowActionsMenu>
  );

  beforeEach(() => {
    useHintCounts.setState({ value: {}, hydrated: true });
    resetSessionHints();
  });

  it('adds the right-click tip to the first three ⋮ opens, never the right-click menu', async () => {
    const user = userEvent.setup();
    // The hint on the ⋮ is its own subject below; spend it first.
    useHintCounts.setState({ value: { rowHint: 1 }, hydrated: true });
    render(plainRow);
    const more = screen.getByRole('button', { name: 'More actions for Row' });

    for (let open = 1; open <= 3; open++) {
      await user.click(more);
      expect(await screen.findByText('Tip: right-click any row')).toBeInTheDocument();
      await user.keyboard('{Escape}');
    }
    expect(hintSeenCount(useHintCounts.getState().value, 'rowMenuTip')).toBe(3);

    await user.click(more);
    await screen.findByRole('menuitem', { name: 'Show info' });
    expect(screen.queryByText('Tip: right-click any row')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    fireEvent.contextMenu(screen.getByText('Row'));
    await screen.findByRole('menuitem', { name: 'Show info' });
    expect(screen.queryByText(/Tip: right-click any row/)).not.toBeInTheDocument();
  });

  it('keeps the tip off until the counts have loaded', async () => {
    const user = userEvent.setup();
    useHintCounts.setState({ value: {}, hydrated: false });
    render(plainRow);
    await user.click(screen.getByRole('button', { name: 'More actions for Row' }));
    await screen.findByRole('menuitem', { name: 'Show info' });
    expect(screen.queryByText('Tip: right-click any row')).not.toBeInTheDocument();
  });

  it('hints once, on the first ⋮ only, and Got it ends it for good', async () => {
    const user = userEvent.setup();
    render(
      <>
        {plainRow}
        {plainRow}
      </>
    );
    const hint = await screen.findByText('Tip: right-click any row to open its actions');
    expect(screen.getAllByText('Tip: right-click any row to open its actions')).toHaveLength(1);
    expect(hint).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/to open its actions/)).not.toBeInTheDocument();
    expect(hintSeenCount(useHintCounts.getState().value, 'rowHint')).toBe(1);
  });

  it('does not hint again once seen, or in a session that already showed a hint', () => {
    useHintCounts.setState({ value: { rowHint: 1 }, hydrated: true });
    const { unmount } = render(plainRow);
    expect(screen.queryByText(/to open its actions/)).not.toBeInTheDocument();
    unmount();

    useHintCounts.setState({ value: {}, hydrated: true });
    expect(claimSessionHint('goTo')).toBe(true);
    render(plainRow);
    expect(screen.queryByText(/to open its actions/)).not.toBeInTheDocument();
  });
});

describe('MenuGroup', () => {
  function open(items: React.ReactNode) {
    render(
      <RowActionsMenu name="Tritanium" items={items}>
        <div>
          Tritanium
          <RowMoreActions />
        </div>
      </RowActionsMenu>
    );
    fireEvent.contextMenu(screen.getByText('Tritanium'));
  }

  it('sorts groups into the fixed order, whatever order they are written or merged in', async () => {
    open(
      <>
        <MenuGroup id="copy">
          <MenuItem>Copy name</MenuItem>
        </MenuGroup>
        <MenuGroup id="primary">
          <MenuItem>Show info</MenuItem>
        </MenuGroup>
        <MenuGroup id="copy">
          <MenuItem>Copy new price</MenuItem>
        </MenuGroup>
      </>
    );
    const names = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(names).toEqual(['Show info', 'Copy name', 'Copy new price']);
    expect(screen.getAllByRole('group')).toHaveLength(2);
  });

  it('folds a track group of three or more into a submenu, and keeps a smaller one flat', async () => {
    const user = userEvent.setup();
    open(
      <>
        <MenuGroup id="primary">
          <MenuItem>Show info</MenuItem>
        </MenuGroup>
        <MenuGroup id="track">
          <MenuItem>Add to Quickbar</MenuItem>
          <MenuItem>Set price alert</MenuItem>
          <MenuItem>Set stock target</MenuItem>
        </MenuGroup>
        <MenuGroup id="game">
          <MenuItem>Open in EVE</MenuItem>
          <MenuItem>Set waypoint in game</MenuItem>
        </MenuGroup>
      </>
    );
    expect(await screen.findByRole('menuitem', { name: 'Open in EVE' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Set price alert' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Track' }));
    expect(await screen.findByRole('menuitem', { name: 'Set price alert' })).toBeInTheDocument();
  });

  it('folds on a declared size, summed across merged groups, not on the element count', async () => {
    open(
      <>
        <MenuGroup id="game" size={1}>
          <MenuItem>Open in EVE</MenuItem>
        </MenuGroup>
        {/* One wrapper element that renders two items. */}
        <MenuGroup id="game" size={2}>
          <>
            <MenuItem>Set waypoint in game</MenuItem>
            <MenuItem>View route</MenuItem>
          </>
        </MenuGroup>
      </>
    );
    expect(await screen.findByRole('menuitem', { name: 'In game' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'View route' })).not.toBeInTheDocument();
  });

  it('keeps a group flat when its declared size is under three, whatever it holds', async () => {
    open(
      <MenuGroup id="track" size={1}>
        <MenuItem>Set stock target</MenuItem>
        <MenuItem>Add to Quickbar</MenuItem>
        <MenuItem>Set price alert</MenuItem>
      </MenuGroup>
    );
    expect(await screen.findByRole('menuitem', { name: 'Set stock target' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Track' })).not.toBeInTheDocument();
  });

  it('drops a hand-placed separator among grouped items: the groups own the hairlines', async () => {
    open(
      <>
        <MenuSeparator />
        <MenuGroup id="primary">
          <MenuItem>Show info</MenuItem>
        </MenuGroup>
      </>
    );
    await screen.findByRole('menuitem', { name: 'Show info' });
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('puts an item outside any group last, and leaves a menu with no groups as written', async () => {
    open(
      <>
        <MenuItem>Remove from list</MenuItem>
        <MenuGroup id="primary">
          <MenuItem>Show info</MenuItem>
        </MenuGroup>
      </>
    );
    const names = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(names).toEqual(['Show info', 'Remove from list']);
  });

  it('renders ungrouped items untouched, with no group wrapper', async () => {
    open(
      <>
        <MenuItem>Show info</MenuItem>
        <MenuSeparator />
        <MenuItem>Copy name</MenuItem>
      </>
    );
    await screen.findByRole('menuitem', { name: 'Show info' });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

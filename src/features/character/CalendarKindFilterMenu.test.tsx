import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';
import { CalendarKindFilterMenu } from './CalendarKindFilterMenu';

async function openMenu(
  hidden: CharacterBoardItemKind[],
  onShowAll = vi.fn(),
  counts = new Map<CharacterBoardItemKind, number>(),
  readableKinds: readonly CharacterBoardItemKind[] = CHARACTER_BOARD_ITEM_KINDS,
  reauthKinds: readonly CharacterBoardItemKind[] = []
) {
  const user = userEvent.setup();
  const onHideAll = vi.fn();
  render(
    <CalendarKindFilterMenu
      hidden={hidden}
      onToggle={() => {}}
      onShowAll={onShowAll}
      onHideAll={onHideAll}
      counts={counts}
      readableKinds={readableKinds}
      reauthKinds={reauthKinds}
    />
  );
  await user.click(screen.getByRole('button', { name: /filter event types/i }));
  return { user, onShowAll, onHideAll };
}

describe('CalendarKindFilterMenu keyboard access', () => {
  it('every focusable child of the menu is a menu item', async () => {
    await openMenu([CHARACTER_BOARD_ITEM_KINDS[0]]);
    const menu = screen.getByRole('menu');
    const focusable = menu.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]'
    );
    const stray = [...focusable].filter(
      (el) => !(el.getAttribute('role') ?? '').startsWith('menuitem')
    );
    expect(stray).toEqual([]);
  });

  it('End reaches "Select none"; Enter hides every listed kind and keeps the menu open', async () => {
    const first = CHARACTER_BOARD_ITEM_KINDS[0];
    const { user, onHideAll } = await openMenu([], vi.fn(), new Map([[first, 2]]));
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Select none' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onHideAll).toHaveBeenCalledWith([first]);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('"Select all" runs onShowAll', async () => {
    const { user, onShowAll } = await openMenu([CHARACTER_BOARD_ITEM_KINDS[0]]);
    await user.click(screen.getByRole('menuitem', { name: 'Select all' }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it('is disabled when nothing is hidden', async () => {
    await openMenu([]);
    expect(screen.getByRole('menuitem', { name: 'Select all' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});

describe('CalendarKindFilterMenu empty kinds', () => {
  it('drops a readable kind with nothing due', async () => {
    const [first, second] = CHARACTER_BOARD_ITEM_KINDS;
    await openMenu([], vi.fn(), new Map([[first, 2]]));
    const rows = screen.getAllByRole('menuitemcheckbox');
    expect(rows).toHaveLength(1);
    expect(second).toBeDefined();
  });

  it('keeps a hidden kind so it can be turned back on', async () => {
    const [first, second] = CHARACTER_BOARD_ITEM_KINDS;
    await openMenu([second], vi.fn(), new Map([[first, 2]]));
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(2);
  });

  it('drops Mercenary dens when the Character cannot read them (an opt-in that is off)', async () => {
    const readable = CHARACTER_BOARD_ITEM_KINDS.filter((kind) => kind !== 'mercenaryDen');
    await openMenu([], vi.fn(), new Map(), readable);
    expect(screen.queryByRole('menuitemcheckbox', { name: /mercenary dens/i })).toBeNull();
  });

  it('keeps Mercenary dens when a granted den scope needs a new login', async () => {
    const readable = CHARACTER_BOARD_ITEM_KINDS.filter((kind) => kind !== 'mercenaryDen');
    await openMenu([], vi.fn(), new Map(), readable, ['mercenaryDen']);
    expect(screen.getByRole('menuitemcheckbox', { name: /mercenary dens/i })).toBeTruthy();
  });
});

describe('CalendarKindFilterMenu corporation filter', () => {
  const corporations = [
    { id: 1, name: 'Main Corp', ticker: 'MAIN' },
    { id: 2, name: 'Holding Two', ticker: 'HOLD2' },
  ];

  async function openCorpMenu(list: typeof corporations) {
    const user = userEvent.setup();
    const onCorpFilter = vi.fn();
    render(
      <CalendarKindFilterMenu
        hidden={[]}
        onToggle={() => {}}
        onShowAll={() => {}}
        onHideAll={() => {}}
        counts={new Map()}
        readableKinds={[]}
        reauthKinds={[]}
        corporations={list}
        corpFilter="all"
        onCorpFilter={onCorpFilter}
      />
    );
    await user.click(screen.getByRole('button', { name: /filter event types/i }));
    (await screen.findByRole('menuitem', { name: /corporation events/i })).focus();
    await user.keyboard('{Enter}');
    return { user, onCorpFilter };
  }

  it('picks one corporation out of several', async () => {
    const { user, onCorpFilter } = await openCorpMenu(corporations);
    (await screen.findByRole('menuitemradio', { name: 'Holding Two [HOLD2]' })).focus();
    await user.keyboard('{Enter}');
    expect(onCorpFilter).toHaveBeenCalledWith(2);
  });

  it('offers only All and Hide for a single corporation', async () => {
    await openCorpMenu(corporations.slice(0, 1));
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(2);
    expect(screen.getByRole('menuitemradio', { name: 'All corporations' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Hide corporation events' })).toBeVisible();
  });
});

describe('CalendarKindFilterMenu sharing-corporation filter (#6224)', () => {
  const sharing = [
    { id: 5, name: 'Sharing One', ticker: 'SH1' },
    { id: 6, name: 'Sharing Two', ticker: 'SH2' },
  ];

  function renderMenu(list: typeof sharing, onSharingCorpFilter = vi.fn()) {
    render(
      <CalendarKindFilterMenu
        hidden={[]}
        onToggle={() => {}}
        onShowAll={() => {}}
        onHideAll={() => {}}
        counts={new Map([['sharedMoonPop', 2]])}
        readableKinds={['sharedMoonPop']}
        reauthKinds={[]}
        sharingCorporations={list}
        sharingCorpFilter="all"
        onSharingCorpFilter={onSharingCorpFilter}
      />
    );
    return onSharingCorpFilter;
  }

  it('lists Shared moon pops as a kind and picks one sharing corporation', async () => {
    const user = userEvent.setup();
    const onSharingCorpFilter = renderMenu(sharing);
    await user.click(screen.getByRole('button', { name: /filter event types/i }));
    expect(
      await screen.findByRole('menuitemcheckbox', { name: /shared moon pops/i })
    ).toBeVisible();
    (await screen.findByRole('menuitem', { name: /shared moon pops by/i })).focus();
    await user.keyboard('{Enter}');
    (await screen.findByRole('menuitemradio', { name: 'Sharing Two [SH2]' })).focus();
    await user.keyboard('{Enter}');
    expect(onSharingCorpFilter).toHaveBeenCalledWith(6);
  });

  it('offers no sharing filter for a single sharing corporation', async () => {
    const user = userEvent.setup();
    renderMenu(sharing.slice(0, 1));
    await user.click(screen.getByRole('button', { name: /filter event types/i }));
    await screen.findByRole('menuitemcheckbox', { name: /shared moon pops/i });
    expect(screen.queryByRole('menuitem', { name: /shared moon pops by/i })).toBeNull();
  });
});

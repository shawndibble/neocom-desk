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
  render(
    <CalendarKindFilterMenu
      hidden={hidden}
      onToggle={() => {}}
      onShowAll={onShowAll}
      counts={counts}
      readableKinds={readableKinds}
      reauthKinds={reauthKinds}
      skillPlanChoices={[]}
      chosenSkillPlanId={null}
      skillPlanError={null}
      onChooseSkillPlan={() => {}}
    />
  );
  await user.click(screen.getByRole('button', { name: /filter event types/i }));
  return { user, onShowAll };
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

  it('End reaches "Show all types"; Enter runs it and keeps the menu open', async () => {
    const { user, onShowAll } = await openMenu([CHARACTER_BOARD_ITEM_KINDS[0]]);
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: /show all/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('is disabled when nothing is hidden', async () => {
    await openMenu([]);
    expect(screen.getByRole('menuitem', { name: /show all/i })).toHaveAttribute(
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
        counts={new Map()}
        readableKinds={[]}
        reauthKinds={[]}
        skillPlanChoices={[]}
        chosenSkillPlanId={null}
        skillPlanError={null}
        onChooseSkillPlan={() => {}}
        corporations={list}
        corpFilter="all"
        onCorpFilter={onCorpFilter}
      />
    );
    await user.click(screen.getByRole('button', { name: /filter event types/i }));
    // By keyboard: a pointer leaving the submenu trigger closes it under jsdom.
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

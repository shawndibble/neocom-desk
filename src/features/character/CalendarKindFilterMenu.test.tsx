import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';
import { CalendarKindFilterMenu } from './CalendarKindFilterMenu';

async function openMenu(hidden: CharacterBoardItemKind[], onShowAll = vi.fn()) {
  const user = userEvent.setup();
  render(
    <CalendarKindFilterMenu
      hidden={hidden}
      onToggle={() => {}}
      onShowAll={onShowAll}
      counts={new Map()}
      readableKinds={[...CHARACTER_BOARD_ITEM_KINDS]}
      reauthKinds={[]}
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

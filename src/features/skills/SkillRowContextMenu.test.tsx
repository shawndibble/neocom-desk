import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { SkillRowContextMenu } from './SkillRowContextMenu';

const scheduleSyncMock = vi.fn();
vi.mock('@/sync', () => ({
  scheduleSync: (characterId: number) => scheduleSyncMock(characterId),
}));
vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  isSyncConfigured: () => true,
}));

const CHAR_ID = 91;

function renderMenu(currentLevel = 2, tooltipContent?: string | null) {
  const onRowClick = vi.fn();
  const view = render(
    <SkillRowContextMenu
      activeCharacterId={CHAR_ID}
      skillTypeID={3300}
      currentLevel={currentLevel}
      tooltipContent={tooltipContent}
    >
      <button type="button" onClick={onRowClick}>
        Gunnery
      </button>
    </SkillRowContextMenu>
  );
  return { ...view, onRowClick };
}

beforeEach(async () => {
  await db.skillPlans.clear();
  scheduleSyncMock.mockClear();
});

describe('SkillRowContextMenu — Add to Skill Plan (#405)', () => {
  it("lists the character's plans by name and adds the skill to the chosen one", async () => {
    await db.skillPlans.add({
      id: 'plan-1',
      characterId: CHAR_ID,
      name: 'PvP Fit',
      entries: [],
      remapCount: 0,
      updatedAt: 0,
    });

    renderMenu(2);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Gunnery' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add to Skill Plan' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'PvP Fit' }));

    await waitFor(async () => {
      const plan = await db.skillPlans.get('plan-1');
      expect(plan?.entries).toEqual([{ skillTypeID: 3300, targetLevel: 3 }]);
    });
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it('shows a disabled placeholder when the character has no skill plans', async () => {
    renderMenu(2);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Gunnery' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add to Skill Plan' }));

    const placeholder = await screen.findByRole('menuitem', { name: 'No skill plans yet' });
    expect(placeholder).toHaveAttribute('data-disabled');
  });

  it('disables the whole action once the skill is already level 5', async () => {
    await db.skillPlans.add({
      id: 'plan-1',
      characterId: CHAR_ID,
      name: 'PvP Fit',
      entries: [],
      remapCount: 0,
      updatedAt: 0,
    });

    renderMenu(5);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Gunnery' }));

    const trigger = await screen.findByRole('menuitem', { name: 'Add to Skill Plan' });
    expect(trigger).toHaveAttribute('data-disabled');
  });

  it("composes with a row tooltip without breaking either the tooltip or the row's own click, or the context menu", async () => {
    // Tooltip must wrap ContextMenuTrigger, which wraps the real button, for
    // both Radix Slot chains to reach the same DOM node (see this file's own
    // composition comment) — this proves all three still work stacked
    // together, not just each interaction proven in isolation.
    const user = userEvent.setup();
    const { onRowClick } = renderMenu(2, 'Trains gunnery skills faster.');
    const row = screen.getByRole('button', { name: 'Gunnery' });

    fireEvent.focus(row);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Trains gunnery skills faster.');

    await user.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(row);
    expect(await screen.findByRole('menuitem', { name: 'Add to Skill Plan' })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { SkillPlanAdd } from './SkillPlanAdd';

const scheduleSyncMock = vi.fn();
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  scheduleSync: (characterId: number) => scheduleSyncMock(characterId),
}));
vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  isSyncConfigured: () => true,
}));

const CHAR_ID = 91;

function renderAdd(currentLevel = 2) {
  return render(
    <SkillPlanAdd
      characterId={CHAR_ID}
      skillTypeID={3300}
      skillName="Gunnery"
      currentLevel={currentLevel}
    />
  );
}

const plan = (
  id: string,
  name: string,
  entries: { skillTypeID: number; targetLevel: number }[]
) => ({
  id,
  characterId: CHAR_ID,
  name,
  entries,
  remapCount: 0,
  updatedAt: 0,
});

beforeEach(async () => {
  await db.skillPlans.clear();
  scheduleSyncMock.mockClear();
});

describe('SkillPlanAdd', () => {
  it('adds the next level to the plan and offers Undo', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', []));
    const user = userEvent.setup();
    renderAdd(2);

    await user.click(await screen.findByRole('button', { name: 'Add to Skill Plan' }));
    await waitFor(async () => {
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 3300, targetLevel: 3 },
      ]);
    });
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([]));
  });

  it('adds into the plan picked when there are several', async () => {
    await db.skillPlans.bulkAdd([plan('plan-1', 'PvP Fit', []), plan('plan-2', 'Mining', [])]);
    const user = userEvent.setup();
    renderAdd(2);

    await user.click(await screen.findByRole('combobox', { name: 'Adding to' }));
    await user.click(await screen.findByRole('option', { name: 'Mining' }));
    await user.click(screen.getByRole('button', { name: 'Add to Skill Plan' }));
    await waitFor(async () =>
      expect((await db.skillPlans.get('plan-2'))?.entries).toEqual([
        { skillTypeID: 3300, targetLevel: 3 },
      ])
    );
  });

  it('offers to create a plan when there is none', async () => {
    const user = userEvent.setup();
    renderAdd(0);
    await user.click(await screen.findByRole('button', { name: 'Create Skill Plan and add' }));
    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0]?.entries).toEqual([{ skillTypeID: 3300, targetLevel: 1 }]);
    });
  });

  it('shows Planned instead of a button when the plan already covers the level', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', [{ skillTypeID: 3300, targetLevel: 3 }]));
    renderAdd(2);
    expect(await screen.findByText('Planned')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Skill Plan' })).toBeNull();
  });

  it('says so at level 5 and offers nothing', async () => {
    renderAdd(5);
    expect(screen.getByText('Already at level 5')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
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

// Gunnery (3300) is a prerequisite of Small Hybrid Turret (3301) at level 4.
const ENGINE_SKILLS: ReadonlyMap<number, EngineSkill> = new Map([
  [
    3300,
    {
      typeID: 3300,
      name: 'Gunnery',
      rank: 1,
      primary: 'perception',
      secondary: 'willpower',
      prereqs: [],
    },
  ],
  [
    3301,
    {
      typeID: 3301,
      name: 'Small Hybrid Turret',
      rank: 1,
      primary: 'perception',
      secondary: 'willpower',
      prereqs: [{ typeID: 3300, level: 4 }],
    },
  ],
]);

function renderAdd(currentLevel = 2) {
  const trainedSkills = new Map<number, TrainedSkill>([[3300, { level: currentLevel, sp: 0 }]]);
  return render(
    <SkillPlanAdd
      characterId={CHAR_ID}
      skillTypeID={3300}
      skillName="Gunnery"
      engineSkills={ENGINE_SKILLS}
      trainedSkills={trainedSkills}
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

    await user.click(await screen.findByRole('button', { name: 'Add level 3 to Skill Plan' }));
    await waitFor(async () => {
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 3300, targetLevel: 3 },
      ]);
    });
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([]));
  });

  it('Undo takes back every level added in a row, not just the last', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', []));
    const user = userEvent.setup();
    renderAdd(2);

    await user.click(await screen.findByRole('button', { name: 'Add level 3 to Skill Plan' }));
    await user.click(await screen.findByRole('button', { name: 'Add level 4 to Skill Plan' }));
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.entries).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([]));
  });

  it('moves focus to Undo after Add, and back to Add after Undo', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', []));
    const user = userEvent.setup();
    renderAdd(2);

    await user.click(await screen.findByRole('button', { name: 'Add level 3 to Skill Plan' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    await waitFor(() => expect(undo).toHaveFocus());

    await user.click(undo);
    const add = await screen.findByRole('button', { name: 'Add level 3 to Skill Plan' });
    await waitFor(() => expect(add).toHaveFocus());
  });

  it('adds into the plan picked when there are several', async () => {
    await db.skillPlans.bulkAdd([plan('plan-1', 'PvP Fit', []), plan('plan-2', 'Mining', [])]);
    const user = userEvent.setup();
    renderAdd(2);

    await user.click(await screen.findByRole('combobox', { name: 'Adding to' }));
    await user.click(await screen.findByRole('option', { name: 'Mining' }));
    await user.click(screen.getByRole('button', { name: 'Add level 3 to Skill Plan' }));
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

  it('offers the level after the one the plan already has', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', [{ skillTypeID: 3300, targetLevel: 3 }]));
    const user = userEvent.setup();
    renderAdd(2);

    await user.click(await screen.findByRole('button', { name: 'Add level 4 to Skill Plan' }));
    await waitFor(async () =>
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 3300, targetLevel: 3 },
        { skillTypeID: 3300, targetLevel: 4 },
      ])
    );
  });

  it('counts a level the plan trains as a prerequisite as planned', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', [{ skillTypeID: 3301, targetLevel: 1 }]));
    renderAdd(2);
    expect(
      await screen.findByRole('button', { name: 'Add level 5 to Skill Plan' })
    ).toBeInTheDocument();
  });

  it('shows Planned instead of a button when the plan already reaches level 5', async () => {
    await db.skillPlans.add(plan('plan-1', 'PvP Fit', [{ skillTypeID: 3300, targetLevel: 5 }]));
    renderAdd(2);
    expect(await screen.findByText('Planned')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skill Plan/ })).toBeNull();
  });

  it('says so at level 5 and offers nothing', async () => {
    renderAdd(5);
    expect(screen.getByText('Already at level 5')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

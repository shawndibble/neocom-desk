import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { EngineSkill, PlanEntry } from '@/engine/types';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { MissingSkillsChip } from './MissingSkillsChip';

const GUNNERY: EngineSkill = {
  typeID: 3300,
  name: 'Gunnery',
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
};
const DRONES: EngineSkill = { ...GUNNERY, typeID: 3436, name: 'Drones' };
const ENTRIES: PlanEntry[] = [
  { skillTypeID: 3300, targetLevel: 3 },
  { skillTypeID: 3436, targetLevel: 4 },
];

vi.mock('@/features/skills/planner/usePlanEditorData', () => ({
  usePlanEditorData: () => ({
    catalog: {
      engineSkills: new Map([
        [3300, GUNNERY],
        [3436, DRONES],
      ]),
    },
    trainedSkills: new Map(),
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
  }),
}));

let planEntries: PlanEntry[] = [];
const addEntries = vi.fn(async (entries: readonly PlanEntry[]) => ({
  planId: 'plan-1',
  planName: 'Vexor',
  added: [...entries],
}));
vi.mock('@/features/skills/useTargetPlan', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTargetPlan: (): TargetPlan => ({
    plans: [{ id: 'plan-1', name: 'Vexor', entries: planEntries } as never],
    targetPlanId: 'plan-1',
    setTargetPlanId: vi.fn(),
    addEntries,
    removeEntries: vi.fn(async () => {}),
  }),
}));

async function openChip(user: ReturnType<typeof userEvent.setup>) {
  render(<MissingSkillsChip entries={ENTRIES} characterId={1} fittingName="Vexor" />);
  await user.click(await screen.findByRole('button', { name: /missing 2 skills/i }));
}

describe('MissingSkillsChip', () => {
  it('confirms next to the button once the skills were added', async () => {
    planEntries = [];
    const user = userEvent.setup();
    await openChip(user);

    await user.click(screen.getByRole('button', { name: 'Add all to Skill Plan' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Added 2 skills to Vexor');
  });

  it('calls out skills already in the plan and only adds the rest', async () => {
    planEntries = [{ skillTypeID: 3300, targetLevel: 3 }];
    addEntries.mockClear();
    const user = userEvent.setup();
    await openChip(user);

    expect(screen.getByText('1 skill is already in the Skill Plan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add all to Skill Plan' }));
    await waitFor(() =>
      expect(addEntries).toHaveBeenCalledWith([{ skillTypeID: 3436, targetLevel: 4 }], 'Vexor')
    );
  });

  it('hides Add all when every skill is already in the plan', async () => {
    planEntries = [...ENTRIES];
    const user = userEvent.setup();
    await openChip(user);

    expect(
      screen.getByText('All of these skills are already in the Skill Plan')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add all to Skill Plan' })).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { EngineSkill, PlanEntry } from '@/engine/types';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { MasteryChip } from './MasteryChip';

const GUNNERY: EngineSkill = {
  typeID: 3300,
  name: 'Gunnery',
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
};
const DRONES: EngineSkill = { ...GUNNERY, typeID: 3436, name: 'Drones' };

const trained = new Map([[3300, { skillId: 3300, level: 3 }]]);

vi.mock('@/sde/loadSde', () => ({
  loadMasteries: vi.fn(async () => ({
    '626': [
      [{ skillTypeID: 3300, level: 2 }], // I
      [{ skillTypeID: 3300, level: 3 }], // II
      [
        { skillTypeID: 3300, level: 3 },
        { skillTypeID: 3436, level: 4 },
      ], // III
      [], // IV
      [], // V
    ],
  })),
}));
vi.mock('@/features/skills/planner/usePlanEditorData', () => ({
  usePlanEditorData: () => ({
    catalog: {
      engineSkills: new Map([
        [3300, GUNNERY],
        [3436, DRONES],
      ]),
    },
    trainedSkills: trained,
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
  }),
}));

const target: TargetPlan = {
  plans: [],
  targetPlanId: null,
  setTargetPlanId: vi.fn(),
  addEntries: vi.fn(async (entries: readonly PlanEntry[]) => ({
    planId: 'plan-1',
    planName: 'Vexor',
    added: [...entries],
  })),
  removeEntries: vi.fn(async () => {}),
};
vi.mock('@/features/skills/useTargetPlan', () => ({ useTargetPlan: () => target }));

async function openChip(user: ReturnType<typeof userEvent.setup>, hullTypeId = 626) {
  render(<MasteryChip hullTypeId={hullTypeId} hullName="Vexor" characterId={1} />);
  await user.click(await screen.findByRole('button', { name: 'Mastery' }));
}

describe('MasteryChip', () => {
  it('shows every tier merged by skill for the hull, at the highest level asked', async () => {
    const user = userEvent.setup();
    await openChip(user);

    expect(await screen.findByText('Vexor Mastery')).toBeInTheDocument();
    // Gunnery is named by tiers I-III at levels 2/3/3: one row, not three.
    expect(screen.getAllByText('Gunnery')).toHaveLength(1);
    expect(screen.getByText('Drones')).toBeInTheDocument();
  });

  it('narrows to the chosen tier', async () => {
    const user = userEvent.setup();
    await openChip(user);
    await screen.findByText('Drones');

    await user.click(screen.getByRole('button', { name: 'II' }));

    expect(screen.queryByText('Drones')).not.toBeInTheDocument();
    expect(screen.getByText('Gunnery')).toBeInTheDocument();
  });

  it('Hide completed drops trained rows and Add All adds only the untrained ones on screen', async () => {
    const user = userEvent.setup();
    await openChip(user);
    await screen.findByText('Drones');

    await user.click(screen.getByRole('button', { name: 'Hide completed' }));
    expect(screen.queryByText('Gunnery')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create skill plan and add/i }));
    await waitFor(() =>
      expect(target.addEntries).toHaveBeenCalledWith(
        [{ skillTypeID: 3436, targetLevel: 4 }],
        'Vexor'
      )
    );
  });

  it('renders nothing for a hull with no Mastery data', async () => {
    render(<MasteryChip hullTypeId={999} hullName="Nothing" characterId={1} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mastery' })).toBeNull());
  });
});

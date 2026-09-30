import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { normalizePlan } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import type { SkillGain } from '@/engine/fittings/skillGains';
import { newPlan } from '@/features/skills/planner/newPlan';
import { FittingWhatToTrainPanel } from './FittingWhatToTrainPanel';
import type { SkillGainEvaluator } from './useFittingEvaluation';

const CHARACTER_ID = 4242;

const GUNNERY: EngineSkill = {
  typeID: 3300,
  name: 'Gunnery',
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
};
// Needs Gunnery III, which the pilot hasn't got: a missing prerequisite.
const SURGICAL: EngineSkill = {
  ...GUNNERY,
  typeID: 3315,
  name: 'Surgical Strike',
  rank: 4,
  prereqs: [{ typeID: 3300, level: 3 }],
};
const DRONES: EngineSkill = { ...GUNNERY, typeID: 3436, name: 'Drones' };
const SKILLS = new Map([
  [3300, GUNNERY],
  [3315, SURGICAL],
  [3436, DRONES],
]);
const trained = new Map<number, TrainedSkill>([
  [3300, { level: 1, sp: 250 }],
  [3436, { level: 2, sp: 1415 }],
]);

function gain(skillTypeId: number, fromLevel: number, overall: number): SkillGain {
  return {
    skillTypeId,
    fromLevel,
    toLevel: fromLevel + 1,
    delta: { changes: [], count: 0 },
    roleChanges: [],
    metrics: {
      overall,
      dps: overall,
      ehp: 0,
      activeTank: 0,
      speed: 0,
      align: 0,
      capacitor: 0,
      lockRange: 0,
      miningYield: 0,
      hold: 0,
      remoteRepair: 0,
      jumpRange: 0,
      burstStrength: 0,
      burstRange: 0,
      burstDuration: 0,
      burstReload: 0,
      compressionRange: 0,
      coreFuel: 0,
    },
  };
}

vi.mock('./useSkillGains', () => ({
  useSkillGains: () => ({
    gains: [gain(3315, 0, 0.2), gain(3436, 2, 0.1), gain(3300, 1, 0.05)],
    loading: false,
    failed: false,
  }),
}));
vi.mock('@/features/skills/planner/usePlanEditorData', () => ({
  usePlanEditorData: () => ({
    catalog: { engineSkills: SKILLS },
    trainedSkills: trained,
    trainedSkillsKnown: true,
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
  }),
}));

const evaluator = {} as SkillGainEvaluator;

afterEach(async () => {
  await db.skillPlans.clear();
});

function renderPanel() {
  render(
    <FittingWhatToTrainPanel
      evaluator={evaluator}
      characterId={CHARACTER_ID}
      fittingName="Rifter"
    />
  );
}

function rowFor(name: RegExp) {
  const cell = screen.getByText(name);
  const row = cell.closest('tr, [role="row"], li');
  if (!row) throw new Error(`no row for ${String(name)}`);
  return row as HTMLElement;
}

async function planEntries(): Promise<PlanEntry[]> {
  const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
  return plans[0]?.entries ?? [];
}

describe('FittingWhatToTrainPanel — Add to plan', () => {
  it('adds the level to a new plan named after the fit, with missing prerequisites scheduled first', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText(/Surgical Strike I$/);
    await user.click(
      await within(rowFor(/Surgical Strike I$/)).findByRole('button', { name: /add to plan/i })
    );

    await waitFor(async () => {
      expect(await planEntries()).toEqual([{ skillTypeID: 3315, targetLevel: 1 }]);
    });
    const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
    expect(plans[0].name).toBe('Rifter');
    // The plan's schedule trains the missing Gunnery II and III before it.
    expect(normalizePlan(plans[0].entries, SKILLS, trained)).toEqual([
      { skillTypeID: 3300, level: 2 },
      { skillTypeID: 3300, level: 3 },
      { skillTypeID: 3315, level: 1 },
    ]);
    expect(
      await within(rowFor(/Surgical Strike I$/)).findByText('In plan Rifter')
    ).toBeInTheDocument();
  });

  it('Undo removes exactly what was added, leaving the plan as it was', async () => {
    const existing = {
      ...newPlan(CHARACTER_ID, 'Frigates'),
      entries: [{ skillTypeID: 3300, targetLevel: 2 }],
    };
    await db.skillPlans.put(existing);
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText(/Drones III$/);
    await user.click(
      await within(rowFor(/Drones III$/)).findByRole('button', { name: /add to plan/i })
    );
    await waitFor(async () => {
      expect(await planEntries()).toEqual([
        { skillTypeID: 3300, targetLevel: 2 },
        { skillTypeID: 3436, targetLevel: 3 },
      ]);
    });

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(async () => {
      expect(await planEntries()).toEqual([{ skillTypeID: 3300, targetLevel: 2 }]);
    });
  });

  it('marks a level the plan already trains, at or above, instead of offering to add it', async () => {
    await db.skillPlans.put({
      ...newPlan(CHARACTER_ID, 'Drone boat'),
      entries: [{ skillTypeID: 3436, targetLevel: 5 }],
    });
    renderPanel();

    const row = await waitFor(() => {
      const found = rowFor(/Drones III$/);
      expect(within(found).getByText('In plan Drone boat')).toBeInTheDocument();
      return found;
    });
    expect(within(row).queryByRole('button', { name: /add to plan/i })).toBeNull();
    // The other row is still offered.
    expect(
      within(rowFor(/Surgical Strike I$/)).getByRole('button', { name: /add to plan/i })
    ).toBeInTheDocument();
  });

  it('marks a level the plan already trains as a derived prerequisite of another entry', async () => {
    await db.skillPlans.put({
      ...newPlan(CHARACTER_ID, 'Gunnery'),
      entries: [{ skillTypeID: 3315, targetLevel: 1 }],
    });
    renderPanel();

    const row = await waitFor(() => {
      const found = rowFor(/Gunnery II$/);
      expect(within(found).getByText('In plan Gunnery')).toBeInTheDocument();
      return found;
    });
    expect(within(row).queryByRole('button', { name: /add to plan/i })).toBeNull();
  });
});

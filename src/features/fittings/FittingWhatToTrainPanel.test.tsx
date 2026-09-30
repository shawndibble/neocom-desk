import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
// A level the ranking did not score: worked out on demand, told apart here by the level asked for.
vi.mock('./useSkillLevelGain', () => ({
  useSkillLevelGain: (_evaluator: unknown, gain: SkillGain, level: number) => ({
    failed: false,
    gain:
      level === gain.toLevel
        ? gain
        : {
            delta: { changes: [], count: 0 },
            roleChanges: [{ key: 'miningYield', before: 100, after: 100 + level }],
            metrics: gain.metrics,
          },
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
    <MemoryRouter>
      <FittingWhatToTrainPanel
        evaluator={evaluator}
        characterId={CHARACTER_ID}
        fittingName="Rifter"
      />
    </MemoryRouter>
  );
}

function rowFor(name: string) {
  const cell = screen.getByText(name, { selector: 'span' });
  const row = cell.closest('li');
  if (!row) throw new Error(`no row for ${name}`);
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

    await screen.findByText('Surgical Strike');
    await user.click(
      await within(rowFor('Surgical Strike')).findByRole('button', { name: /add to plan/i })
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
      await within(rowFor('Surgical Strike')).findByRole('link', { name: 'Rifter' })
    ).toBeInTheDocument();
  });

  it('Undo removes exactly what was added, leaving the plan as it was', async () => {
    await db.skillPlans.put({
      ...newPlan(CHARACTER_ID, 'Frigates'),
      entries: [{ skillTypeID: 3300, targetLevel: 2 }],
    });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Drones');
    await user.click(await within(rowFor('Drones')).findByRole('button', { name: /add to plan/i }));
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
});

describe('FittingWhatToTrainPanel — level picker', () => {
  it('offers only the levels the pilot does not have, and adds the one picked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Drones');
    const row = rowFor('Drones');

    // Drones is trained to II: I and II are not offered.
    await user.click(await within(row).findByRole('combobox', { name: /level to train/i }));
    const options = (await screen.findAllByRole('option')).map((option) =>
      option.textContent?.replace('✓', '')
    );
    expect(options).toEqual(['III', 'IV', 'V']);
    await user.click(screen.getByRole('option', { name: 'V' }));

    // The changes follow the level picked.
    expect(within(row).getByText('Mining yield 100 → 105 m³/h')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /add to plan/i }));
    await waitFor(async () => {
      expect(await planEntries()).toEqual([{ skillTypeID: 3436, targetLevel: 5 }]);
    });
  });

  it('shows levels a plan already trains grayed out, links its name, and starts at the first open level', async () => {
    const plan = {
      ...newPlan(CHARACTER_ID, 'Drone boat'),
      entries: [{ skillTypeID: 3436, targetLevel: 4 }],
    };
    await db.skillPlans.put(plan);
    const user = userEvent.setup();
    renderPanel();

    const row = await waitFor(() => {
      const found = rowFor('Drones');
      expect(within(found).getByRole('link', { name: 'Drone boat' })).toBeInTheDocument();
      return found;
    });
    expect(within(row).getByRole('link', { name: 'Drone boat' })).toHaveAttribute(
      'href',
      `/skills/plans/${plan.id}`
    );
    expect(row).toHaveTextContent('III–IV in plan Drone boat');
    // III and IV are in the plan, so the picker already sits on V.
    const picker = within(row).getByRole('combobox', { name: /level to train/i });
    expect(picker).toHaveTextContent('V');
    await user.click(picker);
    expect(await screen.findByRole('option', { name: 'III · in plan' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('option', { name: 'IV · in plan' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.keyboard('{Escape}');

    await user.click(within(row).getByRole('button', { name: /add to plan/i }));
    await waitFor(async () => {
      expect(await planEntries()).toEqual([
        { skillTypeID: 3436, targetLevel: 4 },
        { skillTypeID: 3436, targetLevel: 5 },
      ]);
    });
  });

  it('offers no picker once every level is in a plan', async () => {
    await db.skillPlans.put({
      ...newPlan(CHARACTER_ID, 'Drone boat'),
      entries: [{ skillTypeID: 3436, targetLevel: 5 }],
    });
    renderPanel();

    const row = await waitFor(() => {
      const found = rowFor('Drones');
      expect(within(found).getByRole('link', { name: 'Drone boat' })).toBeInTheDocument();
      return found;
    });
    expect(within(row).queryByRole('button', { name: /add to plan/i })).toBeNull();
    expect(within(row).queryByRole('combobox')).toBeNull();
    // The other row is still offered.
    expect(
      within(rowFor('Surgical Strike')).getByRole('button', { name: /add to plan/i })
    ).toBeInTheDocument();
  });

  it('marks a level the plan trains only as a derived prerequisite of another entry', async () => {
    await db.skillPlans.put({
      ...newPlan(CHARACTER_ID, 'Gunnery'),
      entries: [{ skillTypeID: 3315, targetLevel: 1 }],
    });
    renderPanel();

    const row = await waitFor(() => {
      const found = rowFor('Gunnery');
      expect(found).toHaveTextContent('II–III in plan Gunnery');
      return found;
    });
    expect(within(row).getByRole('link', { name: 'Gunnery' })).toBeInTheDocument();
  });
});

describe('FittingWhatToTrainPanel — Skill Plan button and prerequisites', () => {
  it('opens the Skill Plans page, or the target plan once there is one', async () => {
    renderPanel();
    expect(await screen.findByRole('link', { name: 'Skill Plan' })).toHaveAttribute(
      'href',
      '/skills/plans'
    );
  });

  it('opens the target plan from the Skill Plan button', async () => {
    const plan = newPlan(CHARACTER_ID, 'Drone boat');
    await db.skillPlans.put(plan);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Skill Plan' })).toHaveAttribute(
        'href',
        `/skills/plans/${plan.id}`
      )
    );
  });

  it('lists the prerequisite skills behind "incl. prerequisites"', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Surgical Strike');

    // Only Surgical Strike misses a prerequisite (Gunnery III).
    expect(screen.getAllByRole('button', { name: /incl\. prerequisites/i })).toHaveLength(1);
    await user.click(
      await within(rowFor('Surgical Strike')).findByRole('button', {
        name: /incl\. prerequisites: surgical strike i/i,
      })
    );
    const card = await screen.findByText(/^Skills needed for Surgical Strike I$/);
    const list = card.closest('div') as HTMLElement;
    expect(within(list).getByText('Gunnery')).toBeInTheDocument();
    expect(within(list).getByText('Surgical Strike')).toBeInTheDocument();
  });
});

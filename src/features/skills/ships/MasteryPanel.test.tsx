import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { EngineSkill } from '@/engine/types';
import type { TargetPlan } from '../useTargetPlan';
import { MasteryPanel } from './MasteryPanel';

vi.mock('@/sde/loadSde', () => ({
  loadMasteries: vi.fn(async () => ({
    '626': [
      [{ skillTypeID: 3300, level: 1 }], // Mastery I
      [{ skillTypeID: 3300, level: 4 }], // Mastery II
      [], // III
      [], // IV
      [], // V
    ],
  })),
  loadTypes: vi.fn(async () => ({ '626': { name: 'Vexor', groupID: 26, volume: 100000 } })),
}));

const GUNNERY: EngineSkill = {
  typeID: 3300,
  name: 'Gunnery',
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
};

function fakeTarget(overrides: Partial<TargetPlan> = {}): TargetPlan {
  return {
    plans: [],
    targetPlanId: null,
    setTargetPlanId: vi.fn(),
    addEntries: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderPanel(target: TargetPlan, trainedSkills = new Map()) {
  return render(
    <MasteryPanel
      target={target}
      skills={new Map([[3300, GUNNERY]])}
      trainedSkills={trainedSkills}
      attributes={{ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 }}
      implants={{}}
      cloneState="omega"
    />
  );
}

describe('MasteryPanel', () => {
  it('searching and picking a ship shows its Mastery I tier, expanded by default', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());

    await waitFor(() => expect(screen.getByLabelText(/search for a ship/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search for a ship/i), 'Vexor');
    await user.click(await screen.findByRole('button', { name: 'Vexor' }));

    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());
    expect(screen.getByText('Mastery I')).toBeInTheDocument();
  });

  it('a skill never trained shows Add Level to Plan, which bundles the whole tier', async () => {
    const target = fakeTarget();
    const user = userEvent.setup();
    renderPanel(target);

    await waitFor(() => expect(screen.getByLabelText(/search for a ship/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search for a ship/i), 'Vexor');
    await user.click(await screen.findByRole('button', { name: 'Vexor' }));
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Create Plan & Add' }));

    expect(target.addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: 3300, targetLevel: 1 }],
      'Vexor Mastery'
    );
  });

  it('only one tier is expanded at a time — DESIGN.md allows one primary button per view', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());

    await waitFor(() => expect(screen.getByLabelText(/search for a ship/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search for a ship/i), 'Vexor');
    await user.click(await screen.findByRole('button', { name: 'Vexor' }));
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /add level to plan|create plan/i })).toHaveLength(
      1
    );

    await user.click(screen.getByText('Mastery II'));

    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /add level to plan|create plan/i })
      ).toHaveLength(1)
    );
  });

  it('a tier whose whole bundle is already trained has no Add button', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget(), new Map([[3300, { level: 5, sp: 1_000_000 }]]));

    await waitFor(() => expect(screen.getByLabelText(/search for a ship/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search for a ship/i), 'Vexor');
    await user.click(await screen.findByRole('button', { name: 'Vexor' }));

    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());
    expect(screen.getAllByText('1/1 complete').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('Hide completed toggle hides trained skill rows and shows a note when a tier empties out', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget(), new Map([[3300, { level: 5, sp: 1_000_000 }]]));

    await waitFor(() => expect(screen.getByLabelText(/search for a ship/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search for a ship/i), 'Vexor');
    await user.click(await screen.findByRole('button', { name: 'Vexor' }));
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Hide completed' }));

    expect(screen.queryByText('Gunnery')).not.toBeInTheDocument();
    expect(
      screen.getAllByText('All skills in this tier are already trained.').length
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Hide completed' }));
    expect(screen.getByText('Gunnery')).toBeInTheDocument();
  });
});

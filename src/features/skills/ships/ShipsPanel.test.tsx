import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { EngineSkill } from '@/engine/types';
import type { TargetPlan } from '../useTargetPlan';
import { ShipsPanel } from './ShipsPanel';

vi.mock('@/sde/loadSde', () => ({
  loadMasteries: vi.fn(async () => ({
    '626': [
      [{ skillTypeID: 3300, level: 1 }], // Mastery I
      [], // II
      [], // III
      [], // IV
      [], // V
    ],
  })),
  loadTypes: vi.fn(async () => ({ '626': { name: 'Vexor', groupID: 26, volume: 100000 } })),
}));

vi.mock('../typeCatalog', () => ({
  loadSkillNameMap: vi.fn(async () => new Map()),
  loadItemNameMap: vi.fn(async () => new Map([['vexor', { typeID: 626 }]])),
}));
vi.mock('../data', () => ({
  loadUniverseType: vi.fn(async (typeId: number) =>
    typeId === 626
      ? {
          data: {
            dogma_attributes: [
              { attribute_id: 182, value: 3300 }, // requiredSkill1 -> Gunnery
              { attribute_id: 277, value: 4 }, // requiredSkill1Level -> IV
            ],
          },
        }
      : null
  ),
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
    <ShipsPanel
      target={target}
      skills={new Map([[3300, GUNNERY]])}
      trainedSkills={trainedSkills}
      attributes={{ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 }}
      implants={{}}
      cloneState="omega"
    />
  );
}

async function pickVexor(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByLabelText(/search for a ship/i)).toBeInTheDocument());
  await user.type(screen.getByLabelText(/search for a ship/i), 'Vexor');
  await user.click(await screen.findByRole('button', { name: 'Vexor' }));
}

async function attachFit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Attach a fit (optional)' }));
  fireEvent.change(screen.getByLabelText(/paste an eft fit/i), {
    target: { value: '[Vexor, PvE Ratting]' },
  });
  await user.click(screen.getByRole('button', { name: 'Check Fit' }));
}

describe('ShipsPanel', () => {
  it('picking a ship shows its Mastery skills, tagged by tier', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());

    await pickVexor(user);

    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());
    expect(screen.getByText('Mastery I')).toBeInTheDocument();
  });

  it('attaching a fit for the same ship merges into one row, tagged by both sources, at the higher level', async () => {
    const user = userEvent.setup();
    const target = fakeTarget();
    renderPanel(target);

    await pickVexor(user);
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());
    await attachFit(user);

    // Mastery I wants level 1, the fit wants level 4 -> merged row targets 4.
    await waitFor(() => expect(screen.getAllByText('Gunnery')).toHaveLength(1));
    expect(screen.getByText('Mastery I')).toBeInTheDocument();
    // "This Fit" also names the filter chip, so the row's own tag is the 2nd match.
    expect(screen.getAllByText('This Fit').length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(target.addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: 3300, targetLevel: 4 }],
      'Vexor'
    );
  });

  it('"This Fit" filter is disabled until a fit is attached', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());
    await pickVexor(user);
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'This Fit' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('unchecking the Mastery filter hides a Mastery-only row', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());
    await pickVexor(user);
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Mastery' }));
    expect(screen.queryByText('Gunnery')).not.toBeInTheDocument();
  });

  it('Hide completed hides a trained row', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget(), new Map([[3300, { level: 5, sp: 1_000_000 }]]));
    await pickVexor(user);
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Hide completed' }));
    expect(screen.queryByText('Gunnery')).not.toBeInTheDocument();
  });

  it('Add All to Plan adds only the currently visible untrained rows', async () => {
    const user = userEvent.setup();
    const target = fakeTarget();
    renderPanel(target);
    await pickVexor(user);
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Create Plan & Add' }));
    expect(target.addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: 3300, targetLevel: 1 }],
      'Vexor'
    );
  });

  it('pasting text that is not an EFT fit shows the inline error', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());
    await pickVexor(user);
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '+ Attach a fit (optional)' }));
    fireEvent.change(screen.getByLabelText(/paste an eft fit/i), {
      target: { value: 'Gunnery 4' },
    });
    await user.click(screen.getByRole('button', { name: 'Check Fit' }));

    await waitFor(() =>
      expect(screen.getByText(/doesn't look like an eft fit/i)).toBeInTheDocument()
    );
  });
});

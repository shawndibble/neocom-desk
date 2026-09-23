import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { EngineSkill } from '@/engine/types';
import type { TargetPlan } from '../useTargetPlan';
import { FitCheckPanel } from './FitCheckPanel';

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

function renderPanel(target: TargetPlan) {
  return render(
    <FitCheckPanel
      target={target}
      skills={new Map([[3300, GUNNERY]])}
      trainedSkills={new Map()}
      attributes={{ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 }}
      implants={{}}
      cloneState="omega"
    />
  );
}

describe('FitCheckPanel', () => {
  it('checking a pasted fit shows the skill it still needs', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());

    fireEvent.change(screen.getByLabelText(/paste an eft fit/i), {
      target: { value: '[Vexor, PvE Ratting]' },
    });
    await user.click(screen.getByRole('button', { name: 'Check Fit' }));

    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());
    // No plans yet for this fake target, so the bulk button offers to create one.
    expect(screen.getByRole('button', { name: 'Create Plan & Add' })).toBeInTheDocument();
  });

  it('Add on a missing-skill row calls addEntries with that skill', async () => {
    const target = fakeTarget();
    const user = userEvent.setup();
    renderPanel(target);

    fireEvent.change(screen.getByLabelText(/paste an eft fit/i), {
      target: { value: '[Vexor, PvE Ratting]' },
    });
    await user.click(screen.getByRole('button', { name: 'Check Fit' }));
    await waitFor(() => expect(screen.getByText('Gunnery')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(target.addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: 3300, targetLevel: 4 }],
      'Vexor'
    );
  });

  it('offers "Add All to Plan" instead, once the character already has a plan', async () => {
    const user = userEvent.setup();
    renderPanel(
      fakeTarget({
        plans: [
          { id: 'p1', characterId: 1, name: 'My Plan', entries: [], remapCount: 0, updatedAt: 0 },
        ],
        targetPlanId: 'p1',
      })
    );

    fireEvent.change(screen.getByLabelText(/paste an eft fit/i), {
      target: { value: '[Vexor, PvE Ratting]' },
    });
    await user.click(screen.getByRole('button', { name: 'Check Fit' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add All to Plan' })).toBeInTheDocument()
    );
  });

  it('pasting text that is not an EFT fit shows the inline error instead of results', async () => {
    const user = userEvent.setup();
    renderPanel(fakeTarget());

    fireEvent.change(screen.getByLabelText(/paste an eft fit/i), {
      target: { value: 'Gunnery 4' },
    });
    await user.click(screen.getByRole('button', { name: 'Check Fit' }));

    await waitFor(() =>
      expect(screen.getByText(/doesn't look like an eft fit/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Add All to Plan' })).not.toBeInTheDocument();
  });
});

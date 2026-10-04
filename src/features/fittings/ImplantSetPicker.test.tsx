import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';

vi.mock('@/features/skills/typeCatalog', () => ({ loadItemNameMap: async () => new Map() }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[9950, 'Standard Blue Pill Booster']]),
}));
// What the finder is handed, and one change made through it.
vi.mock('./ImplantFinder', () => ({
  ImplantFinder: ({
    fitting,
    implantSet,
    onChange,
  }: {
    fitting: Fitting;
    implantSet: FittingImplantSet;
    onChange: (set: FittingImplantSet) => void;
  }) => (
    <>
      <p>Plan: {implantSet.implants.join(',')}</p>
      <p>Measured on: {fitting.implantSet?.implants.join(',') ?? 'none'}</p>
      <button
        type="button"
        onClick={() => onChange({ ...implantSet, implants: [...implantSet.implants, 999] })}
      >
        Plan one more
      </button>
    </>
  ),
}));

const { ImplantSetPicker } = await import('./ImplantSetPicker');

describe('ImplantSetPicker — booster side effects', () => {
  it('switches a carried booster’s side effect on, and off again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950] }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: 'Shield capacity −20%' }));
    expect(onChange).toHaveBeenLastCalledWith({
      implants: [],
      boosters: [9950],
      boosterSideEffects: [2737],
    });

    rerender(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950], boosterSideEffects: [2737] }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Shield capacity −20%' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Shield capacity −20%' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [9950] });
  });

  it('drops a removed booster’s side effects with it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950], boosterSideEffects: [2737] }}
        onChange={onChange}
      />
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove Standard Blue Pill Booster' })
    );
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [] });
  });
});

describe('ImplantSetPicker — planning from the clone', () => {
  const fitting = { name: 'Drake', shipTypeId: 24698, modules: [] } as unknown as Fitting;
  const profile: PilotProfile = {
    skillLevels: new Map(),
    implantTypeIds: [10228, 13283],
    boosterTypeIds: [],
  };

  it('starts from the clone’s implants, and the first change saves them as the Fitting’s set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={undefined}
        onChange={onChange}
        finder={{ fitting, profile, basis: 'clone' }}
        onUseClone={vi.fn()}
      />
    );
    expect(screen.getByText('Plan: 10228,13283')).toBeInTheDocument();
    expect(screen.getByText('Measured on: 10228,13283')).toBeInTheDocument();
    // Opening it alone saves nothing, and on the clone there is nothing to go back from.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use my clone' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Plan one more' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [10228, 13283, 999], boosters: [] });
  });

  it('keeps a Fitting’s own set, and drops it to go back to the clone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onUseClone = vi.fn();
    const own = { implants: [5], boosters: [] };
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={own}
        onChange={onChange}
        finder={{ fitting: { ...fitting, implantSet: own }, profile, basis: 'fitting' }}
        onUseClone={onUseClone}
      />
    );
    expect(screen.getByText('Plan: 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plan one more' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [5, 999], boosters: [] });

    await user.click(screen.getByRole('button', { name: 'Use my clone' }));
    expect(onUseClone).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FittingImplantSet } from '@/engine/fittings/types';

vi.mock('@/features/skills/typeCatalog', () => ({ loadItemNameMap: async () => new Map() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: async () => new Map() }));

const { ImplantSetControl } = await import('./ImplantSetControl');

function setup(implantSet: FittingImplantSet | undefined, canUseClone = true) {
  const onImplantSetChange = vi.fn();
  render(
    <ImplantSetControl
      basis={implantSet === undefined && canUseClone ? 'clone' : 'fitting'}
      canUseCloneBasis={canUseClone}
      implantSet={implantSet}
      onImplantSetChange={onImplantSetChange}
    />
  );
  return { onImplantSetChange };
}

describe('ImplantSetControl', () => {
  it('reads "My clone" when the Fitting carries no set of its own', () => {
    setup(undefined);
    expect(screen.getByRole('button', { name: 'Implants: My clone' })).toBeInTheDocument();
  });

  it('counts a custom set’s implants and boosters', () => {
    setup({ implants: [1, 2, 3], boosters: [4] });
    expect(
      screen.getByRole('button', { name: 'Implants: Custom · 3 implants, 1 booster' })
    ).toBeInTheDocument();
  });

  it('reads "None" for an empty set, and with no Character to take a clone from', () => {
    setup({ implants: [], boosters: [] });
    expect(screen.getByRole('button', { name: 'Implants: None' })).toBeInTheDocument();
  });

  it('reads "None" with no Character and no set', () => {
    setup(undefined, false);
    expect(screen.getByRole('button', { name: 'Implants: None' })).toBeInTheDocument();
  });

  it('opens the set editor, which goes back to the clone by dropping the set', async () => {
    const user = userEvent.setup();
    const { onImplantSetChange } = setup({ implants: [1], boosters: [] });
    await user.click(screen.getByRole('button', { name: /^Implants:/ }));
    expect(screen.getByRole('dialog', { name: 'Implants & boosters' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use my clone' }));
    expect(onImplantSetChange).toHaveBeenLastCalledWith(undefined);
  });

  it('offers no way back to a clone that isn’t carrying the stats or doesn’t exist', async () => {
    const user = userEvent.setup();
    setup(undefined);
    await user.click(screen.getByRole('button', { name: /^Implants:/ }));
    expect(screen.queryByRole('button', { name: 'Use my clone' })).not.toBeInTheDocument();
  });

  it('offers no way back to the clone without a Character', async () => {
    const user = userEvent.setup();
    setup({ implants: [1], boosters: [] }, false);
    await user.click(screen.getByRole('button', { name: /^Implants:/ }));
    expect(screen.queryByRole('button', { name: 'Use my clone' })).not.toBeInTheDocument();
  });
});

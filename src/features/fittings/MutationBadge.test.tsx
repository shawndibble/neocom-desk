import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, FittingModule, FittingStats } from '@/engine/fittings/types';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import { MutationBadge } from './MutationBadge';
import { FittingRing } from './FittingRing';
import { FittingItemActionsProvider } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';

const ABYSSAL = 47832;
const NEUT_II = 12271;
const GRAVID = 47831;

vi.mock('@/features/abyssal/mutaplasmidData', async () => {
  const { mutaplasmidLookup } = await import('@/engine/fittings/mutaplasmids');
  const lookup = mutaplasmidLookup({
    attributeNames: { 6: 'capacitorNeed' },
    mutaplasmids: {
      47831: {
        result: 47832,
        bases: [12271],
        attributes: [{ id: 6, min: 0.8, max: 1.3, highIsGood: false }],
      },
    },
    abyssalTypeIds: [47832],
  });
  return { useMutaplasmidLookup: () => lookup };
});

const bare: FittingModule = { slot: 'high', slotIndex: 0, typeId: ABYSSAL, state: 'active' };
const noRolls: FittingModule = {
  ...bare,
  mutation: { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: {} },
};
const rolled: FittingModule = {
  ...bare,
  mutation: { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: { 6: 90 } },
};

describe('MutationBadge', () => {
  it('flags an abyssal module of unknown base, and one whose rolls are unknown', () => {
    const { rerender } = render(<MutationBadge items={[bare]} />);
    expect(screen.getByText('Base unknown')).toBeInTheDocument();
    rerender(<MutationBadge items={[noRolls]} />);
    expect(screen.getByText('Rolls unknown')).toBeInTheDocument();
  });

  it('points an editable module to Mutate, saying what is missing', async () => {
    render(
      <FittingItemActionsProvider value={fakeItemActions()}>
        <MutationBadge items={[bare]} />
      </FittingItemActionsProvider>
    );
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      "What it was mutated from isn't known, so it adds nothing to the stats. Say what made it with Mutate in its menu."
    );
  });

  it("flags a drone type when any unit's rolls are unknown, with no Mutate to point to", async () => {
    render(
      <FittingItemActionsProvider value={fakeItemActions()}>
        <MutationBadge items={[rolled, noRolls]} fixable={false} />
      </FittingItemActionsProvider>
    );
    expect(screen.getByText('Rolls unknown')).toBeInTheDocument();
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /^Its rolls aren't known, so the stats use its base's own values\.$/
    );
  });

  it('flags nothing the app knows fully: a rolled module, a plain one', () => {
    const { container, rerender } = render(<MutationBadge items={[rolled]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<MutationBadge items={[{ ...bare, typeId: NEUT_II }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FittingRing mutation flag', () => {
  const stats = {
    cpuUsed: 0,
    cpuTotal: 100,
    powergridUsed: 0,
    powergridTotal: 100,
    slotCounts: { high: 1, medium: 0, low: 0, rig: 0, subsystem: 0 },
    hardpoints: { turrets: 0, launchers: 0 },
    ...neutralExtendedStats(),
  } as FittingStats;

  it('names the unknown rolls on the tile and flags its corner', () => {
    const fitting: Fitting = {
      name: 'T',
      shipTypeId: 1,
      modules: [noRolls],
      drones: [],
      cargo: [],
    };
    render(
      <FittingItemActionsProvider value={fakeItemActions()}>
        <FittingRing fitting={fitting} stats={stats} />
      </FittingItemActionsProvider>
    );
    const tile = screen.getByLabelText(/^High slots 1: .*Rolls unknown$/);
    expect(tile.querySelector('[data-mutation-flag="rollsUnknown"]')).not.toBeNull();
  });
});

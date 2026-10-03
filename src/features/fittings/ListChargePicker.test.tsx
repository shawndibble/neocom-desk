import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, FittingModule } from '@/engine/fittings/types';
import { ListChargePicker } from './ListChargePicker';
import type { FittingChange } from './useFittingWorkspace';
import type { FittingCatalogue } from './useFittingCatalogue';

vi.mock('./dogmaFittingEngine', () => ({
  checkCharges: () => new Set([230, 238]),
  chargesMissingSkills: () => new Set<number>(),
  compareCharges: () => [
    {
      typeId: 230,
      dps: 253,
      optimal: 30_000,
      falloff: 18_000,
      damage: null,
      roundsPerMinute: 12,
      techLevel: 1,
    },
    {
      typeId: 238,
      dps: 380,
      optimal: 15_000,
      falloff: 18_000,
      damage: null,
      roundsPerMinute: 12,
      techLevel: 1,
    },
  ],
}));
vi.mock('@/market/prices', () => ({
  getHubPrices: async () => new Map(),
}));

const gun = (slotIndex: number): FittingModule => ({
  slot: 'high',
  slotIndex,
  typeId: 3090,
  state: 'active',
  chargeTypeId: 230,
});
const fitting: Fitting = {
  name: 'Rokh',
  shipTypeId: 24688,
  modules: [gun(0), gun(1)],
  drones: [],
  cargo: [],
};
const catalogue = {
  types: {
    3090: { name: '425mm Railgun I' },
    230: { name: 'Lead Charge L' },
    238: { name: 'Antimatter Charge L' },
  },
  typeIdsByGroup: new Map([[85, [230, 238]]]),
  variations: {
    types: {
      230: { parentTypeId: null, metaGroupId: 1 },
      238: { parentTypeId: null, metaGroupId: 1 },
    },
    metaGroups: {},
  },
} as unknown as FittingCatalogue;

function renderPicker() {
  let applied: Fitting | null = null;
  const edit = vi.fn((change: FittingChange) => {
    applied = change(fitting);
  });
  render(
    <ListChargePicker
      module={gun(0)}
      result={{ state: 'active', maxState: 'overload', chargeGroupIds: [85] }}
      fitting={fitting}
      catalogue={catalogue}
      engineReady
      profile={{ skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] }}
      edit={edit}
    />
  );
  return { edit, applied: () => applied as Fitting | null };
}

describe('ListChargePicker', () => {
  it('names the loaded charge and opens the picker; a pick loads into every gun of the type', async () => {
    const user = userEvent.setup();
    const { applied } = renderPicker();
    const trigger = screen.getByRole('button', {
      name: 'Charge in 425mm Railgun I: Lead Charge L',
    });
    expect(trigger).toHaveTextContent('Lead Charge L');

    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'All 2' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /^Max damage/ }));
    expect(applied()!.modules.map((m) => m.chargeTypeId)).toEqual([238, 238]);
  });

  it('"This gun" loads into this module only; "No charge" unloads it', async () => {
    const user = userEvent.setup();
    const { applied } = renderPicker();
    await user.click(
      screen.getByRole('button', { name: 'Charge in 425mm Railgun I: Lead Charge L' })
    );
    await user.click(screen.getByRole('button', { name: 'Just this one' }));
    await user.click(screen.getByRole('button', { name: /^Max damage/ }));
    expect(applied()!.modules.map((m) => m.chargeTypeId)).toEqual([238, 230]);

    await user.click(
      screen.getByRole('button', { name: 'Charge in 425mm Railgun I: Lead Charge L' })
    );
    await user.click(screen.getByRole('button', { name: 'Just this one' }));
    await user.click(screen.getByRole('button', { name: 'No charge' }));
    expect(applied()!.modules.map((m) => m.chargeTypeId)).toEqual([undefined, 230]);
  });

  it('before the engine is ready, still lists every charge its groups name', async () => {
    const user = userEvent.setup();
    render(
      <ListChargePicker
        module={gun(0)}
        result={{ state: 'active', maxState: 'overload', chargeGroupIds: [85] }}
        fitting={fitting}
        catalogue={catalogue}
        engineReady={false}
        profile={null}
        edit={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /^Charge in 425mm Railgun I/ }));
    expect(screen.getByRole('button', { name: /Antimatter Charge L/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Lead Charge L/, pressed: true })
    ).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, FittingModule } from '@/engine/fittings/types';
import { ListChargePicker } from './ListChargePicker';
import type { FittingCatalogue } from './useFittingCatalogue';

vi.mock('./dogmaFittingEngine', () => ({
  checkCharges: () => new Set([60281]),
  chargesMissingSkills: () => new Set<number>(),
  compareCharges: () => [
    {
      typeId: 60281,
      dps: 0,
      optimal: 0,
      falloff: 0,
      damage: null,
      roundsPerMinute: null,
      techLevel: 2,
      mining: {
        m3PerSecond: 12.7,
        cycleSeconds: 37.1,
        residueChance: 0.376,
        residueMultiplier: 1,
        residueM3s: 4.7,
        removedM3s: 17.4,
      },
    },
  ],
}));
vi.mock('@/market/prices', () => ({
  getHubPrices: async () => new Map(),
}));

const strip: FittingModule = {
  slot: 'high',
  slotIndex: 0,
  typeId: 17912,
  state: 'active',
  chargeTypeId: 60281,
};
const fitting: Fitting = {
  name: 'Hulk',
  shipTypeId: 22544,
  modules: [strip],
  drones: [],
  cargo: [],
};
const catalogue = {
  types: {
    17912: { name: 'Modulated Strip Miner II' },
    60281: { name: 'Simple Asteroid Mining Crystal Type A II' },
  },
  typeIdsByGroup: new Map([[482, [60281]]]),
  variations: { types: {}, metaGroups: {} },
} as unknown as FittingCatalogue;

describe('ListChargePicker — a mining laser', () => {
  it('closes only the crystal help on Escape, leaving the picker it opened from', async () => {
    const user = userEvent.setup();
    render(
      <ListChargePicker
        module={strip}
        result={{ state: 'active', maxState: 'overload', chargeGroupIds: [482] }}
        fitting={fitting}
        catalogue={catalogue}
        engineReady
        profile={{ skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] }}
        edit={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /^Charge in Modulated Strip Miner II/ }));
    await user.click(screen.getByRole('button', { name: 'What the crystal types do' }));
    expect(screen.getByRole('dialog', { name: 'Mining crystal types' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Mining crystal types' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What the crystal types do' })).toBeInTheDocument();

    // With the help shut, Escape closes the picker as before: focus is back on
    // the ?, whose tooltip takes the first one.
    await user.keyboard('{Escape}{Escape}');
    expect(
      screen.queryByRole('button', { name: 'What the crystal types do' })
    ).not.toBeInTheDocument();
  });
});

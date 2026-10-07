import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { RowMoreActions } from '@/components/ui';
import type { Fitting, FittingModule } from '@/engine/fittings/types';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';
import { FittingItemMenu, ModuleMenuItems } from './FittingItemMenu';
import { FittingItemActionsProvider, type ChargePickerInput } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';
import type { FittingCatalogue } from './useFittingCatalogue';
import { fakeDogmaEngine, fakeFittingContext } from './__fixtures__/fakeDogmaEngine';

const engine = fakeDogmaEngine({
  checkCharges: () => new Set([230, 238, 21740]),
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
    {
      typeId: 21740,
      dps: 437,
      optimal: 15_000,
      falloff: 18_000,
      damage: null,
      roundsPerMinute: 12,
      techLevel: 1,
    },
  ],
});
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
    21740: { name: 'Caldari Navy Antimatter Charge L' },
  },
  typeIdsByGroup: new Map([[85, [230, 238, 21740]]]),
  variations: {
    types: {
      230: { parentTypeId: null, metaGroupId: 1 },
      238: { parentTypeId: null, metaGroupId: 1 },
      21740: { parentTypeId: 238, metaGroupId: 4 },
    },
    metaGroups: {},
  },
} as unknown as FittingCatalogue;

function renderMenu() {
  const input: ChargePickerInput = {
    fitting,
    context: fakeFittingContext(catalogue, { engine }),
    moduleResults: fitting.modules.map(() => ({
      state: 'active',
      maxState: 'overload',
      chargeGroupIds: [85],
    })),
  };
  const actions = fakeItemActions({}, { chargePickerInput: () => input });
  render(
    <MemoryRouter>
      <FakeItemActions>
        <FittingItemActionsProvider value={actions}>
          <FittingItemMenu
            name="425mm Railgun I"
            items={<ModuleMenuItems module={gun(0)} shownState="active" takesCharges />}
          >
            <div>
              <RowMoreActions />
            </div>
          </FittingItemMenu>
        </FittingItemActionsProvider>
      </FakeItemActions>
    </MemoryRouter>
  );
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for 425mm Railgun I' }), {
    button: 0,
    pointerType: 'mouse',
  });
  return actions;
}

async function openSub(name: RegExp | string) {
  const trigger = await screen.findByRole('menuitem', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowRight' });
}

describe('Change charge (all N) — the Charge Picker as a menu', () => {
  it('loads a quick pick into every gun of the type', async () => {
    const actions = renderMenu();
    await openSub('Change charge (all 2)');
    fireEvent.click(await screen.findByRole('menuitem', { name: /Max damage/ }));
    expect(actions.charges.load).toHaveBeenCalledWith(21740, {
      fromCargo: false,
      only: [
        { slot: 'high', slotIndex: 0 },
        { slot: 'high', slotIndex: 1 },
      ],
    });
  });

  it('lists the types long range first, each opening to its factions', async () => {
    const actions = renderMenu();
    await openSub('Change charge (all 2)');
    const types = await screen.findAllByRole('menuitem', { name: /^(● )?(Lead|Antimatter)/ });
    expect(types.map((el) => el.textContent)).toEqual([
      expect.stringMatching(/Lead/),
      expect.stringMatching(/Antimatter/),
    ]);
    await openSub(/^Antimatter/);
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Caldari Navy/ }));
    expect(actions.charges.load).toHaveBeenCalledWith(
      21740,
      expect.objectContaining({ fromCargo: false })
    );
  });
});

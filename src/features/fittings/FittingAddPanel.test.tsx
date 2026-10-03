import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';
import { FittingAddPanel } from './FittingAddPanel';
import { FittingItemActionsProvider } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';
import type { FittingCatalogue } from './useFittingCatalogue';
import { db } from '@/db';
import { clearHullFitMemory } from './hullFitService';

const checkCandidates = vi.fn();
const checkCharges = vi.fn();
const compareCharges = vi.fn((): unknown[] => []);
const chargesMissingSkills = vi.fn(() => new Set<number>());
vi.mock('./dogmaFittingEngine', () => ({
  checkCandidates: (...args: unknown[]) => checkCandidates(...args),
  checkCharges: (...args: unknown[]) => checkCharges(...args),
  compareCharges: () => compareCharges(),
  chargesMissingSkills: () => chargesMissingSkills(),
}));
const getHubPrices = vi.fn(async () => new Map<number, { sellMin: number | null }>());
vi.mock('@/market/prices', () => ({
  getHubPrices: () => getHubPrices(),
}));

const fitting: Fitting = { name: 'Rifter', shipTypeId: 587, modules: [], drones: [], cargo: [] };
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

const catalogue: FittingCatalogue = {
  types: {},
  rackOf: { 1: 'low', 2: 'low', 3: 'medium', 4: 'medium' },
  marketTypes: [
    { typeId: 1, name: 'Damage Control I', marketGroupId: 10, volume: 1 },
    { typeId: 2, name: 'Damage Control II', marketGroupId: 10, volume: 1 },
    { typeId: 3, name: '1MN Afterburner II', marketGroupId: 20, volume: 1 },
    { typeId: 4, name: 'Anchoring Array', marketGroupId: 30, volume: 1 },
  ],
  groupsById: new Map([
    [10, { id: 10, name: 'Damage Controls', parentId: null, hasTypes: true }],
    [20, { id: 20, name: 'Afterburners', parentId: null, hasTypes: true }],
    [30, { id: 30, name: 'Structure Equipment', parentId: null, hasTypes: true }],
  ]),
  childrenByParent: new Map(),
  parentOf: new Map(),
  typeIdsByGroup: new Map(),
  variations: { types: {}, metaGroups: {} },
};

function renderPanel(overrides: Partial<Parameters<typeof FittingAddPanel>[0]> = {}) {
  const onAdd = vi.fn();
  render(
    <FittingAddPanel
      fitting={fitting}
      catalogue={catalogue}
      target={{ kind: 'slot', slot: 'low', slotIndex: 0 }}
      engineReady
      profile={profile}
      canPlace={() => true}
      onAdd={onAdd}
      {...overrides}
    />
  );
  return { onAdd };
}

describe('FittingAddPanel', () => {
  // The hull check is shared and saved per hull and skills; each test answers it afresh.
  beforeEach(async () => {
    clearHullFitMemory();
    await db.hullFitCache.clear();
  });

  it('before ship data: search still works, but Add is disabled and the note says why', async () => {
    const user = userEvent.setup();
    renderPanel({ engineReady: false });

    expect(screen.getByText(/Ship data is still downloading/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search items to add'), 'II');

    const result = screen.getByRole('button', { name: /Damage Control II/ });
    expect(result).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Damage Control I$/ })).not.toBeInTheDocument();
    expect(checkCandidates).not.toHaveBeenCalled();
  });

  it('lists only what fits the chosen slot and hull, and adds on click', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: id !== 1, canFly: id !== 2, fitsResources: true }])
      );
    });
    const { onAdd } = renderPanel();

    // The hull check runs in the background; browsing waits for it. The
    // skill filter starts on, hiding Damage Control II (no skills for it)
    // until it's off.
    // Pressed only once the hull check lands; before that it is disabled and
    // a click does nothing (the CI flake this used to be).
    const skillFilter = await screen.findByRole('button', { name: 'Skills', pressed: true });
    expect(screen.queryByRole('button', { name: /Damage Control II/ })).not.toBeInTheDocument();
    await user.click(skillFilter);
    const dc2 = await screen.findByRole('button', { name: /Damage Control II/ });
    expect(screen.queryByRole('button', { name: /Afterburner/ })).not.toBeInTheDocument();
    // Damage Control I doesn't fit the hull.
    expect(screen.queryByText('Damage Control I')).toBeNull();
    expect(dc2).toHaveTextContent('Missing skills');

    await user.click(dc2);
    expect(onAdd).toHaveBeenCalledWith(2, 'low');
  });

  it('says when a filter hid the search matches, and one tap shows them', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: true, canFly: id !== 2, fitsResources: true }])
      );
    });
    renderPanel({ target: null });

    await screen.findByRole('button', { name: 'Skills', pressed: true });
    await user.type(screen.getByLabelText('Search items to add'), 'Damage Control II');
    expect(screen.queryByText('No matching items.')).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: '1 more hidden by filters — show it' })
    );
    expect(await screen.findByRole('button', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hidden by filters/ })).not.toBeInTheDocument();
  });

  it('keeps the plain no-results wording when nothing matches at all', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: true, canFly: id !== 2, fitsResources: true }])
      );
    });
    renderPanel({ target: null });

    await screen.findByRole('button', { name: 'Skills', pressed: true });
    await user.type(screen.getByLabelText('Search items to add'), 'zzzz');
    expect(screen.getByText('No matching items.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hidden by filters/ })).not.toBeInTheDocument();
  });

  it('browses only the groups holding something that fits the hull', async () => {
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: id !== 4, canFly: true, fitsResources: true }])
      );
    });
    renderPanel({ target: null });

    expect(await screen.findByRole('button', { name: /Afterburners/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Damage Controls/ })).toBeInTheDocument();
    // Structure modules never fit a ship, so their group never shows.
    expect(screen.queryByText('Structure Equipment')).toBeNull();
  });

  it('hides modules too big for the bare hull’s CPU, powergrid or calibration, until the resource filter is off', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: true, canFly: true, fitsResources: id !== 4 }])
      );
    });
    renderPanel({ target: null });

    expect(await screen.findByRole('button', { name: /Afterburners/ })).toBeInTheDocument();
    expect(screen.queryByText('Structure Equipment')).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Resources' }));
    expect(await screen.findByText('Structure Equipment')).toBeInTheDocument();
  });

  it('hides modules the hull cannot rack at all, until the hull filter is off', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: id !== 4, canFly: true, fitsResources: true }])
      );
    });
    renderPanel({ target: null });

    expect(await screen.findByRole('button', { name: /Afterburners/ })).toBeInTheDocument();
    expect(screen.queryByText('Structure Equipment')).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Hull' }));
    expect(await screen.findByText('Structure Equipment')).toBeInTheDocument();
    // Shown with the Hull filter off, but never addable — the hull refuses it outright.
    const anchoringArray = screen.getByRole('button', { name: /Anchoring Array/ });
    expect(anchoringArray).toBeDisabled();
    expect(anchoringArray).toHaveTextContent("Doesn't fit this hull");
  });

  it('loads a charge into every fitted module that takes it, from the Charges tab', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation(() => new Map());
    checkCharges.mockImplementation(() => new Set([501]));
    const onLoadCharge = vi.fn();
    const withLauncher: Fitting = {
      ...fitting,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 400, state: 'active' },
        { slot: 'high', slotIndex: 1, typeId: 400, state: 'active' },
      ],
    };
    renderPanel({
      fitting: withLauncher,
      target: null,
      catalogue: {
        ...catalogue,
        types: {
          400: { name: 'Light Missile Launcher II', groupID: 1 },
          501: { name: 'Scourge Light Missile', groupID: 2 },
        } as unknown as FittingCatalogue['types'],
        typeIdsByGroup: new Map([[2, [501]]]),
      },
      moduleResults: [
        { state: 'active', maxState: 'active', chargeGroupIds: [2] },
        { state: 'active', maxState: 'active', chargeGroupIds: [2] },
      ],
      onLoadCharge,
    });

    await user.click(screen.getByRole('tab', { name: 'Charges' }));
    expect(screen.getByText('2× Light Missile Launcher II')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Scourge Light Missile/ }));
    expect(onLoadCharge).toHaveBeenCalledWith(501);
  });

  it("collapses one module's charges, naming what it has loaded, and leaves the others open", async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation(() => new Map());
    checkCharges.mockImplementation(() => new Set([501, 700]));
    // Scourge shoots, so the launcher gets the Charge Picker; the cap booster's charge doesn't.
    compareCharges.mockImplementation(() => [
      {
        typeId: 501,
        dps: 100,
        optimal: 20_000,
        falloff: 0,
        damage: null,
        roundsPerMinute: 6,
        techLevel: 1,
      },
    ]);
    renderPanel({
      fitting: {
        ...fitting,
        modules: [
          { slot: 'high', slotIndex: 0, typeId: 400, state: 'active', chargeTypeId: 501 },
          { slot: 'medium', slotIndex: 0, typeId: 600, state: 'active' },
        ],
      },
      target: null,
      catalogue: {
        ...catalogue,
        types: {
          400: { name: 'Light Missile Launcher II', groupID: 1 },
          501: { name: 'Scourge Light Missile', groupID: 2 },
          600: { name: 'Medium Capacitor Booster II' },
          700: { name: 'Navy Cap Booster 400', groupID: 9 },
        } as unknown as FittingCatalogue['types'],
        typeIdsByGroup: new Map([
          [2, [501]],
          [9, [700]],
        ]),
      },
      moduleResults: [
        { state: 'active', maxState: 'active', chargeGroupIds: [2] },
        { state: 'active', maxState: 'active', chargeGroupIds: [9] },
      ],
    });

    await user.click(screen.getByRole('tab', { name: 'Charges' }));
    const launcher = screen.getByRole('button', { name: /1× Light Missile Launcher II/ });
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(launcher).toHaveAccessibleName(
      /Light Missile Launcher II, loaded: Scourge Light Missile/
    );
    expect(screen.getByRole('button', { name: 'Usable' })).toBeInTheDocument();

    await user.click(launcher);
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    // Only the header is left, and it still says what the launchers fire.
    expect(screen.getAllByRole('button', { name: /Scourge Light Missile/ })).toEqual([launcher]);
    expect(launcher).toHaveTextContent('Scourge Light Missile');
    // With no weapon section open, the picker's shared controls go too.
    expect(screen.queryByRole('button', { name: 'Usable' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Navy Cap Booster 400/ })).toBeInTheDocument();

    await user.click(launcher);
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
  });

  describe('Charge Picker (a weapon group)', () => {
    // Two railguns; Lead (long range), Antimatter and two navy versions, and a locked Spike.
    const rails: Fitting = {
      ...fitting,
      modules: [0, 1].map((slotIndex) => ({
        slot: 'high' as const,
        slotIndex,
        typeId: 3090,
        state: 'active' as const,
        chargeTypeId: slotIndex === 0 ? 230 : undefined,
      })),
      cargo: [{ typeId: 238, quantity: 1000 }],
    };
    const railCatalogue: FittingCatalogue = {
      ...catalogue,
      types: {
        3090: { name: '425mm Railgun I' },
        230: { name: 'Lead Charge L' },
        238: { name: 'Antimatter Charge L' },
        21740: { name: 'Caldari Navy Antimatter Charge L' },
        22999: { name: 'Federation Navy Antimatter Charge L' },
        12807: { name: 'Spike L' },
      } as unknown as FittingCatalogue['types'],
      typeIdsByGroup: new Map([[85, [230, 238, 21740, 22999, 12807]]]),
      variations: {
        types: {
          230: { parentTypeId: null, metaGroupId: 1 },
          238: { parentTypeId: null, metaGroupId: 1 },
          21740: { parentTypeId: 238, metaGroupId: 4 },
          22999: { parentTypeId: 238, metaGroupId: 4 },
          12807: { parentTypeId: 237, metaGroupId: 2 },
        },
        metaGroups: { 1: 'Tech I', 2: 'Tech II', 4: 'Faction' },
      },
    };
    const stat = (typeId: number, dps: number, optimal: number) => ({
      typeId,
      dps,
      optimal,
      falloff: 18_000,
      damage: { em: 0, thermal: 0.44, kinetic: 0.56, explosive: 0 },
      roundsPerMinute: 12,
      techLevel: typeId === 12807 ? 2 : 1,
    });

    function renderRails(onLoadCharge = vi.fn()) {
      checkCandidates.mockImplementation(() => new Map());
      checkCharges.mockImplementation(() => new Set([230, 238, 21740, 22999, 12807]));
      compareCharges.mockImplementation(() => [
        stat(230, 253, 30_000),
        stat(238, 380, 15_000),
        stat(21740, 437, 15_000),
        stat(22999, 437, 15_000),
        stat(12807, 280, 54_000),
      ]);
      chargesMissingSkills.mockImplementation(() => new Set([12807]));
      getHubPrices.mockImplementation(
        async () =>
          new Map([
            [230, { sellMin: 44 }],
            [238, { sellMin: 62 }],
            [21740, { sellMin: 500 }],
            [22999, { sellMin: 540 }],
          ])
      );
      renderPanel({
        fitting: rails,
        target: null,
        catalogue: railCatalogue,
        moduleResults: rails.modules.map(() => ({
          state: 'active' as const,
          maxState: 'active' as const,
          chargeGroupIds: [85],
        })),
        onLoadCharge,
      });
      return onLoadCharge;
    }

    it('lists one row per type, with the loaded charge and the quick picks', async () => {
      const user = userEvent.setup();
      renderRails();
      await user.click(screen.getByRole('tab', { name: 'Charges' }));

      const picks = screen.getByRole('group', { name: 'Quick picks' });
      // Same damage, Caldari Navy is cheaper, so it wins; Spike is locked, so Lead reaches furthest.
      // Within 10% of the top, it's also the cheapest per minute: best value too.
      expect(await within(picks).findAllByText('Caldari Navy Antimatter')).toHaveLength(2);
      expect(picks).toHaveTextContent(/Max range\s*Lead/);
      expect(screen.getByRole('button', { name: /^Antimatter, / })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Spike, .*Needs a skill/ })).toHaveTextContent(
        'SKILL'
      );
    });

    it("loads a faction version from its type's table, and names a strictly worse one", async () => {
      const user = userEvent.setup();
      const onLoadCharge = renderRails();
      await user.click(screen.getByRole('tab', { name: 'Charges' }));
      await within(screen.getByRole('group', { name: 'Quick picks' })).findAllByText(
        'Caldari Navy Antimatter'
      );

      await user.click(screen.getByRole('button', { name: /^Antimatter, / }));
      expect(screen.getByText(/Thermal 44%/)).toBeInTheDocument();
      expect(screen.getByText(/Same as Caldari Navy, costs more/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^Caldari Navy\b/ }));
      expect(onLoadCharge).toHaveBeenCalledWith(21740);
    });

    it('Usable filters out locked charges; the distance slider shows only with Fighting at on', async () => {
      const user = userEvent.setup();
      renderRails();
      await user.click(screen.getByRole('tab', { name: 'Charges' }));

      expect(screen.queryByLabelText('Target at')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Fighting at…' }));
      expect(screen.getByLabelText('Target at')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Usable' }));
      expect(screen.queryByRole('button', { name: /^Spike, / })).not.toBeInTheDocument();
    });
  });

  it('gives a cap booster its guide: how the capacitor fares on each charge', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation(() => new Map());
    checkCharges.mockImplementation(() => new Set([700]));
    compareCharges.mockImplementation(() => [
      {
        typeId: 700,
        dps: 0,
        optimal: 0,
        falloff: 0,
        damage: null,
        roundsPerMinute: null,
        techLevel: 1,
        cap: {
          injection: 400,
          gjPerSecond: 30,
          boostsPerLoad: 3,
          capacitor: { stable: true, stablePercentage: 55 },
        },
      },
    ]);
    renderPanel({
      fitting: {
        ...fitting,
        modules: [{ slot: 'medium', slotIndex: 0, typeId: 600, state: 'active' }],
      },
      target: null,
      catalogue: {
        ...catalogue,
        types: {
          600: { name: 'Medium Capacitor Booster II' },
          700: { name: 'Navy Cap Booster 400' },
        } as unknown as FittingCatalogue['types'],
        typeIdsByGroup: new Map([[9, [700]]]),
      },
      moduleResults: [{ state: 'active', maxState: 'active', chargeGroupIds: [9] }],
    });
    await user.click(screen.getByRole('tab', { name: 'Charges' }));
    expect(
      screen.getByRole('button', { name: /^Navy Cap Booster 400, stable at 55%, 30 GJ\/s/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Smallest stable/ })).toBeInTheDocument();
    // The weapon picker's View/Sort controls aren't a cap booster's.
    expect(screen.queryByRole('button', { name: 'Usable' })).not.toBeInTheDocument();
  });

  it('adds any item to the cargo hold, in the quantity asked, from the Cargo tab', async () => {
    const user = userEvent.setup();
    const onAddCargo = vi.fn();
    renderPanel({ target: { kind: 'cargo' }, onAddCargo });

    // A cargo target opens on the Cargo tab, which searches every market item.
    expect(screen.getByRole('tab', { name: 'Cargo', selected: true })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search items to put in the cargo hold'), 'Anchoring');
    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.click(screen.getByRole('button', { name: /Anchoring Array/ }));
    expect(onAddCargo).toHaveBeenCalledWith(4, 3);
  });

  it('gives each Cargo tab result the List cargo row’s menu once it is in the hold', async () => {
    const user = userEvent.setup();
    const onAddCargo = vi.fn();
    const actions = fakeItemActions({ names: { 4: 'Anchoring Array', 3: '1MN Afterburner II' } });
    const holding: Fitting = { ...fitting, cargo: [{ typeId: 4, quantity: 2 }] };
    render(
      <MemoryRouter>
        <FakeItemActions>
          <FittingItemActionsProvider value={actions}>
            <FittingAddPanel
              fitting={holding}
              catalogue={catalogue}
              target={{ kind: 'cargo' }}
              engineReady
              profile={profile}
              canPlace={() => true}
              onAdd={vi.fn()}
              onAddCargo={onAddCargo}
            />
          </FittingItemActionsProvider>
        </FakeItemActions>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Search items to put in the cargo hold'), 'Anchoring');
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Anchoring Array' }),
      {
        button: 0,
        pointerType: 'mouse',
      }
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Add 1 to cargo' }));
    expect(onAddCargo).toHaveBeenCalledWith(4, 1);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Anchoring Array' }),
      {
        button: 0,
        pointerType: 'mouse',
      }
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Change quantity…' }));
    expect(actions.changeCargoQuantity).toHaveBeenCalledWith(4);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Anchoring Array' }),
      {
        button: 0,
        pointerType: 'mouse',
      }
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove Anchoring Array' }));
    expect(actions.removeCargo).toHaveBeenCalledWith(4);
  });

  it('offers no quantity change or removal for a result not in the hold yet', async () => {
    const user = userEvent.setup();
    const actions = fakeItemActions({ names: { 3: '1MN Afterburner II' } });
    render(
      <MemoryRouter>
        <FakeItemActions>
          <FittingItemActionsProvider value={actions}>
            <FittingAddPanel
              fitting={fitting}
              catalogue={catalogue}
              target={{ kind: 'cargo' }}
              engineReady
              profile={profile}
              canPlace={() => true}
              onAdd={vi.fn()}
              onAddCargo={vi.fn()}
            />
          </FittingItemActionsProvider>
        </FakeItemActions>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Search items to put in the cargo hold'), 'Afterburner');
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for 1MN Afterburner II' }),
      { button: 0, pointerType: 'mouse' }
    );
    expect(await screen.findByRole('menuitem', { name: 'Add 1 to cargo' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Show info/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Change quantity…' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^Remove/ })).toBeNull();
  });

  it('shows the picked slot as its in-game icon, toggling the fits-this-slot filter', async () => {
    const user = userEvent.setup();
    renderPanel({ target: { kind: 'slot', slot: 'low', slotIndex: 0 } });

    const toggle = screen.getByRole('button', { name: 'Fits this slot' });
    expect(toggle.querySelector('img')).toHaveAttribute('src', '/images/fitting/slot-low.png');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Fits this slot')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no fits-this-slot toggle when no slot is picked', () => {
    renderPanel({ target: null });
    expect(screen.queryByRole('button', { name: 'Fits this slot' })).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { FittingAddPanel } from './FittingAddPanel';
import { FittingItemActionsProvider } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';
import type { FittingCatalogue } from './useFittingCatalogue';

const checkCandidates = vi.fn();
const checkCharges = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  checkCandidates: (...args: unknown[]) => checkCandidates(...args),
  checkCharges: (...args: unknown[]) => checkCharges(...args),
}));

const fitting: Fitting = { name: 'Rifter', shipTypeId: 587, modules: [], drones: [], cargo: [] };
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

const catalogue: FittingCatalogue = {
  types: {},
  rackOf: { 1: 'low', 2: 'low', 3: 'medium', 4: 'medium' },
  marketTypes: [
    { typeId: 1, name: 'Damage Control I', marketGroupId: 10 },
    { typeId: 2, name: 'Damage Control II', marketGroupId: 10 },
    { typeId: 3, name: '1MN Afterburner II', marketGroupId: 20 },
    { typeId: 4, name: 'Anchoring Array', marketGroupId: 30 },
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

    // The hull check runs in the background; browsing waits for it. "Can fly"
    // starts on, hiding Damage Control II (no skills for it) until it's off.
    const canFly = await screen.findByRole('button', { name: 'Can fly' });
    expect(screen.queryByRole('button', { name: /Damage Control II/ })).not.toBeInTheDocument();
    await user.click(canFly);
    const dc2 = await screen.findByRole('button', { name: /Damage Control II/ });
    expect(screen.queryByRole('button', { name: /Afterburner/ })).not.toBeInTheDocument();
    // Damage Control I doesn't fit the hull.
    expect(screen.queryByText('Damage Control I')).toBeNull();
    expect(dc2).toHaveTextContent('Missing skills');

    await user.click(dc2);
    expect(onAdd).toHaveBeenCalledWith(2, 'low');
  });

  it('says when Can fly hid the search matches, and one tap shows them', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: true, canFly: id !== 2, fitsResources: true }])
      );
    });
    renderPanel({ target: null });

    await screen.findByRole('button', { name: 'Can fly' });
    await user.type(screen.getByLabelText('Search items to add'), 'Damage Control II');
    expect(screen.queryByText('No matching items.')).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: '1 more hidden by Can fly — show it' })
    );
    expect(await screen.findByRole('button', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hidden by Can fly/ })).not.toBeInTheDocument();
  });

  it('keeps the plain no-results wording when nothing matches at all', async () => {
    const user = userEvent.setup();
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: true, canFly: id !== 2, fitsResources: true }])
      );
    });
    renderPanel({ target: null });

    await screen.findByRole('button', { name: 'Can fly' });
    await user.type(screen.getByLabelText('Search items to add'), 'zzzz');
    expect(screen.getByText('No matching items.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hidden by Can fly/ })).not.toBeInTheDocument();
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

  it('hides modules too big for the bare hull’s CPU, powergrid or calibration', async () => {
    checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
      return new Map(
        ids.map((id) => [id, { fitsHull: true, canFly: true, fitsResources: id !== 4 }])
      );
    });
    renderPanel({ target: null });

    expect(await screen.findByRole('button', { name: /Afterburners/ })).toBeInTheDocument();
    expect(screen.queryByText('Structure Equipment')).toBeNull();
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
});

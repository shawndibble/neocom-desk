import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { FittingAddPanel } from './FittingAddPanel';
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
    expect(onLoadCharge).toHaveBeenCalledWith(400, 501);
  });
});

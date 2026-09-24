import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { FittingAddPanel } from './FittingAddPanel';
import type { FittingCatalogue } from './useFittingCatalogue';

const checkCandidates = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  checkCandidates: (...args: unknown[]) => checkCandidates(...args),
}));

const fitting: Fitting = { name: 'Rifter', shipTypeId: 587, modules: [], drones: [], cargo: [] };
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [] };

const catalogue: FittingCatalogue = {
  types: {},
  rackOf: { 1: 'low', 2: 'low', 3: 'medium' },
  marketTypes: [
    { typeId: 1, name: 'Damage Control I', marketGroupId: 10 },
    { typeId: 2, name: 'Damage Control II', marketGroupId: 10 },
    { typeId: 3, name: '1MN Afterburner II', marketGroupId: 20 },
  ],
  groupsById: new Map(),
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
      showGroups={false}
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
      return new Map(ids.map((id) => [id, { fitsHull: id !== 1, canFly: id !== 2 }]));
    });
    const { onAdd } = renderPanel();

    expect(screen.queryByRole('button', { name: /Afterburner/ })).not.toBeInTheDocument();
    // Damage Control I doesn't fit the hull.
    expect(screen.queryByText('Damage Control I')).toBeNull();
    const dc2 = screen.getByRole('button', { name: /Damage Control II/ });
    expect(dc2).toHaveTextContent('Missing skills');

    await user.click(dc2);
    expect(onAdd).toHaveBeenCalledWith(2, 'low');
  });
});

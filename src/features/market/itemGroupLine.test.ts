import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGroupCategories, loadShipTree, loadTypes } from '@/sde/loadSde';
import type { ShipTreeData, TypeMap } from '@/sde/types';
import { loadGroupNames } from './groupNames';
import { loadItemGroupLine } from './itemGroupLine';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(),
  loadGroupCategories: vi.fn(),
  loadShipTree: vi.fn(),
}));
vi.mock('./groupNames', () => ({ loadGroupNames: vi.fn() }));

const ZEALOT = 12003;
const HAC_GROUP = 358;
const HEAT_SINK = 2364;
const HEAT_SINK_GROUP = 205;

const types = {
  [ZEALOT]: { name: 'Zealot', groupID: HAC_GROUP, volume: 118000 },
  [HEAT_SINK]: { name: 'Heat Sink II', groupID: HEAT_SINK_GROUP, volume: 5 },
} as unknown as TypeMap;

const shipTree = {
  factions: [{ id: 500003, name: 'Amarr Empire', description: '' }],
  groups: {},
  ships: [{ typeID: ZEALOT, name: 'Zealot', factionID: 500003 }],
} as unknown as ShipTreeData;

function arrange() {
  vi.mocked(loadTypes).mockResolvedValue(types);
  vi.mocked(loadGroupCategories).mockResolvedValue({ [HAC_GROUP]: 6, [HEAT_SINK_GROUP]: 7 });
  vi.mocked(loadShipTree).mockResolvedValue(shipTree);
  vi.mocked(loadGroupNames).mockResolvedValue(
    new Map([
      [HAC_GROUP, 'Heavy Assault Cruiser'],
      [HEAT_SINK_GROUP, 'Heat Sink'],
    ])
  );
}

afterEach(() => vi.clearAllMocks());

describe('loadItemGroupLine', () => {
  it("names a ship's Group and its faction", async () => {
    arrange();
    expect(await loadItemGroupLine(ZEALOT)).toEqual({
      group: 'Heavy Assault Cruiser',
      faction: 'Amarr Empire',
    });
  });

  it('names a module by its Group alone, without reading the Ship Tree', async () => {
    arrange();
    expect(await loadItemGroupLine(HEAT_SINK)).toEqual({ group: 'Heat Sink', faction: null });
    expect(loadShipTree).not.toHaveBeenCalled();
  });

  it('is null for a type with no local Group, or a Group it cannot name', async () => {
    arrange();
    expect(await loadItemGroupLine(1)).toBeNull();
    vi.mocked(loadGroupNames).mockResolvedValue(new Map());
    expect(await loadItemGroupLine(HEAT_SINK)).toBeNull();
  });

  it('is null rather than rejecting when the type list cannot be read', async () => {
    arrange();
    vi.mocked(loadTypes).mockRejectedValue(new Error('offline'));
    expect(await loadItemGroupLine(ZEALOT)).toBeNull();
  });
});

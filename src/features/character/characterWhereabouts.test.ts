import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  place: vi.fn(),
  ship: vi.fn(),
  station: vi.fn(),
  structure: vi.fn(),
  system: vi.fn(),
  types: vi.fn(),
}));
vi.mock('./location', () => ({ loadCharacterPlaceRead: mocks.place }));
vi.mock('./ship', () => ({ loadCharacterShipTypeRead: mocks.ship }));
vi.mock('./stations', () => ({ loadStationName: mocks.station }));
vi.mock('./structures', () => ({ loadStructureNameNoRoster: mocks.structure }));
vi.mock('./systemSecurity', () => ({ loadSystemName: mocks.system }));
vi.mock('./typeNames', () => ({ loadTypeNames: mocks.types }));

import { loadCharacterWhereabouts, placeLabel, placeSortText } from './characterWhereabouts';

const both = { location: true, ship: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.system.mockResolvedValue('Jita');
  mocks.ship.mockResolvedValue({ typeId: 648, fetchedAt: null });
  mocks.types.mockResolvedValue(new Map([[648, 'Badger']]));
});

describe('loadCharacterWhereabouts', () => {
  it('names the station when docked at an NPC station', async () => {
    mocks.place.mockResolvedValue({
      place: { systemId: 1, stationId: 60003760, structureId: null },
    });
    mocks.station.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    const result = await loadCharacterWhereabouts(1, both);
    expect(result.place).toEqual({
      systemName: 'Jita',
      dockedKind: 'station',
      dockedName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    });
    expect(result.shipName).toBe('Badger');
  });

  it('keeps the row when a structure name cannot be resolved', async () => {
    mocks.place.mockResolvedValue({ place: { systemId: 1, stationId: null, structureId: 9 } });
    mocks.structure.mockRejectedValue(new Error('403'));
    const result = await loadCharacterWhereabouts(1, both);
    expect(result.place).toEqual({ systemName: 'Jita', dockedKind: 'structure', dockedName: null });
  });

  it('reports in space when neither id is present', async () => {
    mocks.place.mockResolvedValue({ place: { systemId: 1, stationId: null, structureId: null } });
    const result = await loadCharacterWhereabouts(1, both);
    expect(result.place?.dockedKind).toBeNull();
  });

  it('skips a read whose scope is not granted', async () => {
    const result = await loadCharacterWhereabouts(1, { location: false, ship: false });
    expect(mocks.place).not.toHaveBeenCalled();
    expect(mocks.ship).not.toHaveBeenCalled();
    expect(result).toEqual({ place: null, shipName: null });
  });
});

describe('placeLabel / placeSortText', () => {
  const base = { systemName: 'Amarr', dockedName: null };
  it('labels each state', () => {
    expect(placeLabel({ ...base, dockedKind: null })).toEqual({ kind: 'inSpace', system: 'Amarr' });
    expect(placeLabel({ ...base, dockedKind: 'structure' })).toEqual({
      kind: 'structureIn',
      system: 'Amarr',
    });
    expect(placeLabel({ ...base, dockedKind: 'station', dockedName: 'Amarr VIII' })).toEqual({
      kind: 'docked',
      name: 'Amarr VIII',
    });
  });

  it('sorts a docked character by station name, others by system, unread last', () => {
    expect(placeSortText({ ...base, dockedKind: 'station', dockedName: 'Amarr VIII' })).toBe(
      'Amarr VIII'
    );
    expect(placeSortText({ ...base, dockedKind: null })).toBe('Amarr');
    expect(placeSortText(null)).toBeUndefined();
  });
});

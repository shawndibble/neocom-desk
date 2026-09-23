import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { useOfferLocations } from './offerLocations';

vi.mock('@/sde/npcStations', () => ({ lookupNpcStation: vi.fn() }));
vi.mock('@/sde/solarSystems', () => ({ lookupSolarSystem: vi.fn() }));

const mockedLookupNpcStation = vi.mocked(lookupNpcStation);
const mockedLookupSolarSystem = vi.mocked(lookupSolarSystem);

const JITA_STATION = 60003760;
const JITA_SYSTEM = 30000142;
const AMARR_STATION = 60008494;
const STRUCTURE = 1035466617946;
const UNREADABLE = 1035466617947;

const JITA: NpcStationEntry = { id: JITA_STATION, name: 'Jita IV - Moon 4', systemId: JITA_SYSTEM };
const JITA_SYSTEM_ENTRY: SolarSystemEntry = {
  id: JITA_SYSTEM,
  name: 'Jita',
  security: 0.9459,
  regionId: 10000002,
};

function offerRow(overrides: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: JITA_STATION,
    typeId: 34,
    price: 100,
    isAuction: false,
    quantity: 1,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedLookupNpcStation.mockImplementation(async (locationId: number) => {
    if (locationId === JITA_STATION) return JITA;
    if (locationId === UNREADABLE) return undefined;
    return null; // a player structure by elimination
  });
  mockedLookupSolarSystem.mockImplementation(async (systemId: number) =>
    systemId === JITA_SYSTEM ? JITA_SYSTEM_ENTRY : null
  );
});

describe('useOfferLocations', () => {
  it('resolves a station to its system name and raw security status', async () => {
    const { result } = renderHook(() => useOfferLocations([offerRow()]));

    await waitFor(() =>
      expect(result.current.get(JITA_STATION)).toEqual({
        systemId: 30000142,
        systemName: 'Jita',
        security: 0.9459,
      })
    );
  });

  it('leaves a player structure unplaced, present with nulls rather than absent', async () => {
    const { result } = renderHook(() =>
      useOfferLocations([offerRow({ contractId: 2, locationId: STRUCTURE })])
    );

    await waitFor(() =>
      expect(result.current.get(STRUCTURE)).toEqual({
        systemId: null,
        systemName: null,
        security: null,
      })
    );
  });

  it('leaves an unreadable station table unplaced the same way, not a thrown error', async () => {
    const { result } = renderHook(() =>
      useOfferLocations([offerRow({ contractId: 3, locationId: UNREADABLE })])
    );

    await waitFor(() =>
      expect(result.current.get(UNREADABLE)).toEqual({
        systemId: null,
        systemName: null,
        security: null,
      })
    );
  });

  it('dedupes distinct location ids, calling the station lookup once per id', async () => {
    const { result } = renderHook(() =>
      useOfferLocations([
        offerRow({ contractId: 1 }),
        offerRow({ contractId: 2 }),
        offerRow({ contractId: 3, typeId: 35 }),
      ])
    );

    await waitFor(() => expect(result.current.get(JITA_STATION)).toBeDefined());
    expect(mockedLookupNpcStation).toHaveBeenCalledTimes(1);
  });

  it('keeps map identity across a re-render that lists the same distinct ids', async () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: readonly PublicContractOfferRow[] }) => useOfferLocations(rows),
      { initialProps: { rows: [offerRow()] } }
    );

    await waitFor(() => expect(result.current.get(JITA_STATION)).toBeDefined());
    const firstMap = result.current;
    mockedLookupNpcStation.mockClear();

    // A fresh array, same ids — e.g. a `useRouteSnapshot` revalidation.
    rerender({ rows: [offerRow({ contractId: 99 })] });

    expect(result.current).toBe(firstMap);
    expect(mockedLookupNpcStation).not.toHaveBeenCalled();
  });

  it('resolves a location whose station lookup succeeds but whose system is unreadable as unplaced', async () => {
    mockedLookupNpcStation.mockResolvedValue({
      id: AMARR_STATION,
      name: 'Amarr VIII',
      systemId: 999,
    });

    const { result } = renderHook(() =>
      useOfferLocations([offerRow({ contractId: 4, locationId: AMARR_STATION })])
    );

    await waitFor(() =>
      expect(result.current.get(AMARR_STATION)).toEqual({
        systemId: null,
        systemName: null,
        security: null,
      })
    );
  });
});

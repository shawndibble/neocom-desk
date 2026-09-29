import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { CourierEndpoint, CourierRouteRow } from '@/engine/contracts/courierSearch';
import { courierContractsCsvColumns, type CourierCsvLookups } from './courierContractsCsv';

const t = (k: string) => k;

const lookups: CourierCsvLookups = {
  regionName: (regionId) =>
    regionId === null ? null : regionId === 10000002 ? 'The Forge' : `#${regionId}`,
  jumps: (row) => (row.contractId === 1 ? 9 : null),
};

function endpoint(overrides: Partial<CourierEndpoint> = {}): CourierEndpoint {
  return {
    locationId: 60003760,
    name: 'Jita IV - Moon 4',
    systemName: 'Jita',
    systemId: 30000142,
    regionId: 10000002,
    security: 0.95,
    space: 'highsec',
    resolution: 'station',
    hasStargates: true,
    ...overrides,
  } as CourierEndpoint;
}

function haul(overrides: Partial<CourierRouteRow> = {}): CourierRouteRow {
  return {
    contractId: 1,
    regionId: 10000002,
    originLocationId: 60003760,
    destinationLocationId: 60008494,
    reward: 18_000_000,
    volume: 12_000,
    collateral: 250_000_000,
    dateExpired: Date.UTC(2026, 9, 1, 8, 30, 0),
    origin: endpoint(),
    destination: endpoint({ locationId: 60008494, systemName: 'Amarr', regionId: 10000043 }),
    ...overrides,
  };
}

describe('courierContractsCsvColumns', () => {
  it("uses the courier board's labels: both ends, then the table's figures", () => {
    expect(courierContractsCsvColumns(t, lookups).map((c) => c.header)).toEqual([
      'contractSearch.pickUpLabel',
      'contractSearch.originRegionLabel',
      'contractSearch.dropOffLabel',
      'contractSearch.destinationRegionLabel',
      'contractSearch.rewardColumn',
      'contractSearch.collateralColumn',
      'contractSearch.volumeColumn',
      'contractSearch.jumpsColumn',
      'contractSearch.iskPerJumpColumn',
      'contractSearch.iskPerVolumeColumn',
      'contractSearch.expiresColumn',
    ]);
  });

  it('writes raw numbers, both ends by name and the expiry as a UTC date', () => {
    const csv = toCsv([haul()], courierContractsCsvColumns(t, lookups));
    expect(csv.split('\r\n')[1]).toBe(
      '"Jita","The Forge","Amarr","#10000043",18000000,250000000,12000,9,2000000,1500,2026-10-01 08:30:00'
    );
  });

  it('leaves unknown jumps and their rate blank, and a missing collateral as 0', () => {
    const csv = toCsv(
      [haul({ contractId: 2, collateral: undefined })],
      courierContractsCsvColumns(t, lookups)
    );
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields.slice(5, 9)).toEqual(['0', '12000', '', '']);
  });

  it('names an unplaced end the way the board does', () => {
    const csv = toCsv(
      [
        haul({
          origin: endpoint({
            locationId: 1_035_000_000_000,
            name: null,
            systemName: null,
            regionId: null,
          }),
        }),
      ],
      courierContractsCsvColumns(t, lookups)
    );
    expect(csv.split('\r\n')[1].split(',').slice(0, 2)).toEqual(['"#1035000000000"', '']);
  });
});

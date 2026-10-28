import { describe, expect, it } from 'vitest';
import { nearestNpcStation } from '@/features/loyalty/nearestNpcStation';
import type { NpcStationEntry } from '@/sde/marketTypes';

const JUMPS = new Map<number, number>([
  [30000001, 0],
  [30000002, 3],
  [30000003, 3],
  [30000005, 8],
]);

const STATIONS: NpcStationEntry[] = [
  { id: 60000005, name: 'Far', systemId: 30000005, ownerCorporationId: 1 },
  { id: 60000003, name: 'Tie high id', systemId: 30000003, ownerCorporationId: 1 },
  { id: 60000002, name: 'Tie low id', systemId: 30000002, ownerCorporationId: 1 },
  { id: 60000009, name: 'Other corp', systemId: 30000001, ownerCorporationId: 2 },
  { id: 60000010, name: 'Unreachable', systemId: 30000004, ownerCorporationId: 1 },
  { id: 60000011, name: 'No owner', systemId: 30000001 },
];

describe('nearestNpcStation', () => {
  it('picks the owner station with the fewest jumps', () => {
    expect(nearestNpcStation(2, STATIONS, JUMPS)).toEqual({
      stationId: 60000009,
      stationName: 'Other corp',
      systemId: 30000001,
      jumps: 0,
    });
  });

  it('breaks a jump tie by the lowest station id', () => {
    expect(nearestNpcStation(1, STATIONS, JUMPS)).toEqual({
      stationId: 60000002,
      stationName: 'Tie low id',
      systemId: 30000002,
      jumps: 3,
    });
  });

  it('gives null when no station is reachable', () => {
    expect(nearestNpcStation(1, [STATIONS[4]], JUMPS)).toBeNull();
  });

  it('gives null without a distance map (no Current System)', () => {
    expect(nearestNpcStation(1, STATIONS, null)).toBeNull();
  });

  it('treats a station with no owner field as unknown', () => {
    const legacy: NpcStationEntry[] = [{ id: 1, name: 'Old', systemId: 30000001 }];
    expect(nearestNpcStation(1, legacy, JUMPS)).toBeNull();
  });
});

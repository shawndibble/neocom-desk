import { describe, expect, it } from 'vitest';
import {
  buildFleetBoard,
  DSCAN_AXIS_KM,
  laneOffset,
  roleOfType,
  type DscanTypeInfo,
} from './dscanRoles';
import type { DscanRow } from './parsePilotPaste';

const SHIP = 6;
const INFO: Record<number, DscanTypeInfo> = {
  1: { groupId: 543, categoryId: SHIP }, // Mackinaw (Exhumer)
  2: { groupId: 941, categoryId: SHIP }, // Orca
  3: { groupId: 100, categoryId: 18 }, // Combat drone
  4: { groupId: 26, categoryId: SHIP }, // Cruiser
  5: { groupId: 28, categoryId: SHIP }, // Industrial
  6: { groupId: 832, categoryId: SHIP }, // Logistics
  7: { groupId: 547, categoryId: SHIP }, // Carrier
  8: { groupId: 1657, categoryId: 65 }, // Citadel
  9: { groupId: 29, categoryId: SHIP }, // Capsule
};

const row = (typeId: number, distanceKm: number | null, name = '', typeName = ''): DscanRow => ({
  typeId,
  name,
  typeName,
  distanceKm,
});

describe('roleOfType', () => {
  // One line per pinned group id, so a wrong id fails by name.
  const cases: [string, number, number, string][] = [
    ['Exhumer', 543, SHIP, 'industrial'],
    ['Mining Barge', 463, SHIP, 'industrial'],
    ['Industrial Command Ship', 941, SHIP, 'industrial'],
    ['Capital Industrial', 883, SHIP, 'industrial'],
    ['Industrial', 28, SHIP, 'transport'],
    ['Deep Space Transport', 380, SHIP, 'transport'],
    ['Blockade Runner', 1202, SHIP, 'transport'],
    ['Freighter', 513, SHIP, 'transport'],
    ['Jump Freighter', 902, SHIP, 'transport'],
    ['Logistics', 832, SHIP, 'support'],
    ['Logistics Frigate', 1527, SHIP, 'support'],
    ['Command Ship', 540, SHIP, 'support'],
    ['Command Destroyer', 1534, SHIP, 'support'],
    ['Force Recon', 833, SHIP, 'support'],
    ['Combat Recon', 906, SHIP, 'support'],
    ['Interdictor', 541, SHIP, 'support'],
    ['Heavy Interdiction Cruiser', 894, SHIP, 'support'],
    ['Electronic Attack Ship', 893, SHIP, 'support'],
    ['Black Ops', 898, SHIP, 'support'],
    ['Expedition Frigate', 1283, SHIP, 'industrial'],
    ['Stealth Bomber', 834, SHIP, 'dps'],
    ['Covert Ops', 830, SHIP, 'support'],
    ['Carrier', 547, SHIP, 'capitals'],
    ['Dreadnought', 485, SHIP, 'capitals'],
    ['Supercarrier', 659, SHIP, 'capitals'],
    ['Titan', 30, SHIP, 'capitals'],
    ['Force Auxiliary', 1538, SHIP, 'capitals'],
    ['Lancer Dreadnought', 4594, SHIP, 'capitals'],
    ['Cruiser', 26, SHIP, 'dps'],
    ['Marauder', 900, SHIP, 'dps'],
    ['Combat Drone', 100, 18, 'drones'],
    ['Fighter', 1652, 87, 'drones'],
    ['Mobile Warp Disruptor', 361, 22, 'drones'],
    ['Citadel', 1657, 65, 'structures'],
    ['Control Tower', 365, 23, 'structures'],
    ['Customs Office', 1025, 46, 'structures'],
  ];
  it.each(cases)('puts %s (group %i) in %s', (_name, groupId, categoryId, role) => {
    expect(roleOfType({ groupId, categoryId }, '')).toBe(role);
  });

  it('leaves capsules, shuttles and unknown types out', () => {
    expect(roleOfType({ groupId: 29, categoryId: SHIP }, '')).toBeNull();
    expect(roleOfType({ groupId: 31, categoryId: SHIP }, '')).toBeNull();
    expect(roleOfType({ groupId: 479, categoryId: 8 }, 'Core Scanner Probe I')).toBeNull();
    expect(roleOfType(undefined, 'Sun')).toBeNull();
  });

  it('files a wreck under structures by the name the client printed, since the SDE has no wreck types', () => {
    expect(roleOfType(undefined, 'Vexor Wreck')).toBe('structures');
    expect(roleOfType(undefined, 'Large Wreck')).toBe('structures');
  });
});

describe('buildFleetBoard', () => {
  const rows = [
    row(1, 100, 'OR:E', 'Mackinaw'),
    row(1, 40, 'OR:E', 'Mackinaw'),
    row(1, 60, 'Bob', 'Mackinaw'),
    row(2, 90, 'Boss', 'Orca'),
    row(3, 75),
    row(3, 77),
    row(8, null),
    row(9, 5),
  ];
  const board = buildFleetBoard(rows, (id) => INFO[id]);

  it('lists non-empty roles in a fixed order with counts and percent of what was counted', () => {
    expect(board.roles.map((r) => [r.role, r.total])).toEqual([
      ['industrial', 4],
      ['drones', 2],
      ['structures', 1],
    ]);
    expect(board.counted).toBe(7);
    expect(board.roles.map((r) => Math.round(r.percent))).toEqual([57, 29, 14]);
  });

  it('counts what no role claims as left out', () => {
    expect(board.leftOut).toBe(1);
  });

  it('lists each hull once with its count and distance range, most numerous first', () => {
    const industrial = board.roles[0];
    expect(industrial.hulls).toEqual([
      expect.objectContaining({
        typeId: 1,
        groupId: 543,
        count: 3,
        minKm: 40,
        maxKm: 100,
        nameHint: { name: 'OR:E', count: 2 },
      }),
      expect.objectContaining({ typeId: 2, count: 1, minKm: 90, maxKm: 90, nameHint: null }),
    ]);
  });

  it('gives no distance range to a hull with no distances', () => {
    const structures = board.roles[2];
    expect(structures.hulls[0]).toMatchObject({ minKm: null, maxKm: null });
  });

  it('keeps the distances of each role for the lanes, nearest first, skipping unknown ones', () => {
    expect(board.roles[0].distancesKm).toEqual([40, 60, 90, 100]);
    expect(board.roles[2].distancesKm).toEqual([]);
  });

  it('gives no name hint for a single ship, or when the ship name is just its hull', () => {
    const solo = buildFleetBoard(
      [row(4, 1, 'Only', 'Cruiser'), row(4, 2, 'Cruiser', 'Cruiser')],
      (id) => INFO[id]
    );
    expect(solo.roles[0].hulls[0].nameHint).toBeNull();
  });
});

describe('laneOffset', () => {
  it('places a distance on the 0 to 150 km axis as a fraction', () => {
    expect(DSCAN_AXIS_KM).toBe(150);
    expect(laneOffset(0)).toEqual({ fraction: 0, beyond: false });
    expect(laneOffset(75)).toEqual({ fraction: 0.5, beyond: false });
    expect(laneOffset(150)).toEqual({ fraction: 1, beyond: false });
  });

  it('pins anything farther to the right edge and says so', () => {
    expect(laneOffset(151)).toEqual({ fraction: 1, beyond: true });
    expect(laneOffset(3_000_000)).toEqual({ fraction: 1, beyond: true });
  });
});

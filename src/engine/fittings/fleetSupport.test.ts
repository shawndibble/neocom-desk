import { describe, expect, it } from 'vitest';
import {
  FLEET_ATTRIBUTE as A,
  extractFleetSupport,
  hasFleetSupport,
  NO_FLEET_SUPPORT,
} from './fleetSupport';

type Item = Parameters<typeof extractFleetSupport>[0][number];
type Result = Parameters<typeof extractFleetSupport>[1][number];

const item = (typeId: number, chargeTypeId?: number, slot = 'high'): Item => ({
  type_id: typeId,
  slot: { type: slot },
  ...(chargeTypeId === undefined ? {} : { charge: { type_id: chargeTypeId } }),
});
const result = (attributes: [number, number][], state = 'active'): Result => ({
  attributes: new Map(attributes.map(([id, value]) => [id, { value }])),
  state,
});

/** A Mining Foreman Burst II with a charge, as the pinned engine reads it on an Orca. */
const burst = (state = 'active'): Result =>
  result(
    [
      [A.optimal, 51_827.5],
      [A.reload, 30_000],
      [A.buffDuration, 92_700],
      [A.buffIds[0], 23],
      [A.buffValues[0], 77.25],
      [A.buffIds[1], 2474],
      [A.buffValues[1], 3.8625],
    ],
    state
  );

describe('extractFleetSupport', () => {
  it('reads a running burst: range, length, reload and every buff it hands out', () => {
    const stats = extractFleetSupport([item(43551, 42829)], [burst()]);
    expect(stats.bursts).toEqual([
      {
        typeId: 43551,
        chargeTypeId: 42829,
        count: 1,
        strengths: [77.25, 3.8625],
        rangeMeters: 51_827.5,
        durationSeconds: 92.7,
        reloadSeconds: 30,
      },
    ]);
  });

  it('reports a shield burst by the size of its (negative) strength', () => {
    const shield = result([
      [A.optimal, 65_812.5],
      [A.reload, 30_000],
      [A.buffDuration, 92_700],
      [A.buffIds[0], 10],
      [A.buffValues[0], -15.45],
    ]);
    expect(extractFleetSupport([item(43555, 42695)], [shield]).bursts[0]?.strengths).toEqual([
      15.45,
    ]);
  });

  it('keeps a burst with no charge, with nothing to hand out', () => {
    const bare = result([
      [A.optimal, 23_625],
      [A.reload, 60_000],
      [A.buffDuration, 61_800],
      [A.buffValues[0], 1.2875],
    ]);
    const [row] = extractFleetSupport([item(43551)], [bare]).bursts;
    expect(row?.chargeTypeId).toBeUndefined();
    expect(row?.strengths).toEqual([]);
  });

  it('groups copies of one burst and charge, and ignores an offline one', () => {
    const stats = extractFleetSupport(
      [item(43551, 42829), item(43551, 42829), item(43551, 42829)],
      [burst(), burst(), burst('online')]
    );
    expect(stats.bursts).toHaveLength(1);
    expect(stats.bursts[0]?.count).toBe(2);
  });

  it('reads a compressor by its required skill, with its range and cycle', () => {
    const compressor = result([
      [A.requiredSkill, 62450],
      [A.optimal, 124_500],
      [A.cycle, 60_000],
    ]);
    expect(extractFleetSupport([item(62625)], [compressor]).compressors).toEqual([
      { typeId: 62625, count: 1, rangeMeters: 124_500, cycleSeconds: 60 },
    ]);
  });

  it('reads an industrial core by its required skill, with the fuel it burns', () => {
    const core = result([
      [A.requiredSkill, 58956],
      [A.cycle, 150_000],
      [A.fuelType, 16_272],
      [A.fuelQuantity, 375],
    ]);
    expect(extractFleetSupport([item(58950)], [core]).core).toEqual({
      typeId: 58950,
      fuelTypeId: 16_272,
      fuelPerCycle: 375,
      cycleSeconds: 150,
    });
  });

  it('leaves out a module that only burns fuel, such as a siege module', () => {
    const siege = result([
      [A.requiredSkill, 12_345],
      [A.fuelType, 16_274],
      [A.fuelQuantity, 500],
    ]);
    const stats = extractFleetSupport([item(20_000)], [siege]);
    expect(stats).toEqual({ bursts: [], compressors: [], core: null });
  });

  it('is empty for a fit with none of these', () => {
    expect(extractFleetSupport([item(1, undefined, 'medium')], [result([])])).toEqual({
      bursts: [],
      compressors: [],
      core: null,
    });
  });
});

describe('hasFleetSupport', () => {
  it('is true for a burst, a compressor or a core, false for none', () => {
    expect(hasFleetSupport(NO_FLEET_SUPPORT)).toBe(false);
    const bursts = extractFleetSupport([item(43551, 42829)], [burst()]).bursts;
    expect(hasFleetSupport({ ...NO_FLEET_SUPPORT, bursts })).toBe(true);
    expect(
      hasFleetSupport({
        ...NO_FLEET_SUPPORT,
        core: { typeId: 1, fuelTypeId: 2, fuelPerCycle: 3, cycleSeconds: 4 },
      })
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { DemandLine } from '@/engine/pi/goalTypes';
import { flowCsvColumns, haulingCsvColumns, type LegRow } from './planExportColumns';
import type { PlanNames } from './format';

const t = ((k: string) => k) as unknown as TFunction;
const pi = {
  schematics: {
    '100': { name: 'Robotics', inputs: [{ typeID: 200 }] },
    '200': { name: 'Coolant', inputs: [{ typeID: 1 }] },
  },
  raw: [{ typeID: 1, name: 'Base Metals' }],
} as unknown as PlanNames['pi'];

function line(overrides: Partial<DemandLine>): DemandLine {
  return {
    typeId: 100,
    tier: 3,
    unitsPerHour: 2,
    factories: 1,
    source: 'made',
    madeFraction: 1,
    ...overrides,
  } as DemandLine;
}

describe('flowCsvColumns', () => {
  const columns = flowCsvColumns(t, pi, new Map([[1, ['barren', 'lava'] as never]]), () => 'src');

  it('names what blocks a blocked goal and the planet types it needs', () => {
    const blocked = line({ source: 'blocked', blockedBy: [1] });
    const values = columns.map((c) => c.value(blocked));
    expect(values.slice(-2)).toEqual([
      'Base Metals',
      'Base Metals: pi.planetType.barrenpiPlan.orpi.planetType.lava',
    ]);
  });

  it('leaves both blank on a line that is not blocked, and a blank factory count blank', () => {
    const values = columns.map((c) => c.value(line({ factories: null })));
    expect(values.slice(-2)).toEqual([null, null]);
    expect(values[4]).toBeNull();
  });
});

describe('haulingCsvColumns', () => {
  const names = {
    hub: { systemName: 'Jita' },
    planet: (id: number) => `Planet ${id}`,
    pi,
  } as unknown as PlanNames;
  const columns = haulingCsvColumns(t, names);
  const leg = (jumps: LegRow['jumps']): LegRow => ({
    key: 'k',
    from: 5,
    to: 'hub',
    typeId: 100,
    name: 'Robotics',
    m3PerTrip: 12.34,
    jumps,
  });

  it('adds the tier, an unrounded volume and a route status that tells pending from no route', () => {
    expect(columns.map((c) => c.value(leg(4)))).toEqual([
      'Planet 5',
      'Jita',
      'P2',
      'Robotics',
      12.34,
      4,
      'piPlan.csvRoute.routed',
    ]);
    expect(columns[5].value(leg(undefined))).toBeNull();
    expect(columns[6].value(leg(undefined))).toBe('piPlan.csvRoute.pending');
    expect(columns[6].value(leg(null))).toBe('piPlan.csvRoute.none');
    expect(columns[6].value(leg(0))).toBe('piPlan.csvRoute.sameSystem');
  });
});

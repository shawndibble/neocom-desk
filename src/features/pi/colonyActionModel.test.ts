import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import { colonyFactoryBalance } from './factoryBalanceModel';
import { idleFacilityPlan } from './colonyActionModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BACTERIA_SCHEMATIC = 131;
const WATER_SCHEMATIC = 121;

function colony(
  overrides: {
    pins?: number;
    extraction?: { typeId: number; unitsPerHour: number }[];
    production?: { schematicId: number; count: number }[];
    heads?: number;
    load?: { cpu: number; powergrid: number };
  } = {}
): BuiltColonyAdvice {
  const extraction = overrides.extraction ?? [{ typeId: MICROORGANISMS, unitsPerHour: 21_201 }];
  return {
    upgradeLevel: 5,
    budget: { cpu: 25_415, powergrid: 19_000 },
    lastUpdate: '2026-09-06T00:00:00Z',
    detailLoaded: true,
    pinLoad: {
      counts: { extractorControlUnit: 1, basic: overrides.pins ?? 8, launchpad: 1 },
      extractorHeads: overrides.heads ?? 10,
      load: overrides.load ?? { cpu: 7_560, powergrid: 16_155 },
      linkLoad: { cpu: 360, powergrid: 255 },
      newLinkLoad: { cpu: 31, powergrid: 22 },
      linkCount: 12,
      unknownTypeIds: [],
    },
    extractors: extraction.map((entry, i) => ({
      pinId: i + 1,
      productTypeId: entry.typeId,
      ratePerHour: entry.unitsPerHour,
      expiryMs: null,
    })),
    extractedPerHour: extraction,
    stoppedExtraction: null,
    production: overrides.production ?? [{ schematicId: BACTERIA_SCHEMATIC, count: 8 }],
    linkCount: 12,
    hasUnverifiedExtractors: false,
  };
}

function planFor(built: BuiltColonyAdvice, spare = { cpu: 17_855, powergrid: 2_845 }) {
  return idleFacilityPlan({
    colony: built,
    balance: colonyFactoryBalance(built, pi),
    pi,
    spare,
    newLinkCost: built.pinLoad.newLinkLoad,
  });
}

describe('idleFacilityPlan', () => {
  it('says nothing at all about a colony whose facilities are all fed', () => {
    const fed = colony({
      pins: 2,
      production: [{ schematicId: BACTERIA_SCHEMATIC, count: 2 }],
      extraction: [{ typeId: MICROORGANISMS, unitsPerHour: 12_000 }],
    });
    expect(planFor(fed)).toBeNull();
  });

  it('names the input that actually binds, not the first one listed', () => {
    const plan = planFor(colony());
    expect(plan?.lines).toHaveLength(1);
    expect(plan?.lines[0].gap?.name).toBe('Microorganisms');
    expect(plan?.lines[0].gap?.demand).toBeCloseTo(48_000, 6);
    expect(plan?.lines[0].gap?.supply).toBeCloseTo(21_201, 6);
  });

  it('gives each starved schematic its own line and its own freed budget', () => {
    const two = colony({
      pins: 8,
      extraction: [
        { typeId: MICROORGANISMS, unitsPerHour: 6_000 },
        { typeId: AQUEOUS_LIQUIDS, unitsPerHour: 6_000 },
      ],
      production: [
        { schematicId: BACTERIA_SCHEMATIC, count: 4 },
        { schematicId: WATER_SCHEMATIC, count: 4 },
      ],
    });
    const plan = planFor(two);
    expect(plan?.lines).toHaveLength(2);
    for (const line of plan?.lines ?? []) {
      expect(line.freed.powergrid).toBeCloseTo(line.line.surplusPins * 800, 6);
    }
  });

  it('refuses to size extraction against two starved schematics', () => {
    const two = colony({
      pins: 8,
      extraction: [
        { typeId: MICROORGANISMS, unitsPerHour: 6_000 },
        { typeId: AQUEOUS_LIQUIDS, unitsPerHour: 6_000 },
      ],
      production: [
        { schematicId: BACTERIA_SCHEMATIC, count: 4 },
        { schematicId: WATER_SCHEMATIC, count: 4 },
      ],
    });
    expect(planFor(two)?.upgrade.status).toBe('unmeasurable');
    expect(planFor(two)?.wouldFeed).toBe(0);
  });

  it('will not buy extraction into a colony that is out of Powergrid', () => {
    const plan = planFor(colony());
    expect(plan?.upgrade.status).toBe('needs-removal');
    expect(plan?.freeAfterRemoval.powergrid).toBeCloseTo(2_845 + 4 * 800, 6);
  });

  it('counts fed facilities off the binding input’s per-pin rate', () => {
    const plan = planFor(colony(), { cpu: 40_000, powergrid: 40_000 });
    expect(plan?.upgrade.status).toBe('fits');
    expect(plan?.wouldFeed).toBe(4);
  });

  it('never claims to feed more facilities than are actually idle', () => {
    const plan = planFor(colony(), { cpu: 1_000_000, powergrid: 1_000_000 });
    const idle = plan?.lines.reduce((sum, line) => sum + line.line.surplusPins, 0) ?? 0;
    expect(plan?.wouldFeed).toBeLessThanOrEqual(idle);
  });
});

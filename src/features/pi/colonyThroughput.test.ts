import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { PlanetPin } from '@/esi/endpoints';
import { sustainedRatePerHour } from '@/engine/pi/extraction';
import type { ExtractorYieldProgram } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import { colonyThroughputCheck, peakRatePerHour } from './colonyThroughput';
import { DAY_MS } from '@/lib/age';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const BACTERIA = 2393;
const BACTERIA_SCHEMATIC_ID = pi.schematics[String(BACTERIA)].schematicId;
const ECU_TYPE_ID = 3068;

const INSTALL_MS = Date.parse('2026-09-01T00:00:00Z');

function baseColony(overrides: Partial<BuiltColonyAdvice>): BuiltColonyAdvice {
  return {
    upgradeLevel: 4,
    budget: { cpu: 21_315, powergrid: 17_000 },
    lastUpdate: '2026-09-01T00:00:00Z',
    detailLoaded: true,
    pinLoad: {
      counts: {},
      extractorHeads: 0,
      load: { cpu: 0, powergrid: 0 },
      linkLoad: null,
      newLinkLoad: null,
      linkCount: 0,
      unknownTypeIds: [],
    },
    extractors: [],
    extractedPerHour: [],
    stoppedExtraction: null,
    production: [],
    linkCount: 0,
    hasUnverifiedExtractors: false,
    ...overrides,
  };
}

function extractorPin(opts: {
  pinId: number;
  productTypeId: number;
  qtyPerCycle?: number;
  cycleTimeSeconds?: number;
  installTimeMs?: number;
  expiryTimeMs: number;
}): PlanetPin {
  return {
    pin_id: opts.pinId,
    type_id: ECU_TYPE_ID,
    latitude: 0,
    longitude: 0,
    expiry_time: new Date(opts.expiryTimeMs).toISOString(),
    ...(opts.installTimeMs !== undefined
      ? { install_time: new Date(opts.installTimeMs).toISOString() }
      : {}),
    extractor_details: {
      heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
      ...(opts.cycleTimeSeconds !== undefined ? { cycle_time: opts.cycleTimeSeconds } : {}),
      ...(opts.qtyPerCycle !== undefined ? { qty_per_cycle: opts.qtyPerCycle } : {}),
      product_type_id: opts.productTypeId,
    },
  };
}

describe('peakRatePerHour', () => {
  const program: ExtractorYieldProgram = {
    pinId: 1,
    installTimeMs: INSTALL_MS,
    expiryTimeMs: INSTALL_MS + 14 * DAY_MS,
    qtyPerCycle: 6_965,
    cycleTimeMs: 1_800_000,
  };

  it("reads the program's first day as its peak rate, not a constant multiple of the mean", () => {
    expect(peakRatePerHour(program)).toBeCloseTo(513_262 / 24, 0);
  });

  it('is well above the whole-program mean — the entire reason this function exists', () => {
    const mean = sustainedRatePerHour(program);
    const peak = peakRatePerHour(program);
    expect(peak).toBeGreaterThan(mean * 3);
    expect(peak).toBeLessThan(mean * 5);
  });

  it('is zero for a program with no whole cycle in it, matching sustainedRatePerHour', () => {
    const empty = { ...program, expiryTimeMs: program.installTimeMs };
    expect(peakRatePerHour(empty)).toBe(0);
  });

  it('never looks past its own expiry on a program shorter than a day', () => {
    const short = { ...program, expiryTimeMs: program.installTimeMs + 6 * 3_600_000 };
    expect(peakRatePerHour(short)).toBeCloseTo(sustainedRatePerHour(short), 6);
  });
});

describe('colonyThroughputCheck', () => {
  it("measures a built colony's own pins and production, not a hypothetical layout", () => {
    const colony = baseColony({
      pinLoad: {
        counts: { launchpad: 1, extractorControlUnit: 1, basic: 1 },
        extractorHeads: 1,
        load: { cpu: 0, powergrid: 0 },
        linkLoad: null,
        newLinkLoad: null,
        linkCount: 0,
        unknownTypeIds: [],
      },
      extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: 6_000 }],
      production: [{ schematicId: BACTERIA_SCHEMATIC_ID, count: 1 }],
    });
    const pins: PlanetPin[] = [
      extractorPin({
        pinId: 1,
        productTypeId: MICROORGANISMS,
        expiryTimeMs: INSTALL_MS + 14 * DAY_MS,
      }),
    ];

    const result = colonyThroughputCheck({
      colony,
      pins,
      pi,
      linkCapacityPerHour: null,
      bufferHours: 24,
    });

    expect(result.mean.flowPerHourM3).toBeCloseTo(37.6, 6);
    expect(result.mean.bufferM3).toBe(10_000);
    expect(result.mean.verdict).toBe('link-capacity-unknown');
    expect(result.mean.hoursToFull).toBeCloseTo(10_000 / 37.6, 6);
  });

  it('passes the mean-rate check and fails the peak-rate check on the same colony — the whole point', () => {
    const program: ExtractorYieldProgram = {
      pinId: 1,
      installTimeMs: INSTALL_MS,
      expiryTimeMs: INSTALL_MS + 14 * DAY_MS,
      qtyPerCycle: 6_965,
      cycleTimeMs: 1_800_000,
    };
    const meanRate = sustainedRatePerHour(program);
    const peakRate = peakRatePerHour(program);

    const colony = baseColony({
      pinLoad: {
        counts: { launchpad: 1, extractorControlUnit: 1 },
        extractorHeads: 1,
        load: { cpu: 0, powergrid: 0 },
        linkLoad: null,
        newLinkLoad: null,
        linkCount: 0,
        unknownTypeIds: [],
      },
      extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: meanRate }],
    });
    const pins: PlanetPin[] = [
      extractorPin({
        pinId: 1,
        productTypeId: MICROORGANISMS,
        qtyPerCycle: program.qtyPerCycle,
        cycleTimeSeconds: program.cycleTimeMs / 1000,
        installTimeMs: program.installTimeMs,
        expiryTimeMs: program.expiryTimeMs,
      }),
    ];

    const result = colonyThroughputCheck({
      colony,
      pins,
      pi,
      linkCapacityPerHour: null,
      bufferHours: 100,
    });

    expect(meanRate).toBeGreaterThan(0);
    expect(peakRate).toBeGreaterThan(meanRate);

    expect(result.mean.verdict).toBe('link-capacity-unknown');
    expect(result.mean.hoursToFull).toBeGreaterThan(100);

    expect(result.peak.verdict).toBe('buffer-overflow');
    expect(result.peak.hoursToFull).not.toBeNull();
    expect(result.peak.hoursToFull!).toBeLessThan(100);

    expect(result.peak.flowPerHourM3 / result.mean.flowPerHourM3).toBeCloseTo(
      peakRate / meanRate,
      6
    );
  });

  it('reports null hours to full for a colony that extracts and makes nothing', () => {
    const colony = baseColony({
      pinLoad: {
        counts: { launchpad: 1 },
        extractorHeads: 0,
        load: { cpu: 0, powergrid: 0 },
        linkLoad: null,
        newLinkLoad: null,
        linkCount: 0,
        unknownTypeIds: [],
      },
    });
    const result = colonyThroughputCheck({
      colony,
      pins: [],
      pi,
      linkCapacityPerHour: null,
      bufferHours: 24,
    });
    expect(result.mean.flowPerHourM3).toBe(0);
    expect(result.mean.hoursToFull).toBeNull();
    expect(result.peak.flowPerHourM3).toBe(0);
    expect(result.peak.hoursToFull).toBeNull();
  });
});

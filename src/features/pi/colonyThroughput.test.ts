import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { PlanetPin } from '@/esi/endpoints';
import { sustainedRatePerHour } from '@/engine/pi/extraction';
import type { ExtractorYieldProgram } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './advisorModel';
import { colonyThroughputCheck, peakRatePerHour } from './colonyThroughput';

// The real snapshot, same reasoning as pinBudget.test.ts: the volumes and
// schematic rates below are claims about the shipped recipe graph, so a
// hand-made stub would pin nothing.
const pi = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')) as PiData;

const MICROORGANISMS = 2073;
const BACTERIA = 2393;
const BACTERIA_SCHEMATIC_ID = pi.schematics[String(BACTERIA)].schematicId;
/** A Temperate Extractor Control Unit typeID, from the shipped payload. */
const ECU_TYPE_ID = 3068;

const DAY_MS = 86_400_000;
const INSTALL_MS = Date.parse('2026-09-01T00:00:00Z');

/**
 * A minimal, otherwise-empty `BuiltColonyAdvice`. Every field a caller does
 * not care about for a given test is filled with an inert value, so each test
 * only overrides what it is actually about.
 */
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
    production: [],
    linkCount: 0,
    hasUnverifiedExtractors: false,
    ...overrides,
  };
}

/** A single extractor pin, with or without a full install-time baseline. */
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
  /**
   * CCP's worked example, the same fixture `extraction.test.ts` pins to the
   * ICC's own reference generator: qty_per_cycle 6,965 on a 30-minute cycle,
   * run for 14 days. Day 1 banks 513,262 units (extraction.test.ts), so this
   * is 513,262 / 24 by an independent route — computed here off
   * `extractorCycleYields` inside the module under test, cross-checked
   * against the same literal `extraction.test.ts` already pins.
   */
  const program: ExtractorYieldProgram = {
    pinId: 1,
    installTimeMs: INSTALL_MS,
    expiryTimeMs: INSTALL_MS + 14 * DAY_MS,
    qtyPerCycle: 6_965,
    cycleTimeMs: 1_800_000,
  };

  it("reads the program's first day as its peak rate, not a constant multiple of the mean", () => {
    // 513,262 units over the first 24 hours (extraction.test.ts).
    expect(peakRatePerHour(program)).toBeCloseTo(513_262 / 24, 0);
  });

  it('is well above the whole-program mean — the entire reason this function exists', () => {
    const mean = sustainedRatePerHour(program);
    const peak = peakRatePerHour(program);
    // Not pinned to 3.7 or any other constant: the ticket this module answers
    // is explicit that the multiplier is an artifact of one program's
    // parameters, not a law. Just: day one runs well above the 14-day mean.
    expect(peak).toBeGreaterThan(mean * 3);
    expect(peak).toBeLessThan(mean * 5);
  });

  it('is zero for a program with no whole cycle in it, matching sustainedRatePerHour', () => {
    const empty = { ...program, expiryTimeMs: program.installTimeMs };
    expect(peakRatePerHour(empty)).toBe(0);
  });

  it('never looks past its own expiry on a program shorter than a day', () => {
    // A six-hour program has no 24-hour window to average; the peak is its
    // own (short) whole life, not a day it never lived.
    const short = { ...program, expiryTimeMs: program.installTimeMs + 6 * 3_600_000 };
    expect(peakRatePerHour(short)).toBeCloseTo(sustainedRatePerHour(short), 6);
  });
});

describe('colonyThroughputCheck', () => {
  it("measures a built colony's own pins and production, not a hypothetical layout", () => {
    // One extractor feeding exactly one Bacteria (Basic Industry Facility):
    // 6,000 Microorganisms an hour is exactly what one Basic factory eats
    // (pinBudget.test.ts's own worked ratio), and it outputs 40 Bacteria an
    // hour in return. Both legs cross a link, so both are in the flow.
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
        // No install-time baseline: a colony can be measured on its mean
        // (ESI's own `qty_per_cycle`/`cycle_time` were not both readable)
        // without a peak figure being available for it.
      }),
    ];

    const result = colonyThroughputCheck({
      colony,
      pins,
      pi,
      linkCapacityPerHour: null,
      bufferHours: 24,
    });

    // 6,000 x 0.005 m3 (Microorganisms) + 40 x 0.19 m3 (Bacteria) = 37.6 m3/hr.
    expect(result.mean.flowPerHourM3).toBeCloseTo(37.6, 6);
    // One Launchpad only: 10,000 m3.
    expect(result.mean.bufferM3).toBe(10_000);
    // No link capacity was supplied, so the buffer side (which passes) is
    // reported honestly rather than folded into a plain `ok`.
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
      // The colony's own measured mean, off the same program the peak below
      // is read from — so the two checks disagree only about which point on
      // one extractor's curve is worth planning against, never about which
      // extractor is running.
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

    // One bare Launchpad (10,000 m3), no Storage Facility. At the mean rate
    // (0.005 m3/unit) a hundred hours' flow is 2,790 m3 — comfortably inside.
    // At the peak rate the same hundred hours is ~10,693 m3 — past it. A
    // buffer check run at the mean would tell a pilot this colony is fine to
    // leave for four days; run at the peak, it overflows on day one.
    const result = colonyThroughputCheck({
      colony,
      pins,
      pi,
      linkCapacityPerHour: null,
      bufferHours: 100,
    });

    expect(meanRate).toBeGreaterThan(0);
    expect(peakRate).toBeGreaterThan(meanRate);

    // No link capacity supplied, so a passing buffer reads as
    // `link-capacity-unknown` rather than `ok` — never `buffer-overflow`,
    // which is the distinction this test is actually about.
    expect(result.mean.verdict).toBe('link-capacity-unknown');
    expect(result.mean.hoursToFull).toBeGreaterThan(100);

    expect(result.peak.verdict).toBe('buffer-overflow');
    expect(result.peak.hoursToFull).not.toBeNull();
    expect(result.peak.hoursToFull!).toBeLessThan(100);

    // And the two flows disagree by exactly the peak/mean ratio measured
    // above, since nothing else about the colony changed between them.
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

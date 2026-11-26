import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { colonyEarnings, type ColonyEarningsOptions } from './colonyEarnings';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const BACTERIA = 2393;
const TEST_CULTURES = 2319;
const UNKNOWN_TYPE_ID = 999_999_999;

function options(overrides: Partial<ColonyEarningsOptions> = {}): ColonyEarningsOptions {
  return {
    saleableOutputPerHour: new Map(),
    prices: {},
    taxRate: 0.1,
    salesTaxPct: 0,
    ...overrides,
  };
}

describe('colonyEarnings', () => {
  it('prices an extraction-only colony on its own extracted P0', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[MICROORGANISMS, 21_201]]),
        prices: { [MICROORGANISMS]: 5 },
      }),
      pi
    );
    expect(result.iskPerHour).toBeCloseTo(21_201 * 4.5);
    expect(result.unpriced).toEqual([]);
  });

  it('prices a P1 colony on its made tier, at the P1 customs base', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[BACTERIA, 40]]),
        prices: { [BACTERIA]: 1_000 },
      }),
      pi
    );
    expect(result.iskPerHour).toBeCloseTo(40 * 960);
    expect(result.unpriced).toEqual([]);
  });

  it('prices a P2 colony on its made tier, at the P2 customs base', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[TEST_CULTURES, 3]]),
        prices: { [TEST_CULTURES]: 100_000 },
      }),
      pi
    );
    expect(result.iskPerHour).toBeCloseTo(3 * 99_280);
    expect(result.unpriced).toEqual([]);
  });

  it('reports a type the hub does not quote in unpriced, without dragging the total down', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([
          [BACTERIA, 40],
          [TEST_CULTURES, 3],
        ]),
        prices: { [BACTERIA]: 1_000 },
      }),
      pi
    );
    expect(result.unpriced).toEqual([TEST_CULTURES]);
    expect(result.iskPerHour).toBeCloseTo(40 * 960);
  });

  it('returns null, not zero, for a colony with no measured extraction', () => {
    const result = colonyEarnings(options({ saleableOutputPerHour: new Map() }), pi);
    expect(result.iskPerHour).toBeNull();
    expect(result.unpriced).toEqual([]);
  });

  it('returns null for a colony whose only entries are at or below a zero rate', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[MICROORGANISMS, 0]]),
        prices: { [MICROORGANISMS]: 5 },
      }),
      pi
    );
    expect(result.iskPerHour).toBeNull();
  });

  it('falls back to prices at the whole-book level, never mixing books per type', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[BACTERIA, 40]]),
        prices: { [BACTERIA]: 1_000 },
        revenuePrices: { [TEST_CULTURES]: 100_000 },
      }),
      pi
    );
    expect(result.unpriced).toEqual([BACTERIA]);
    expect(result.iskPerHour).toBeNull();
  });

  it('prefers revenuePrices over prices when both quote a type', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[BACTERIA, 40]]),
        prices: { [BACTERIA]: 1_000 },
        revenuePrices: { [BACTERIA]: 2_000 },
      }),
      pi
    );
    expect(result.iskPerHour).toBeCloseTo(40 * 1_960);
  });

  it('reports a typeID the payload knows as neither a P0 resource nor a schematic as unpriced, rather than throwing', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[UNKNOWN_TYPE_ID, 10]]),
        prices: { [UNKNOWN_TYPE_ID]: 500 },
      }),
      pi
    );
    expect(result.unpriced).toEqual([UNKNOWN_TYPE_ID]);
    expect(result.iskPerHour).toBeNull();
  });

  it('does not clamp a true negative total — ore priced under its own customs base', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[MICROORGANISMS, 100]]),
        prices: { [MICROORGANISMS]: 1 },
        taxRate: 1,
      }),
      pi
    );
    expect(result.iskPerHour).toBeCloseTo(-400);
  });

  it('nets sales tax off the price before charging customs', () => {
    const result = colonyEarnings(
      options({
        saleableOutputPerHour: new Map([[BACTERIA, 40]]),
        prices: { [BACTERIA]: 1_000 },
        salesTaxPct: 7.5,
      }),
      pi
    );
    expect(result.iskPerHour).toBeCloseTo(40 * 885);
  });
});

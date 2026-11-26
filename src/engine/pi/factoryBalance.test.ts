import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { factoryBalance } from './factoryBalance';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BASE_METALS = 2267;
const BACTERIA = 2393;
const WATER = 3645;
const REACTIVE_METALS = 2398;
const TEST_CULTURES = 2319;
const WATER_COOLED_CPU = 2328;

describe('factoryBalance', () => {
  it('measures a colony whose factories outnumber what its extractor can feed', () => {
    const balance = factoryBalance(
      {
        running: [{ typeId: BACTERIA, pins: 8 }],
        extractedPerHour: new Map([[MICROORGANISMS, 21_201]]),
      },
      pi
    );

    expect(balance).toHaveLength(1);
    const bacteria = balance[0];
    expect(bacteria.status).toBe('measured');
    if (bacteria.status !== 'measured') throw new Error('unreachable');
    expect(bacteria.pins).toBe(8);
    expect(bacteria.demandPerHour).toEqual([
      { typeId: MICROORGANISMS, name: 'Microorganisms', unitsPerHour: 48_000 },
    ]);
    expect(bacteria.feedablePins).toBeCloseTo(3.5335, 4);
    expect(bacteria.fedPins).toBe(4);
    expect(bacteria.surplusPins).toBe(4);
  });

  it('reports a colony in balance as having nothing to remove', () => {
    const [balance] = factoryBalance(
      {
        running: [{ typeId: BACTERIA, pins: 4 }],
        extractedPerHour: new Map([[MICROORGANISMS, 21_201]]),
      },
      pi
    );
    expect(balance.status).toBe('measured');
    if (balance.status !== 'measured') throw new Error('unreachable');
    expect(balance.surplusPins).toBe(0);
  });

  it('never reports a negative surplus on a colony that is short of factories', () => {
    const [balance] = factoryBalance(
      {
        running: [{ typeId: BACTERIA, pins: 2 }],
        extractedPerHour: new Map([[MICROORGANISMS, 21_201]]),
      },
      pi
    );
    if (balance.status !== 'measured') throw new Error('unreachable');
    expect(balance.surplusPins).toBe(0);
    expect(balance.fedPins).toBe(2);
  });

  it('feeds a higher tier from the factories below it on the same colony', () => {
    const balance = factoryBalance(
      {
        running: [
          { typeId: BACTERIA, pins: 4 },
          { typeId: WATER, pins: 4 },
          { typeId: TEST_CULTURES, pins: 2 },
        ],
        extractedPerHour: new Map([
          [MICROORGANISMS, 24_000],
          [AQUEOUS_LIQUIDS, 24_000],
        ]),
      },
      pi
    );
    const cultures = balance.find((line) => line.typeId === TEST_CULTURES);
    if (cultures?.status !== 'measured') throw new Error('unreachable');
    expect(cultures.feedablePins).toBeCloseTo(4, 6);
    expect(cultures.surplusPins).toBe(0);
  });

  it('says a factory’s input is imported rather than calling the colony starved', () => {
    const balance = factoryBalance(
      {
        running: [
          { typeId: BACTERIA, pins: 4 },
          { typeId: TEST_CULTURES, pins: 2 },
        ],
        extractedPerHour: new Map([[MICROORGANISMS, 24_000]]),
      },
      pi
    );
    const cultures = balance.find((line) => line.typeId === TEST_CULTURES);
    expect(cultures?.status).toBe('inputs-not-local');
    if (cultures?.status !== 'inputs-not-local') throw new Error('unreachable');
    expect(cultures.missing).toEqual([{ typeId: WATER, name: 'Water' }]);
  });

  it('says so when a colony has factories but no measured extraction at all', () => {
    const [balance] = factoryBalance(
      { running: [{ typeId: BACTERIA, pins: 8 }], extractedPerHour: new Map() },
      pi
    );
    expect(balance.status).toBe('inputs-not-local');
  });

  it('ignores a pin whose schematic the payload does not know', () => {
    const balance = factoryBalance(
      {
        running: [
          { typeId: BACTERIA, pins: 4 },
          { typeId: 999_999, pins: 2 },
        ],
        extractedPerHour: new Map([[MICROORGANISMS, 24_000]]),
      },
      pi
    );
    expect(balance.map((line) => line.typeId)).toEqual([BACTERIA]);
  });

  it('splits one input between two schematics that both eat it', () => {
    const balance = factoryBalance(
      {
        running: [
          { typeId: WATER, pins: 2 },
          { typeId: BACTERIA, pins: 4 },
          { typeId: REACTIVE_METALS, pins: 4 },
          { typeId: TEST_CULTURES, pins: 2 },
          { typeId: WATER_COOLED_CPU, pins: 2 },
        ],
        extractedPerHour: new Map([
          [AQUEOUS_LIQUIDS, 12_000],
          [MICROORGANISMS, 24_000],
          [BASE_METALS, 24_000],
        ]),
      },
      pi
    );
    for (const typeId of [TEST_CULTURES, WATER_COOLED_CPU]) {
      const line = balance.find((entry) => entry.typeId === typeId);
      if (line?.status !== 'measured') throw new Error('unreachable');
      expect(line.feedablePins).toBeCloseTo(1, 6);
      expect(line.surplusPins).toBe(1);
    }
  });
});

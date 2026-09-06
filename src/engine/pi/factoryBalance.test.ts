import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { factoryBalance } from './factoryBalance';

// The shipped payload, same reasoning as the sibling engine tests: these
// numbers are claims about the real schematic set, so a stub would pin nothing.
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** P0 */
const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BASE_METALS = 2267;
/** P1 */
const BACTERIA = 2393;
const WATER = 3645;
const REACTIVE_METALS = 2398;
/** P2, made from Bacteria and Water. */
const TEST_CULTURES = 2319;
/** P2, made from Reactive Metals and Water — so it competes with Test Cultures for one input. */
const WATER_COOLED_CPU = 2328;

describe('factoryBalance', () => {
  it('measures a colony whose factories outnumber what its extractor can feed', () => {
    // The reported colony: eight Basic Industry Facilities on Bacteria, fed by
    // one Extractor Control Unit sustaining 21,201 Microorganisms an hour off
    // its own decay curve. One factory eats 3,000 per 1,800 s cycle — 6,000 an
    // hour — so the extractor keeps 3.53 of them fed and the other four run
    // dry. Nothing on the tab said so, and those four hold 3,200 MW on a
    // colony whose powergrid is the reason nothing else fits.
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
    // Four pins, not three: 3.53 rounds up to the count that clears the whole
    // program, and simulating CCP's curve against this colony's own buffer
    // confirms four process 100% of what is extracted where three leave
    // 153,635 units behind.
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
    // Two pins against enough ore for three and a half is a colony leaving
    // material in the ground — a real state, and the opposite of this
    // function's subject. It must read as zero to remove, not as minus two.
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
    // A two-tier colony: four Basic making Bacteria and four making Water,
    // both feeding two Advanced making Test Cultures. The P2's supply is not
    // extracted, it is made here — 4 x 40/hr of each P1 — and one Advanced
    // eats 40 of each an hour, so four are feedable and two are built.
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
    // Test Cultures with no Water made or extracted here is a colony routing
    // Water in from a sibling planet — which is the whole point of a network —
    // not a colony running dry. Claiming a surplus here would tell a pilot to
    // delete the factories their imports feed.
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
    // An extractor whose program carries no install-time baseline reports no
    // rate (`advisorModel`'s `ratePerHour: null`), so its resource is absent
    // from the map rather than zero. Zero would read as "these factories are
    // all surplus" and advise deleting a working colony.
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
    // Test Cultures and Water-Cooled CPU both want Water, and this colony
    // makes 80/hr of it against 160/hr of demand. Letting each schematic see
    // the whole supply would call both fully fed and the colony would starve;
    // the supply is shared in proportion to what each asked for, so each gets
    // 40/hr and keeps one of its two Advanced pins running.
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

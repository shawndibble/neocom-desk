import { describe, it, expect } from 'vitest';
import {
  pinRole,
  extractorProgramsFromPins,
  hasUnverifiedExtractors,
  factorySchematicId,
  groupFactoryPins,
  colonyPinLoad,
} from './adapters';
import type { PlanetPin } from '@/esi/endpoints';
import { piFixture } from '@/sde/__fixtures__/pi';

const extractorHeads = [{ head_id: 1, latitude: 0, longitude: 0 }];

describe('pinRole', () => {
  it('identifies an extractor pin', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    expect(pinRole(pin)).toBe('extractor');
  });

  it('identifies a factory pin', () => {
    const pin: PlanetPin = {
      pin_id: 2,
      type_id: 101,
      latitude: 0,
      longitude: 0,
      factory_details: { schematic_id: 5 },
    };
    expect(pinRole(pin)).toBe('factory');
  });

  it('falls back to other for storage/command-center pins', () => {
    const pin: PlanetPin = { pin_id: 3, type_id: 102, latitude: 0, longitude: 0 };
    expect(pinRole(pin)).toBe('other');
  });

  // Live ESI (2026) puts the running schematic on the pin's own top-level
  // `schematic_id`, not inside `factory_details` — `factory_details` was
  // observed absent even for an Industry Facility mid-cycle. Both shapes must
  // resolve to 'factory' since which one ESI sends isn't ours to assume.
  it('identifies a factory pin from a top-level schematic_id with no factory_details', () => {
    const pin: PlanetPin = {
      pin_id: 4,
      type_id: 2481,
      latitude: 0,
      longitude: 0,
      schematic_id: 131,
    };
    expect(pinRole(pin)).toBe('factory');
  });
});

describe('factorySchematicId', () => {
  it('reads the nested factory_details.schematic_id when present', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 101,
      latitude: 0,
      longitude: 0,
      factory_details: { schematic_id: 5 },
    };
    expect(factorySchematicId(pin)).toBe(5);
  });

  it('falls back to the top-level schematic_id when factory_details is absent', () => {
    const pin: PlanetPin = {
      pin_id: 4,
      type_id: 2481,
      latitude: 0,
      longitude: 0,
      schematic_id: 131,
    };
    expect(factorySchematicId(pin)).toBe(131);
  });

  it('is undefined for a pin with neither', () => {
    const pin: PlanetPin = { pin_id: 3, type_id: 102, latitude: 0, longitude: 0 };
    expect(factorySchematicId(pin)).toBeUndefined();
  });
});

describe('extractorProgramsFromPins', () => {
  it('converts an extractor pin with a valid expiry_time', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([
      { pinId: 1, expiryTimeMs: Date.parse('2026-09-05T00:00:00Z') },
    ]);
  });

  it('populates the install-time yield baseline, converting cycle_time seconds to ms', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      install_time: '2026-08-22T00:00:00Z',
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads, cycle_time: 1800, qty_per_cycle: 6965 },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([
      {
        pinId: 1,
        expiryTimeMs: Date.parse('2026-09-05T00:00:00Z'),
        installTimeMs: Date.parse('2026-08-22T00:00:00Z'),
        cycleTimeMs: 1_800_000,
        qtyPerCycle: 6965,
      },
    ]);
  });

  it('still includes a pin with a valid expiry but no yield baseline, so colony health is unaffected', () => {
    // ESI marks qty_per_cycle/cycle_time/install_time all optional. Dropping
    // such a pin here would silently remove it from colonyStatus, letting an
    // idle colony read as healthy.
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads },
    };
    const [program] = extractorProgramsFromPins([pin]);
    expect(program).toEqual({ pinId: 1, expiryTimeMs: Date.parse('2026-09-05T00:00:00Z') });
    expect(program.qtyPerCycle).toBeUndefined();
    expect(program.cycleTimeMs).toBeUndefined();
    expect(program.installTimeMs).toBeUndefined();
  });

  it('leaves installTimeMs undefined for an unparseable install_time rather than producing NaN', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      install_time: 'not-a-date',
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads, cycle_time: 1800, qty_per_cycle: 6965 },
    };
    expect(extractorProgramsFromPins([pin])[0].installTimeMs).toBeUndefined();
  });

  it('excludes a pin with no extractor_details (spec-legal: heads is the only required key elsewhere)', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
    };
    expect(extractorProgramsFromPins([pin])).toEqual([]);
  });

  it('excludes an extractor pin missing expiry_time rather than substituting a default', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([]);
  });

  it('excludes a pin with an unparseable expiry_time rather than producing NaN', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: 'not-a-date',
      extractor_details: { heads: extractorHeads },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([]);
  });
});

describe('groupFactoryPins', () => {
  // `factory_details: {}` (no nested `schematic_id`, despite the field being
  // typed required) is how ESI has been observed to send a factory pin
  // whose schematic isn't resolvable — the same "live ESI ignores its own
  // documented shape" precedent `pinRole`'s top-level `schematic_id` fallback
  // exists for. Cast past the type since it's declared required in the
  // normal case.
  const factory = (id: number, schematicId?: number): PlanetPin => ({
    pin_id: id,
    type_id: 2481,
    latitude: 0,
    longitude: 0,
    factory_details:
      schematicId !== undefined
        ? { schematic_id: schematicId }
        : ({} as PlanetPin['factory_details']),
  });

  it('collapses two pins running the same schematic into one group with count 2', () => {
    expect(groupFactoryPins([factory(1, 5), factory(2, 5)])).toEqual([
      { schematicId: 5, count: 2 },
    ]);
  });

  it('keeps distinct schematics as separate groups in first-appearance order', () => {
    expect(groupFactoryPins([factory(1, 7), factory(2, 5), factory(3, 7)])).toEqual([
      { schematicId: 7, count: 2 },
      { schematicId: 5, count: 1 },
    ]);
  });

  it('groups pins with no resolvable schematic id together under undefined, not dropped', () => {
    expect(groupFactoryPins([factory(1), factory(2, 5), factory(3)])).toEqual([
      { schematicId: undefined, count: 2 },
      { schematicId: 5, count: 1 },
    ]);
  });

  it('excludes extractor and other-role pins entirely', () => {
    const extractor: PlanetPin = {
      pin_id: 9,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    const other: PlanetPin = { pin_id: 10, type_id: 102, latitude: 0, longitude: 0 };
    expect(groupFactoryPins([extractor, other, factory(1, 5)])).toEqual([
      { schematicId: 5, count: 1 },
    ]);
  });

  it('excludes a pin with extractor_details even if it also carries a stray top-level schematic_id', () => {
    // pinRole gives extractor_details priority over schematic_id (see pinRole
    // above) — this group must agree, or such a pin would silently vanish
    // from both the extraction and production reads.
    const oddPin: PlanetPin = {
      pin_id: 11,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
      schematic_id: 5,
    };
    expect(groupFactoryPins([oddPin])).toEqual([]);
  });

  it('returns an empty array for pins with no factories', () => {
    const other: PlanetPin = { pin_id: 1, type_id: 102, latitude: 0, longitude: 0 };
    expect(groupFactoryPins([other])).toEqual([]);
  });
});

describe('hasUnverifiedExtractors', () => {
  it('is false when every extractor pin has a valid program', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads },
    };
    expect(hasUnverifiedExtractors([pin])).toBe(false);
  });

  it('is false for a colony with no extractor pins at all', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      factory_details: { schematic_id: 5 },
    };
    expect(hasUnverifiedExtractors([pin])).toBe(false);
  });

  it('is true when an extractor pin is missing expiry_time — a status computed from the rest would overclaim confidence', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    expect(hasUnverifiedExtractors([pin])).toBe(true);
  });
});

describe('colonyPinLoad', () => {
  const pi = piFixture();
  const head = (id: number) => ({ head_id: id, latitude: 0, longitude: 0 });
  const pin = (pin_id: number, type_id: number, extra: Partial<PlanetPin> = {}): PlanetPin => ({
    pin_id,
    type_id,
    latitude: 0,
    longitude: 0,
    ...extra,
  });

  it('counts a live colony’s own pins by kind, and its heads one by one', () => {
    // Two Temperate extractors with 10 and 3 heads, one Basic and one
    // Advanced facility, and a launchpad.
    const result = colonyPinLoad(
      [
        pin(1, 3068, { extractor_details: { heads: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(head) } }),
        pin(2, 3068, { extractor_details: { heads: [1, 2, 3].map(head) } }),
        pin(3, 2481, { factory_details: { schematic_id: 133 } }),
        pin(4, 2480, { factory_details: { schematic_id: 65 } }),
        pin(5, 2256),
      ],
      pi
    );
    expect(result.counts).toEqual({
      extractorControlUnit: 2,
      basic: 1,
      advanced: 1,
      launchpad: 1,
    });
    expect(result.extractorHeads).toBe(13);
    expect(result.unknownTypeIds).toEqual([]);
    // 2 ECUs + 13 heads + basic + advanced + launchpad.
    expect(result.load).toEqual({
      cpu: 2 * 400 + 13 * 110 + 200 + 500 + 3_600,
      powergrid: 2 * 2_600 + 13 * 550 + 800 + 700 + 700,
    });
  });

  it('names a pin it cannot classify instead of dropping it silently', () => {
    // A Command Center is a real pin ESI reports and deliberately not a kind:
    // it supplies the budget rather than drawing on it. A typeID the payload
    // has never heard of lands here too, and either way the caller can say
    // the meter is incomplete rather than showing it as measured.
    const result = colonyPinLoad([pin(1, 2254), pin(2, 999_999), pin(3, 2256)], pi);
    expect(result.counts).toEqual({ launchpad: 1 });
    expect(result.unknownTypeIds).toEqual([2254, 999999]);
  });

  it('charges no heads for an extractor pin ESI sent without any', () => {
    const result = colonyPinLoad([pin(1, 3068)], pi);
    expect(result.extractorHeads).toBe(0);
    expect(result.load).toEqual({ cpu: 400, powergrid: 2_600 });
  });
});

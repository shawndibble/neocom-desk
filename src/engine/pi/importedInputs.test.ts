import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { importedInputs } from './importedInputs';

// The shipped payload: these figures are claims about the real schematic set.
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
/** Schematic ids: Bacteria (from Microorganisms), Water (from Aqueous Liquids), Test Cultures (from both). */
const BACTERIA = 131;
const WATER = 121;
const TEST_CULTURES = 86;

const factory = (pinId: number, schematicId: number): PlanetPin => ({
  pin_id: pinId,
  type_id: 1,
  latitude: 0,
  longitude: 0,
  factory_details: { schematic_id: schematicId },
});
const extractor = (pinId: number, productTypeId?: number): PlanetPin => ({
  pin_id: pinId,
  type_id: 2,
  latitude: 0,
  longitude: 0,
  extractor_details: {
    heads: [],
    ...(productTypeId === undefined ? {} : { product_type_id: productTypeId }),
  },
});

describe('importedInputs', () => {
  it('says how much of an input nothing on the colony makes the factories eat per day', () => {
    // One Bacteria factory eats 3,000 Microorganisms per 1,800 s cycle: 48 cycles a day.
    const [line, ...rest] = importedInputs([factory(1, BACTERIA)], pi);
    expect(rest).toEqual([]);
    expect(line).toEqual({
      typeId: MICROORGANISMS,
      name: 'Microorganisms',
      unitsPerDay: 144_000,
      m3PerDay: 720,
      factories: 1,
    });
  });

  it('scales by the factories running the schematic', () => {
    const [line] = importedInputs(
      Array.from({ length: 8 }, (_, i) => factory(i, BACTERIA)),
      pi
    );
    expect(line).toMatchObject({ unitsPerDay: 1_152_000, factories: 8 });
  });

  it('gives no line for an input the colony extracts, even when the extractor’s rate is unknown', () => {
    expect(importedInputs([factory(1, BACTERIA), extractor(2, MICROORGANISMS)], pi)).toEqual([]);
  });

  it('gives no line for an input another factory on the colony makes', () => {
    const lines = importedInputs(
      [factory(1, TEST_CULTURES), factory(2, BACTERIA), factory(3, WATER)],
      pi
    );
    expect(lines.map((line) => line.typeId).sort()).toEqual([MICROORGANISMS, AQUEOUS_LIQUIDS]);
  });

  it('sums factories that share one imported input and orders the lines by m³ a day', () => {
    // Bacteria and Water each draw 144,000 a day of different P0s; Test Cultures draws two
    // imported P1s (40 per 3,600 s cycle = 960 a day each), far fewer m³ than the P0s.
    const lines = importedInputs(
      [factory(1, BACTERIA), factory(2, BACTERIA), factory(3, WATER), factory(4, TEST_CULTURES)],
      pi
    );
    expect(lines.map((line) => [line.typeId, line.factories])).toEqual([
      [MICROORGANISMS, 2],
      [AQUEOUS_LIQUIDS, 1],
    ]);
  });

  it('skips a factory with no schematic or one the data does not know', () => {
    const idle: PlanetPin = {
      pin_id: 9,
      type_id: 1,
      latitude: 0,
      longitude: 0,
      factory_details: {} as never,
    };
    expect(importedInputs([idle, factory(1, 999_999)], pi)).toEqual([]);
  });

  it('is empty for a colony with no factories', () => {
    expect(importedInputs([extractor(1, MICROORGANISMS)], pi)).toEqual([]);
  });
});

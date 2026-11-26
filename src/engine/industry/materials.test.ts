import { describe, it, expect } from 'vitest';
import {
  materialModifier,
  effectiveMaterialQuantity,
  effectiveMaterials,
} from '@/engine/industry/materials';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { FacilityContext, IndustryBlueprint } from '@/engine/industry/types';

const npc: FacilityContext = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
};
const raitaruT1Hi: FacilityContext = {
  facility: FACILITY_PRESETS.raitaru,
  rigFit: ['meT1', 'none', 'none'],
  security: 'highsec',
};

describe('materialModifier', () => {
  it('is 1 with ME0 at an NPC station', () => {
    expect(materialModifier(0, npc)).toBe(1);
  });

  it('applies ME as (1 - ME/100)', () => {
    expect(materialModifier(10, npc)).toBeCloseTo(0.9, 12);
  });

  it('stacks structure and rig bonuses multiplicatively', () => {
    expect(materialModifier(10, raitaruT1Hi)).toBeCloseTo(0.87318, 12);
  });

  it('scales rig bonus by security band', () => {
    const lowsec: FacilityContext = { ...raitaruT1Hi, security: 'lowsec' };
    expect(materialModifier(0, lowsec)).toBeCloseTo(0.99 * 0.962, 12);
    const nullT2: FacilityContext = {
      facility: FACILITY_PRESETS.sotiyo,
      rigFit: ['meT2', 'none', 'none'],
      security: 'nullsec',
    };
    expect(materialModifier(0, nullT2)).toBeCloseTo(0.99 * 0.9496, 12);
  });

  it('ignores rigs at NPC stations', () => {
    const npcRigged: FacilityContext = { ...npc, rigFit: ['meT2', 'none', 'none'] };
    expect(materialModifier(10, npcRigged)).toBeCloseTo(0.9, 12);
  });

  it('a TE-only rig fit contributes nothing to the material bonus', () => {
    const teOnly: FacilityContext = {
      facility: FACILITY_PRESETS.raitaru,
      rigFit: ['teT2', 'none', 'none'],
      security: 'highsec',
    };
    expect(materialModifier(0, teOnly)).toBeCloseTo(0.99, 12);
  });

  it('scales reactor rig bonus by the reaction security table, not the manufacturing one', () => {
    const tataraT2Null: FacilityContext = {
      facility: FACILITY_PRESETS.tatara,
      rigFit: ['meT2', 'none', 'none'],
      security: 'nullsec',
    };
    expect(materialModifier(0, tataraT2Null)).toBeCloseTo(0.9736, 12);
  });

  it('leaves reactor rig bonus unscaled in lowsec (reaction table is 1x there)', () => {
    const athanorT1Low: FacilityContext = {
      facility: FACILITY_PRESETS.athanor,
      rigFit: ['meT1', 'none', 'none'],
      security: 'lowsec',
    };
    expect(materialModifier(0, athanorT1Low)).toBeCloseTo(0.98, 12);
  });

  it('rejects ME outside 0..10', () => {
    expect(() => materialModifier(-1, npc)).toThrow(RangeError);
    expect(() => materialModifier(11, npc)).toThrow(RangeError);
    expect(() => materialModifier(2.5, npc)).toThrow(RangeError);
  });
});

describe('effectiveMaterialQuantity', () => {
  it('is base quantity with no bonuses', () => {
    expect(effectiveMaterialQuantity(100, 1, 1)).toBe(100);
    expect(effectiveMaterialQuantity(100, 3, 1)).toBe(300);
  });

  it('rounds the job total up (34 * 0.9 = 30.6 -> 31)', () => {
    expect(effectiveMaterialQuantity(34, 1, 0.9)).toBe(31);
  });

  it('rounds per job, not per run', () => {
    expect(effectiveMaterialQuantity(34, 1, 0.9)).toBe(31);
    expect(effectiveMaterialQuantity(34, 10, 0.9)).toBe(306);
  });

  it('never returns less than one unit per run (qty-1 materials get no ME saving)', () => {
    expect(effectiveMaterialQuantity(1, 1, 0.9)).toBe(1);
    expect(effectiveMaterialQuantity(1, 10, 0.9)).toBe(10);
    expect(effectiveMaterialQuantity(1, 7, 0.5)).toBe(7);
  });

  it('rounds to 2 decimals before applying ceil', () => {
    expect(effectiveMaterialQuantity(211, 1, 0.891)).toBe(188);
    expect(effectiveMaterialQuantity(2500, 1, 0.87318)).toBe(2183);
  });

  it('rejects invalid runs', () => {
    expect(() => effectiveMaterialQuantity(10, 0, 1)).toThrow(RangeError);
    expect(() => effectiveMaterialQuantity(10, 1.5, 1)).toThrow(RangeError);
  });
});

describe('effectiveMaterials', () => {
  const bp: IndustryBlueprint = {
    name: 'Test Item',
    time: 600,
    materials: [
      { typeID: 34, quantity: 2500 },
      { typeID: 35, quantity: 1 },
    ],
    products: [{ typeID: 999, quantity: 1 }],
  };

  it('maps every blueprint material with base and effective quantities', () => {
    const out = effectiveMaterials(bp, 1, 10, raitaruT1Hi);
    expect(out).toEqual([
      { typeID: 34, baseQuantity: 2500, quantity: 2183 },
      { typeID: 35, baseQuantity: 1, quantity: 1 },
    ]);
  });

  it('applies per-job rounding across runs, with the per-run floor', () => {
    const out = effectiveMaterials(bp, 10, 10, npc);
    expect(out).toEqual([
      { typeID: 34, baseQuantity: 25000, quantity: 22500 },
      { typeID: 35, baseQuantity: 10, quantity: 10 },
    ]);
  });
});

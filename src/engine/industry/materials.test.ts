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
  rig: 'none',
  security: 'highsec',
};
const raitaruT1Hi: FacilityContext = {
  facility: FACILITY_PRESETS.raitaru,
  rig: 't1',
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
    // 0.9 * 0.99 (Raitaru 1%) * 0.98 (T1 rig 2% hisec) = 0.87318
    expect(materialModifier(10, raitaruT1Hi)).toBeCloseTo(0.87318, 12);
  });

  it('scales rig bonus by security band', () => {
    // T1 rig lowsec: 2% * 1.9 = 3.8% -> 0.962 rig factor
    const lowsec: FacilityContext = { ...raitaruT1Hi, security: 'lowsec' };
    expect(materialModifier(0, lowsec)).toBeCloseTo(0.99 * 0.962, 12);
    // T2 rig nullsec: 2.4% * 2.1 = 5.04% -> 0.9496 rig factor
    const nullT2: FacilityContext = {
      facility: FACILITY_PRESETS.sotiyo,
      rig: 't2',
      security: 'nullsec',
    };
    expect(materialModifier(0, nullT2)).toBeCloseTo(0.99 * 0.9496, 12);
  });

  it('ignores rigs at NPC stations', () => {
    const npcRigged: FacilityContext = { ...npc, rig: 't2' };
    expect(materialModifier(10, npcRigged)).toBeCloseTo(0.9, 12);
  });

  it('scales reactor rig bonus by the reaction security table, not the manufacturing one', () => {
    // Tatara T2 rig nullsec: 2.4% * 1.1 (reaction table) = 2.64% -> 0.9736,
    // vs. manufacturing's 2.4% * 2.1 = 5.04% -> 0.9496 for the same rig level.
    const tataraT2Null: FacilityContext = {
      facility: FACILITY_PRESETS.tatara,
      rig: 't2',
      security: 'nullsec',
    };
    expect(materialModifier(0, tataraT2Null)).toBeCloseTo(0.9736, 12);
  });

  it('leaves reactor rig bonus unscaled in lowsec (reaction table is 1x there)', () => {
    const athanorT1Low: FacilityContext = {
      facility: FACILITY_PRESETS.athanor,
      rig: 't1',
      security: 'lowsec',
    };
    // 2% * 1 (reaction lowsec multiplier) = 2% -> 0.98
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
    // qty 34 at ME10: 30.6/run -> 31 for one run, but 306 (not 310) for ten
    expect(effectiveMaterialQuantity(34, 1, 0.9)).toBe(31);
    expect(effectiveMaterialQuantity(34, 10, 0.9)).toBe(306);
  });

  it('never returns less than one unit per run (qty-1 materials get no ME saving)', () => {
    expect(effectiveMaterialQuantity(1, 1, 0.9)).toBe(1);
    expect(effectiveMaterialQuantity(1, 10, 0.9)).toBe(10);
    expect(effectiveMaterialQuantity(1, 7, 0.5)).toBe(7);
  });

  it('rounds to 2 decimals before applying ceil', () => {
    // 211 * 0.891 = 188.001 -> round2 = 188.00 -> ceil = 188 (not 189)
    expect(effectiveMaterialQuantity(211, 1, 0.891)).toBe(188);
    // 2500 * 0.87318 = 2182.95 -> 2183
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
      { typeID: 35, baseQuantity: 10, quantity: 10 }, // qty-1: floored at 1/run
    ]);
  });
});

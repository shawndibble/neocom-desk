import { describe, expect, it } from 'vitest';
import { brokerFee } from '@/engine/industry/fees';
import { orderFloor } from './orderFloor';
import { impliedOwnerPct, listingNet, structureBrokerPct } from './structureFee';

describe('structureBrokerPct', () => {
  it('adds the owner rate to the 0.5% SCC surcharge', () => {
    expect(structureBrokerPct(2)).toBe(2.5);
    expect(structureBrokerPct(0)).toBe(0.5);
  });
  it('rejects negative or non-finite owner rates', () => {
    expect(() => structureBrokerPct(-1)).toThrow(RangeError);
    expect(() => structureBrokerPct(Number.NaN)).toThrow(RangeError);
  });
});

describe('impliedOwnerPct', () => {
  it('round-trips a fee paid at a structure', () => {
    const fee = 2_640_000 * 0.025;
    expect(impliedOwnerPct(fee, 2_200, 1_200)).toBeCloseTo(2, 5);
  });
  it('is null when it cannot be derived', () => {
    expect(impliedOwnerPct(0, 100, 10)).toBeNull();
    expect(impliedOwnerPct(1, 100, 10)).toBeNull(); // below the SCC surcharge
    expect(impliedOwnerPct(10, 0, 10)).toBeNull();
  });
});

describe('listingNet', () => {
  const gross = 1_200 * 2_300;
  it('is lower at a structure fee than at NPC rules', () => {
    const npc = listingNet({ gross, accountingLevel: 5, brokerPct: 1.5 });
    const structure = listingNet({ gross, accountingLevel: 5, brokerPct: structureBrokerPct(2) });
    expect(structure).toBeLessThan(npc);
    expect(npc - structure).toBeCloseTo(gross / 100, 2);
  });
  it('applies the 100 ISK minimum', () => {
    expect(listingNet({ gross: 1_000, accountingLevel: 0, brokerPct: 1 })).toBeCloseTo(
      1_000 - 75 - 100,
      5
    );
  });
  it('matches the NPC fee function at an NPC rate', () => {
    expect(listingNet({ gross, accountingLevel: 0, brokerPct: 3 })).toBeCloseTo(
      gross * (1 - 0.075) - brokerFee(gross, 0),
      2
    );
  });
});

describe('orderFloor with a structure fee', () => {
  const base = {
    unitCost: 1_000,
    remainingQuantity: 100,
    accountingLevel: 5,
    brokerRelationsLevel: 5,
    advancedBrokerRelationsLevel: 0,
  };
  it('raises the relist floor but leaves fill untouched', () => {
    const npc = orderFloor(base)!;
    const structure = orderFloor({ ...base, structureBrokerPct: 5 })!;
    expect(structure.relist).toBeGreaterThan(npc.relist);
    expect(structure.fill).toBe(npc.fill);
  });
  it('treats an explicit 0.5% (owner 0) as a structure, not as unset', () => {
    const structure = orderFloor({ ...base, structureBrokerPct: 0.5 })!;
    expect(structure.relist).not.toBe(orderFloor(base)!.relist);
  });
});

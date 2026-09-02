import { describe, it, expect } from 'vitest';
import { materialCostLines, normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import type { EffectiveMaterial, HubPrices } from '@/engine/industry/types';

const tritanium: EffectiveMaterial = { typeID: 34, baseQuantity: 1000, quantity: 900 };
const pyerite: EffectiveMaterial = { typeID: 35, baseQuantity: 400, quantity: 360 };
const hubPrices: HubPrices = { 34: 5, 35: 12 };

describe('materialCostLines', () => {
  it('prices every unit at the hub when there is no sourcing map', () => {
    expect(materialCostLines([tritanium, pyerite], hubPrices)).toEqual([
      {
        typeID: 34,
        baseQuantity: 1000,
        quantity: 900,
        ownedQuantity: 0,
        remainingQuantity: 900,
        unitPrice: 5,
        lineCost: 4500,
        unpriced: false,
      },
      {
        typeID: 35,
        baseQuantity: 400,
        quantity: 360,
        ownedQuantity: 0,
        remainingQuantity: 360,
        unitPrice: 12,
        lineCost: 4320,
        unpriced: false,
      },
    ]);
  });

  it('flags a material with no hub price and nothing owned as unpriced', () => {
    const [line] = materialCostLines([tritanium], {});
    expect(line.unitPrice).toBeNull();
    expect(line.lineCost).toBe(0);
    expect(line.unpriced).toBe(true);
  });

  it('a fully owned material costs nothing and is never unpriced, even with no hub price', () => {
    const [line] = materialCostLines([tritanium], {}, { 34: { ownedQuantity: 900 } });
    expect(line).toEqual({
      typeID: 34,
      baseQuantity: 1000,
      quantity: 900,
      ownedQuantity: 900,
      remainingQuantity: 0,
      unitPrice: null,
      lineCost: 0,
      unpriced: false,
    });
  });

  it('prices only the remainder when a material is partially owned', () => {
    const [line] = materialCostLines([tritanium], hubPrices, { 34: { ownedQuantity: 400 } });
    expect(line.remainingQuantity).toBe(500);
    expect(line.lineCost).toBe(2500);
    expect(line.unpriced).toBe(false);
  });

  it('uses the override price for the remainder in place of the hub price', () => {
    const [line] = materialCostLines([tritanium], hubPrices, {
      34: { ownedQuantity: 400, overridePrice: 7 },
    });
    expect(line.unitPrice).toBe(7);
    expect(line.lineCost).toBe(3500);
  });

  it('an override alone prices a material the hub has no listing for', () => {
    const [line] = materialCostLines([tritanium], {}, { 34: { overridePrice: 9 } });
    expect(line.ownedQuantity).toBe(0);
    expect(line.unitPrice).toBe(9);
    expect(line.lineCost).toBe(8100);
    expect(line.unpriced).toBe(false);
  });

  it('an override price of zero is honoured, not treated as absent', () => {
    const [line] = materialCostLines([tritanium], hubPrices, { 34: { overridePrice: 0 } });
    expect(line.unitPrice).toBe(0);
    expect(line.lineCost).toBe(0);
    expect(line.unpriced).toBe(false);
  });

  it('clamps an owned quantity larger than the job needs, silently', () => {
    const [line] = materialCostLines([tritanium], hubPrices, { 34: { ownedQuantity: 5000 } });
    expect(line.ownedQuantity).toBe(900);
    expect(line.remainingQuantity).toBe(0);
    expect(line.lineCost).toBe(0);
  });

  it('treats negative or non-finite sourcing values as absent', () => {
    const [line] = materialCostLines([tritanium], hubPrices, {
      34: { ownedQuantity: -50, overridePrice: Number.NaN },
    });
    expect(line.ownedQuantity).toBe(0);
    expect(line.unitPrice).toBe(5);
    expect(line.lineCost).toBe(4500);
  });

  it('floors a fractional owned quantity — materials come in whole units', () => {
    const [line] = materialCostLines([tritanium], hubPrices, { 34: { ownedQuantity: 400.7 } });
    expect(line.ownedQuantity).toBe(400);
    expect(line.remainingQuantity).toBe(500);
    expect(line.lineCost).toBe(2500);
  });

  it('ignores sourcing entries for materials the job does not use', () => {
    const lines = materialCostLines([tritanium], hubPrices, { 999: { ownedQuantity: 10 } });
    expect(lines).toHaveLength(1);
    expect(lines[0].ownedQuantity).toBe(0);
  });
});

describe('normalizeMaterialSourcingMap', () => {
  it('returns undefined for an absent or empty map', () => {
    expect(normalizeMaterialSourcingMap(undefined)).toBeUndefined();
    expect(normalizeMaterialSourcingMap({})).toBeUndefined();
  });

  it('drops undefined members so the entry never carries an undefined value', () => {
    const map = normalizeMaterialSourcingMap({
      34: { ownedQuantity: 5, overridePrice: undefined },
    });
    expect(map).toEqual({ 34: { ownedQuantity: 5 } });
    expect('overridePrice' in (map?.[34] ?? {})).toBe(false);
  });

  it('drops entries that carry nothing, and the whole map when none survive', () => {
    expect(normalizeMaterialSourcingMap({ 34: {}, 35: { overridePrice: 3 } })).toEqual({
      35: { overridePrice: 3 },
    });
    expect(
      normalizeMaterialSourcingMap({ 34: { ownedQuantity: undefined, overridePrice: undefined } })
    ).toBeUndefined();
  });

  it('drops values that are not usable numbers', () => {
    expect(
      normalizeMaterialSourcingMap({ 34: { ownedQuantity: -1, overridePrice: Number.NaN } })
    ).toBeUndefined();
  });

  it('keeps zero, which is a meaningful override price', () => {
    expect(normalizeMaterialSourcingMap({ 34: { overridePrice: 0 } })).toEqual({
      34: { overridePrice: 0 },
    });
  });
});

import { describe, expect, it } from 'vitest';
import { GAS_DECOMPRESSION_YIELD, compareGasRoute, compressGasLines } from './compressedGas';
import { shoppingListText } from './shoppingList';
import type { MaterialCostLine } from './types';

const RAW = 30370;
const COMPRESSED = 62399;
const MAP = { [RAW]: COMPRESSED };

function line(typeID: number, remainingQuantity: number): MaterialCostLine {
  return {
    typeID,
    quantity: remainingQuantity,
    ownedQuantity: 0,
    remainingQuantity,
    unitPrice: null,
    lineCost: 0,
    unpriced: false,
  } as unknown as MaterialCostLine;
}

describe('compressGasLines', () => {
  it('swaps a raw gas line for enough compressed units to decompress to the need', () => {
    const [swapped] = compressGasLines([line(RAW, 800)], MAP, 0.8);
    expect(swapped?.typeID).toBe(COMPRESSED);
    expect(swapped?.remainingQuantity).toBe(1000);
  });

  it('rounds up, never short of the raw quantity', () => {
    const [swapped] = compressGasLines([line(RAW, 801)], MAP, 0.8);
    expect(swapped?.remainingQuantity).toBe(1002);
  });

  it('is not tripped by float error when the division is exact', () => {
    const [swapped] = compressGasLines([line(RAW, 12)], MAP, 0.8);
    expect(swapped?.remainingQuantity).toBe(15);
  });

  it('leaves non-gas lines and fully owned gas untouched', () => {
    const lines = [line(34, 500), line(RAW, 0)];
    const out = compressGasLines(lines, MAP, GAS_DECOMPRESSION_YIELD);
    expect(out.map((m) => [m.typeID, m.remainingQuantity])).toEqual([
      [34, 500],
      [RAW, 0],
    ]);
  });

  it('feeds the multibuy text with compressed names', () => {
    const text = shoppingListText(compressGasLines([line(RAW, 800)], MAP, 0.8), (id) =>
      id === COMPRESSED ? 'Compressed Fullerite-C50' : 'x'
    );
    expect(text).toBe('Compressed Fullerite-C50\t1000');
  });
});

describe('compareGasRoute', () => {
  const prices = { [RAW]: 7000, [COMPRESSED]: 8000 };
  const volumes = { [RAW]: 1, [COMPRESSED]: 0.1 };

  it('compares cost, cost per raw unit and hauled volume', () => {
    const r = compareGasRoute([line(RAW, 800)], MAP, 0.8, prices, volumes);
    expect(r).toEqual({
      rawUnits: 800,
      compressedUnits: 1000,
      pricedRawUnits: 800,
      rawCost: 5_600_000,
      compressedCost: 8_000_000,
      rawVolume: 800,
      compressedVolume: 100,
      priced: true,
    });
  });

  it('is unpriced, not free, when a price is missing', () => {
    const r = compareGasRoute([line(RAW, 800)], MAP, 0.8, { [RAW]: 7000 }, volumes);
    expect(r?.priced).toBe(false);
    expect(r?.pricedRawUnits).toBe(0);
  });

  it('is null when the list has no gas', () => {
    expect(compareGasRoute([line(34, 5)], MAP, 0.8, prices, volumes)).toBeNull();
  });
});

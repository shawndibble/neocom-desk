import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaterialCostLine } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import { useShoppingListCopy } from './useShoppingListCopy';

const write = vi.hoisted(() => vi.fn());
vi.mock('@/lib/clipboard', () => ({ writeToClipboard: write }));
vi.mock('@/sde/loadSde', () => ({
  loadCompressedGasTypeIds: () => Promise.resolve({ 30370: 62399 }),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () => Promise.resolve(new Map([[62399, 'Compressed Fullerite-C50']])),
  loadTypeVolumes: () =>
    Promise.resolve(
      new Map([
        [30370, 1],
        [62399, 0.1],
      ])
    ),
}));
vi.mock('@/market/prices', () => ({
  getHubPrices: () =>
    Promise.resolve(
      new Map([
        [30370, { sellMin: 7000 }],
        [62399, { sellMin: 8000 }],
      ])
    ),
}));

const hub = { id: 'jita' } as TradeHub;
const catalog = {
  typesById: { '30370': { name: 'Fullerite-C50' }, '34': { name: 'Tritanium' } },
} as unknown as BlueprintCatalog;
const materials = [
  { typeID: 30370, remainingQuantity: 800 },
  { typeID: 34, remainingQuantity: 5 },
] as unknown as MaterialCostLine[];

describe('useShoppingListCopy compressed gas', () => {
  beforeEach(() => write.mockReset());

  it('copies raw names by default and compressed names, sized for yield, when toggled', async () => {
    const { result } = renderHook(() => useShoppingListCopy(true, materials, catalog, hub));
    await waitFor(() => expect(result.current.hasGas).toBe(true));

    await act(() => result.current.copyShoppingList());
    expect(write).toHaveBeenLastCalledWith('Fullerite-C50\t800\nTritanium\t5');

    act(() => result.current.setCompressedGas(true));
    await act(() => result.current.copyShoppingList());
    expect(write).toHaveBeenLastCalledWith('Compressed Fullerite-C50\t1000\nTritanium\t5');
    await waitFor(() => expect(result.current.gasComparison?.compressedVolume).toBe(100));
  });

  it('drops the comparison for old quantities while the new requirement loads', async () => {
    const { result, rerender } = renderHook(
      ({ list }) => useShoppingListCopy(true, list, catalog, hub),
      { initialProps: { list: materials } }
    );
    await waitFor(() => expect(result.current.hasGas).toBe(true));
    act(() => result.current.setCompressedGas(true));
    await waitFor(() => expect(result.current.gasComparison?.compressedVolume).toBe(100));

    rerender({
      list: [
        { typeID: 30370, remainingQuantity: 1600 },
        { typeID: 34, remainingQuantity: 5 },
      ] as unknown as MaterialCostLine[],
    });
    expect(result.current.gasComparison).toBeNull();
    await waitFor(() => expect(result.current.gasComparison?.compressedVolume).toBe(200));
  });
});

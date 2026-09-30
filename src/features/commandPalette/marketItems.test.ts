import { describe, it, expect, vi } from 'vitest';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import type { PaletteResult } from './types';
import {
  buildMarketItemIndex,
  createMarketItemCatalogue,
  createMarketItemsProvider,
  searchMarketItems,
} from './marketItems';

const CATALOGUE: MarketTypeEntry[] = [
  { typeId: 1, name: 'Tritanium Bar', marketGroupId: 1 },
  { typeId: 2, name: 'Compressed Tritanium', marketGroupId: 1 },
  { typeId: 3, name: 'Tritanium', marketGroupId: 1 },
  { typeId: 4, name: 'Pyerite', marketGroupId: 1 },
  { typeId: 5, name: 'Atritanium Widget', marketGroupId: 1 },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ids = (results: readonly { typeId: number }[]) => results.map((entry) => entry.typeId);
const signal = new AbortController().signal;

describe('searchMarketItems', () => {
  const index = buildMarketItemIndex(CATALOGUE);

  it('ranks exact, then prefix, then substring, alphabetical within each, case-insensitively', () => {
    expect(ids(searchMarketItems(index, 'TRITANIUM', 10))).toEqual([3, 1, 5, 2]);
  });

  it('caps its answer', () => {
    expect(ids(searchMarketItems(index, 'tritanium', 2))).toEqual([3, 1]);
  });

  it('matches nothing for a query no name contains', () => {
    expect(searchMarketItems(index, 'veldspar', 10)).toEqual([]);
  });
});

describe('createMarketItemCatalogue', () => {
  it('loads once, keeps the index for the session, and peeks it synchronously once ready', async () => {
    const load = vi.fn(async () => CATALOGUE);
    const catalogue = createMarketItemCatalogue(load);
    expect(catalogue.peek()).toBeNull();
    const [first, second] = await Promise.all([catalogue.load(), catalogue.load()]);
    expect(first).toBe(second);
    expect(catalogue.peek()).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed load failed until a retry is asked for', async () => {
    const load = vi
      .fn<() => Promise<MarketTypeEntry[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(CATALOGUE);
    const catalogue = createMarketItemCatalogue(load);
    await expect(catalogue.load()).rejects.toThrow('offline');
    expect(catalogue.peek()).toBeNull();
    // Another keystroke: no refetch.
    await expect(catalogue.load()).rejects.toThrow('offline');
    expect(load).toHaveBeenCalledTimes(1);
    // The next opening retries.
    await expect(catalogue.load({ retry: true })).resolves.toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a retry on a healthy catalogue does not refetch', async () => {
    const load = vi.fn(async () => CATALOGUE);
    const catalogue = createMarketItemCatalogue(load);
    await catalogue.load();
    await catalogue.load({ retry: true });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('createMarketItemsProvider', () => {
  it('is not searched below three characters', () => {
    const provider = createMarketItemsProvider({
      catalogue: createMarketItemCatalogue(async () => CATALOGUE),
      onSelect: () => {},
    });
    expect(provider.minQueryLength).toBe(3);
  });

  it('answers late from a cold catalogue that resolves late', async () => {
    const pending = deferred<MarketTypeEntry[]>();
    const provider = createMarketItemsProvider({
      catalogue: createMarketItemCatalogue(() => pending.promise),
      onSelect: () => {},
    });
    const answer = provider.search('pyer', signal);
    expect(answer).toHaveProperty('then');
    pending.resolve(CATALOGUE);
    const results = (await answer) as readonly PaletteResult[];
    expect(results.map((result) => [result.id, result.label])).toEqual([['4', 'Pyerite']]);
  });

  it('answers synchronously once the catalogue is warm', async () => {
    const catalogue = createMarketItemCatalogue(async () => CATALOGUE);
    await catalogue.load();
    const provider = createMarketItemsProvider({ catalogue, onSelect: () => {} });
    const answer = provider.search('pyer', signal) as readonly PaletteResult[];
    expect(Array.isArray(answer)).toBe(true);
    expect(answer.map((result) => result.label)).toEqual(['Pyerite']);
  });

  it('rejects when the catalogue fails to load', async () => {
    const provider = createMarketItemsProvider({
      catalogue: createMarketItemCatalogue(async () => {
        throw new Error('offline');
      }),
      onSelect: () => {},
    });
    await expect(provider.search('pyer', signal)).rejects.toThrow('offline');
  });

  it('selecting a result hands over the type', async () => {
    const onSelect = vi.fn();
    const catalogue = createMarketItemCatalogue(async () => CATALOGUE);
    await catalogue.load();
    const provider = createMarketItemsProvider({ catalogue, onSelect });
    const [result] = provider.search('pyer', signal) as readonly PaletteResult[];
    result.run();
    expect(onSelect).toHaveBeenCalledWith({ typeId: 4, name: 'Pyerite' });
  });
});

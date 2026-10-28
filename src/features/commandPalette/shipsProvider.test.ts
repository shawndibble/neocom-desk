import { describe, it, expect, vi } from 'vitest';
import { SHIP_TREE } from '@/features/fittings/shipTree/__fixtures__/shipTreeFixture';
import { searchHulls } from '@/features/fittings/shipTree/shipTreeModel';
import { createShipsProvider, type ShipsProviderOptions } from './shipsProvider';
import { GROUP_LIMIT, type PaletteResult } from './types';

const signal = new AbortController().signal;

function provider(overrides: Partial<ShipsProviderOptions> = {}) {
  return createShipsProvider({
    loadShipTree: () => Promise.resolve(SHIP_TREE),
    onOpen: vi.fn(),
    ...overrides,
  });
}

const search = async (p: ReturnType<typeof provider>, query: string) =>
  await p.search(query, signal);

describe('createShipsProvider', () => {
  it('matches by hull name in the same order as searchHulls, capped', async () => {
    const results = await search(provider(), 'e');
    const expected = searchHulls(SHIP_TREE.ships, 'e')
      .slice(0, GROUP_LIMIT)
      .map((ship) => ship.name);
    expect(results.map((r) => r.label)).toEqual(expected);
    expect(results.length).toBeGreaterThan(1);
  });

  it('labels a row with its class and faction', async () => {
    const [row] = await search(provider(), 'tengu');
    expect(row.label).toBe('Tengu');
    expect(row.sublabel).toBe('Strategic Cruiser · Caldari State');
    expect(row.hint).toBeUndefined();
  });

  it('sits above Market Items and needs two characters', () => {
    const p = provider();
    expect(p.id).toBe('ships');
    expect(p.labelKey).toBe('commandPalette.groups.ships');
    expect(p.order).toBeGreaterThan(6);
    expect(p.order).toBeLessThan(8);
    expect(p.minQueryLength).toBe(2);
  });

  it('opens the hull by type id', async () => {
    const onOpen = vi.fn();
    const [row] = await search(provider({ onOpen }), 'tengu');
    row.run();
    expect(onOpen).toHaveBeenCalledWith(29984);
  });

  it('retries a failed load on the next keystroke', async () => {
    const load = vi
      .fn<() => Promise<typeof SHIP_TREE>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(SHIP_TREE);
    const p = provider({ loadShipTree: load });
    await expect(search(p, 'te')).rejects.toThrow('offline');
    expect((await search(p, 'ten')).map((r) => r.label)).toContain('Tengu');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('answers synchronously once loaded', async () => {
    const p = provider();
    await search(p, 'te');
    const answer = p.search('ten', signal);
    expect(Array.isArray(answer)).toBe(true);
    expect((answer as readonly PaletteResult[]).map((r) => r.label)).toContain('Tengu');
  });
});

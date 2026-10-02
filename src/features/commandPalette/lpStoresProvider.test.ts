import { describe, it, expect, vi } from 'vitest';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { createLpStoresProvider, type LpStoresProviderOptions } from './lpStoresProvider';
import { GROUP_LIMIT, type PaletteResult } from './types';

const signal = new AbortController().signal;

const CORPS: LpCorporationEntry[] = [
  { id: 1000130, name: 'Sisters of EVE' },
  { id: 1000035, name: 'Caldari Navy', factionId: 500001 },
  { id: 1000180, name: 'State Protectorate', factionId: 500001 },
];

function provider(overrides: Partial<LpStoresProviderOptions> = {}) {
  return createLpStoresProvider({
    loadCorporations: () => Promise.resolve(CORPS),
    loadBalances: () => Promise.resolve(new Map()),
    navigate: vi.fn(),
    balanceHint: (lp) => `${lp} LP`,
    ...overrides,
  });
}

async function search(p: ReturnType<typeof provider>, query: string) {
  return await p.search(query, signal);
}

describe('createLpStoresProvider', () => {
  it('finds "Sisters of EVE" for "sisters" and opens its LP Store', async () => {
    const navigate = vi.fn();
    const p = provider({ navigate });
    const results = await search(p, 'sisters');
    expect(results.map((r) => r.label)).toEqual(['Sisters of EVE']);
    results[0].run();
    expect(navigate).toHaveBeenCalledWith('/market/lp-store/1000130');
  });

  it('is its own group after the synchronous ones, and needs a typed query', () => {
    const p = provider();
    expect(p.id).toBe('lp-stores');
    expect(p.labelKey).toBe('commandPalette.groups.lpStores');
    expect(p.order).toBeGreaterThan(2);
    expect(p.minQueryLength).toBeGreaterThanOrEqual(1);
  });

  it('answers asynchronously, so a slow snapshot never holds up typing or other groups', () => {
    const p = provider({ loadCorporations: () => new Promise<LpCorporationEntry[]>(() => {}) });
    const answer = p.search('sisters', signal);
    expect(Array.isArray(answer)).toBe(false);
    expect(typeof (answer as PromiseLike<unknown>).then).toBe('function');
  });

  it('answers synchronously once the list is loaded, so later keystrokes never flash a spinner', async () => {
    const p = provider();
    await search(p, 'si');
    const answer = p.search('sis', signal);
    expect(Array.isArray(answer)).toBe(true);
    expect((answer as readonly PaletteResult[]).map((r) => r.label)).toEqual(['Sisters of EVE']);
  });

  it('shows the LP balance only for a corp the active Character holds LP with', async () => {
    const p = provider({
      loadBalances: () =>
        Promise.resolve(
          new Map([
            [1000035, 12_500],
            [1000180, 0],
          ])
        ),
    });
    const results = await search(p, 'r');
    const hints = Object.fromEntries(results.map((r) => [r.label, r.hint]));
    expect(hints).toEqual({
      'Caldari Navy': '12500 LP',
      'State Protectorate': undefined,
      'Sisters of EVE': undefined,
    });
  });

  it('reads the snapshot and balances once per provider, not per keystroke', async () => {
    const loadCorporations = vi.fn(() => Promise.resolve(CORPS));
    const loadBalances = vi.fn(() => Promise.resolve(new Map<number, number>()));
    const p = provider({ loadCorporations, loadBalances });
    await search(p, 's');
    await search(p, 'si');
    await search(p, 'sis');
    expect(loadBalances).toHaveBeenCalledTimes(1);
    // The provider holds the list itself, whatever the loader caches.
    expect(loadCorporations).toHaveBeenCalledTimes(1);
  });

  it('still lists stores when the balances cannot be read', async () => {
    const p = provider({ loadBalances: () => Promise.reject(new Error('no cache')) });
    const results = await search(p, 'sisters');
    expect(results.map((r) => [r.label, r.hint])).toEqual([['Sisters of EVE', undefined]]);
  });

  it('retries the snapshot after a failed load', async () => {
    const loadCorporations = vi
      .fn<() => Promise<LpCorporationEntry[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(CORPS);
    const p = provider({ loadCorporations });
    await expect(search(p, 'sisters')).rejects.toThrow('offline');
    expect((await search(p, 'sisters')).map((r) => r.label)).toEqual(['Sisters of EVE']);
  });

  it('caps its answer at the group limit', async () => {
    const many = Array.from({ length: GROUP_LIMIT + 4 }, (_, i) => ({
      id: 2000000 + i,
      name: `Corp ${i}`,
    }));
    const p = provider({ loadCorporations: () => Promise.resolve(many) });
    expect(await search(p, 'corp')).toHaveLength(GROUP_LIMIT);
  });
});

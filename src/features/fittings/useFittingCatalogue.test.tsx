import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const sde = vi.hoisted(() => ({
  loadTypes: vi.fn(),
  loadFittingSlots: vi.fn(),
  loadMarketTypes: vi.fn(),
  loadMarketGroups: vi.fn(),
  loadVariations: vi.fn(),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: sde.loadTypes,
  loadFittingSlots: sde.loadFittingSlots,
}));
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: sde.loadMarketTypes,
  loadMarketGroups: sde.loadMarketGroups,
  loadVariations: sde.loadVariations,
}));

import {
  resetFittingCatalogueStatusForTests,
  retryFittingCatalogue,
  useFittingCatalogue,
  useFittingCatalogueFailed,
} from './useFittingCatalogue';

function loadsFine() {
  sde.loadTypes.mockResolvedValue({ '587': { name: 'Rifter', groupID: 25, volume: 27289 } });
  sde.loadFittingSlots.mockResolvedValue({});
  sde.loadMarketTypes.mockResolvedValue([]);
  sde.loadMarketGroups.mockResolvedValue([]);
  sde.loadVariations.mockResolvedValue({});
}

function useBoth() {
  return { catalogue: useFittingCatalogue(), failed: useFittingCatalogueFailed() };
}

describe('useFittingCatalogue sharing', () => {
  beforeEach(() => {
    resetFittingCatalogueStatusForTests();
    loadsFine();
  });
  afterEach(() => vi.clearAllMocks());

  it('builds once for two instances and hands both the same object', async () => {
    const a = renderHook(useFittingCatalogue);
    const b = renderHook(useFittingCatalogue);
    await waitFor(() => expect(a.result.current).not.toBeNull());
    await waitFor(() => expect(b.result.current).not.toBeNull());
    expect(b.result.current).toBe(a.result.current);
    expect(sde.loadTypes).toHaveBeenCalledTimes(1);
    expect(sde.loadMarketTypes).toHaveBeenCalledTimes(1);
  });

  it('gives a later mount the catalogue on its first render without loading again', async () => {
    const a = renderHook(useFittingCatalogue);
    await waitFor(() => expect(a.result.current).not.toBeNull());
    const late = renderHook(useFittingCatalogue);
    expect(late.result.current).toBe(a.result.current);
    expect(sde.loadTypes).toHaveBeenCalledTimes(1);
  });
});

describe('useFittingCatalogue failure', () => {
  beforeEach(() => {
    resetFittingCatalogueStatusForTests();
    loadsFine();
    sde.loadMarketTypes.mockRejectedValue(new TypeError('Failed to fetch'));
  });
  afterEach(() => vi.clearAllMocks());

  it('reports failed instead of staying in a silent null', async () => {
    const { result } = renderHook(useBoth);
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.catalogue).toBeNull();
  });

  it('loads again on a retry', async () => {
    const { result } = renderHook(useBoth);
    await waitFor(() => expect(result.current.failed).toBe(true));

    loadsFine();
    act(() => retryFittingCatalogue());

    await waitFor(() => expect(result.current.catalogue).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });

  it('loads again by itself when the connection returns', async () => {
    const { result } = renderHook(useBoth);
    await waitFor(() => expect(result.current.failed).toBe(true));

    loadsFine();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.catalogue).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });
});

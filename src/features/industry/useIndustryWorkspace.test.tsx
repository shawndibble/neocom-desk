import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlueprintCatalog } from './blueprintCatalog';
import { resetRouteSnapshots } from '@/lib/routeSnapshotCache';
import { useActiveCharacter } from '@/stores/activeCharacter';

const loadBlueprintCatalog = vi.fn();
const loadCharacterBlueprints = vi.fn();
const loadCharacterModifiers = vi.fn();
const loadPi = vi.fn();

vi.mock('./blueprintCatalog', () => ({ loadBlueprintCatalog: () => loadBlueprintCatalog() }));
vi.mock('./data', () => ({ loadCharacterBlueprints: (id: number) => loadCharacterBlueprints(id) }));
vi.mock('@/features/character/characterModifiers', () => ({
  loadCharacterModifiers: (...args: unknown[]) => loadCharacterModifiers(...args),
}));
vi.mock('@/sde/loadSde', () => ({ loadPi: () => loadPi() }));

// The hook's other inputs are their own modules' business; stable stubs keep this to the loads.
const hydrate = vi.fn(async () => {});
const setValue = vi.fn();
vi.mock('./facilityDefaults', () => ({
  hydrateActivityFacilityDefaults: async () => {},
  useFacilityDefaults: (select: (s: { value: object }) => unknown) => select({ value: {} }),
}));
vi.mock('./reactionFacilityDefaults', () => ({
  useReactionFacilityDefaults: (select: (s: { value: object }) => unknown) => select({ value: {} }),
}));
vi.mock('./useDetectedOwnedStock', () => ({ useOwnedStockSnapshot: () => ({}) }));
vi.mock('./corpOwnedStock', () => ({ useCorpOwnedStockSource: () => ({}) }));
vi.mock('./buildPlanPricingInputs', () => ({ useBuildPlanPricingInputs: () => ({}) }));
// Selector-callable like a zustand hook, plus the getState/subscribe `useHydratedStore` reads.
const { settingStub } = vi.hoisted(() => ({
  settingStub: (state: () => object) =>
    Object.assign((select: (s: object) => unknown) => select(state()), {
      getState: state,
      subscribe: () => () => {},
    }),
}));
vi.mock('./assumedTe', () => ({
  useAssumedTe: settingStub(() => ({ value: 0, hydrated: true, hydrate })),
}));
vi.mock('./buildGroups', () => ({
  useBuildGroups: settingStub(() => ({ value: {}, hydrated: true, hydrate, setValue })),
}));

import { useIndustryWorkspace } from './useIndustryWorkspace';

const CATALOG = { byBlueprintTypeID: new Map() } as unknown as BlueprintCatalog;
const OWNED = [{ item_id: 1, type_id: 638 }];
const MODIFIERS = { skills: { 3380: 5 } };

beforeEach(() => {
  resetRouteSnapshots();
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
  loadBlueprintCatalog.mockReset().mockResolvedValue(CATALOG);
  loadPi.mockReset().mockResolvedValue(null);
  loadCharacterBlueprints
    .mockReset()
    .mockResolvedValue({ cached: { data: OWNED }, needsReauth: false });
  loadCharacterModifiers.mockReset().mockResolvedValue(MODIFIERS);
});

describe('useIndustryWorkspace', () => {
  it('loads the catalog, owned blueprints and modifiers', async () => {
    const { result } = renderHook(() => useIndustryWorkspace());
    await waitFor(() => expect(result.current.catalog).toBe(CATALOG));
    await waitFor(() => expect(result.current.ownedBlueprints).toEqual(OWNED));
    expect(result.current.modifiers).toBe(MODIFIERS);
    expect(result.current.catalogFailed).toBe(false);
  });

  it('keeps the catalog hidden until the Character’s own reads have landed, so nothing prices with no skills', async () => {
    let release: (value: unknown) => void = () => {};
    loadCharacterModifiers.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useIndustryWorkspace());
    // Let the catalog resolve and the pending reads settle as far as they can.
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadBlueprintCatalog).toHaveBeenCalled();
    expect(result.current.catalog).toBeNull();
    expect(result.current.catalogFailed).toBe(false);

    await act(async () => release(MODIFIERS));
    await waitFor(() => expect(result.current.catalog).toBe(CATALOG));
    expect(result.current.modifiers).toBe(MODIFIERS);
    expect(result.current.ownedBlueprints).toEqual(OWNED);
  });

  it('flags a failed catalog without discarding the Character’s blueprints and skills', async () => {
    loadBlueprintCatalog.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useIndustryWorkspace());
    await waitFor(() => expect(result.current.catalogFailed).toBe(true));
    await waitFor(() => expect(result.current.ownedBlueprints).toEqual(OWNED));
    expect(result.current.modifiers).toBe(MODIFIERS);
    expect(result.current.catalog).toBeNull();
  });

  it('loads the catalog on retry', async () => {
    loadBlueprintCatalog.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useIndustryWorkspace());
    await waitFor(() => expect(result.current.catalogFailed).toBe(true));
    act(() => result.current.retryCatalog());
    await waitFor(() => expect(result.current.catalog).toBe(CATALOG));
    expect(result.current.catalogFailed).toBe(false);
  });

  it('retries a failed catalog by itself when the connection returns', async () => {
    loadBlueprintCatalog.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useIndustryWorkspace());
    await waitFor(() => expect(result.current.catalogFailed).toBe(true));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.catalog).toBe(CATALOG));
  });

  it('keeps the skills when the owned-blueprint read fails, and the other way round', async () => {
    loadCharacterBlueprints.mockRejectedValue(new Error('boom'));
    const first = renderHook(() => useIndustryWorkspace());
    await waitFor(() => expect(first.result.current.modifiers).toBe(MODIFIERS));
    expect(first.result.current.ownedBlueprints).toEqual([]);
    expect(first.result.current.catalog).toBe(CATALOG);
    first.unmount();

    resetRouteSnapshots();
    loadCharacterBlueprints.mockResolvedValue({ cached: { data: OWNED }, needsReauth: false });
    loadCharacterModifiers.mockRejectedValue(new Error('boom'));
    const second = renderHook(() => useIndustryWorkspace());
    await waitFor(() => expect(second.result.current.ownedBlueprints).toEqual(OWNED));
    expect(second.result.current.catalog).toBe(CATALOG);
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';

const loadBlueprintCatalog = vi.fn();
vi.mock('@/features/industry/blueprintCatalog', () => ({
  loadBlueprintCatalog: () => loadBlueprintCatalog(),
}));
vi.mock('./useQuickbar', () => ({
  useQuickbar: () => ({ available: false, items: [], add: vi.fn() }),
}));

import { usePageItemActions } from './usePageItemActions';

beforeEach(() => loadBlueprintCatalog.mockReset());

describe('usePageItemActions requestBlueprints', () => {
  it('asks again after a failed load instead of staying on "No blueprint options"', async () => {
    const catalog = { byBlueprintTypeID: new Map() } as unknown as BlueprintCatalog;
    loadBlueprintCatalog.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(catalog);
    const { result } = renderHook(() =>
      usePageItemActions({ activeCharacterId: 1, lazyBlueprints: true })
    );

    act(() => result.current.actions.requestBlueprints());
    await waitFor(() => expect(loadBlueprintCatalog).toHaveBeenCalledTimes(1));
    // Let the rejection land, then open another menu.
    await act(async () => {});
    act(() => result.current.actions.requestBlueprints());

    await waitFor(() => expect(result.current.actions.blueprints).toBe(catalog));
    expect(loadBlueprintCatalog).toHaveBeenCalledTimes(2);
  });

  it('does not reload once the catalog loaded', async () => {
    const catalog = { byBlueprintTypeID: new Map() } as unknown as BlueprintCatalog;
    loadBlueprintCatalog.mockResolvedValue(catalog);
    const { result } = renderHook(() =>
      usePageItemActions({ activeCharacterId: 1, lazyBlueprints: true })
    );
    act(() => result.current.actions.requestBlueprints());
    await waitFor(() => expect(result.current.actions.blueprints).toBe(catalog));
    act(() => result.current.actions.requestBlueprints());
    expect(loadBlueprintCatalog).toHaveBeenCalledTimes(1);
  });
});

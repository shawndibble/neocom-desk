import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { OwnedStockSnapshot } from './ownedStockDetection';

const SNAPSHOT: OwnedStockSnapshot = {
  sources: [
    {
      characterId: 91,
      assets: [
        {
          item_id: 1,
          type_id: 34,
          quantity: 5000,
          location_id: 60003760,
          location_type: 'station',
          location_flag: 'Hangar',
          is_singleton: false,
        },
      ],
    },
  ],
  characterNames: new Map([[91, 'Main Pilot']]),
  incompleteCharacters: [],
};

vi.mock('./ownedStockDetection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ownedStockDetection')>()),
  loadOwnedStockSnapshot: () => Promise.resolve(SNAPSHOT),
  resolveStockLocationNames: () => Promise.resolve(new Map([[60003760, 'Jita IV - Moon 4']])),
}));

const { useDetectedOwnedStock } = await import('./useDetectedOwnedStock');

const TYPE_IDS = [34, 35];

describe('useDetectedOwnedStock', () => {
  it('counts the loaded assets against the plan material set and names the locations', async () => {
    const { result } = renderHook(() => useDetectedOwnedStock(TYPE_IDS));

    await waitFor(() => expect(result.current.stock.get(34)?.quantity).toBe(5000));
    await waitFor(() =>
      expect(result.current.locationNames.get(60003760)).toBe('Jita IV - Moon 4')
    );
    expect(result.current.characterNames.get(91)).toBe('Main Pilot');
  });

  it('does not recount while the material set holds still', async () => {
    // Asset lists run to tens of thousands of rows per Character, and this hook
    // lives in a panel that re-renders on every runs/ME/TE keystroke — so the
    // caller passing a stable array has to be enough to avoid re-aggregating.
    const { result, rerender } = renderHook(({ ids }) => useDetectedOwnedStock(ids), {
      initialProps: { ids: TYPE_IDS },
    });
    await waitFor(() => expect(result.current.stock.size).toBe(1));
    const first = result.current.stock;

    rerender({ ids: TYPE_IDS });

    expect(result.current.stock).toBe(first);
  });

  it('recounts when the material set actually changes', async () => {
    const { result, rerender } = renderHook(({ ids }) => useDetectedOwnedStock(ids), {
      initialProps: { ids: TYPE_IDS },
    });
    await waitFor(() => expect(result.current.stock.size).toBe(1));
    const first = result.current.stock;

    rerender({ ids: [35] });

    expect(result.current.stock).not.toBe(first);
    expect(result.current.stock.size).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Its own file: the game data is memoized per module, so a names list that
// fails to load here must not carry into any other suite.
vi.mock('@/sde/loadSde', () => ({
  loadFittingSlots: () => Promise.resolve({ 3001: 'high' }),
  loadShipTree: () =>
    Promise.resolve({
      ships: [{ typeID: 626, stats: { highSlots: 4, medSlots: 4, lowSlots: 5, rigSlots: 3 } }],
    }),
  loadTypeNames: () => Promise.reject(new Error('offline')),
}));
vi.mock('@/features/skills/typeCatalog', () => ({
  loadItemNameMap: () =>
    Promise.resolve(
      new Map([
        ['vexor', { typeID: 626 }],
        ['heavy neutron blaster ii', { typeID: 3001 }],
      ])
    ),
}));

import { useWorkbenchFitCurrency } from './workbenchFitCurrency';
import type { WorkbenchFit } from './workbenchFits';

describe('useWorkbenchFitCurrency without the game’s name list', () => {
  it('calls no unread item removed, and still loads the rest of the fit', async () => {
    const fits: WorkbenchFit[] = [
      {
        id: 'a',
        name: 'Fit a',
        authorId: 1,
        authorName: 'Saryna Dach',
        dateAdded: 0,
        eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II\n\nFierce Exotic Filament x3',
      },
    ];
    const { result } = renderHook(() => useWorkbenchFitCurrency(fits));
    await waitFor(() => expect(result.current).not.toBeNull());
    const check = result.current?.get('a');
    expect(check?.verdict).toEqual({ current: true });
    expect(check?.modules).toEqual([{ slot: 'high', typeId: 3001 }]);
    expect(new Map(check?.items)).toEqual(
      new Map([
        [626, 1],
        [3001, 1],
      ])
    );
  });
});

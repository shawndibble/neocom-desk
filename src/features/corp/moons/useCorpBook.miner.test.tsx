// The Miner page reads one Miner's read-model slice (issue #5258); every other page the whole book.
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRead } from '../taxBook/bookRead';

const readBook = vi.hoisted(() => vi.fn());
const extendBook = vi.hoisted(() => vi.fn());
vi.mock('../taxBook/bookRead', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookRead')>()),
  readBook,
  extendBook,
}));
vi.mock('../taxBook/bookClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookClient')>()),
  verifyOfficer: vi.fn().mockResolvedValue({ canView: true, bookActive: true }),
}));
vi.mock('../taxBook/observedStore', () => ({ forgetObservedCopy: vi.fn() }));
vi.mock('../currentMembers', () => ({
  loadCurrentMemberIds: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock('@/features/character/moonNames', () => ({
  loadMoonNames: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/features/character/structures', () => ({
  loadStructureName: vi.fn().mockResolvedValue(null),
  loadStructureAccess: vi.fn().mockResolvedValue('unknown'),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn().mockResolvedValue(new Map()),
}));
const loadDatedUnitPricesByHub = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/features/miningTax/pricing', async (orig) => ({
  ...(await orig<typeof import('@/features/miningTax/pricing')>()),
  loadDatedUnitPricesByHub,
  moonOwnerPricesAtHubOnDate: vi.fn().mockReturnValue(new Map()),
  pricesAtHubOnDate: vi.fn().mockReturnValue([]),
  sourcesAtHubOnDate: vi.fn().mockReturnValue([]),
}));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 7 }),
}));
vi.mock('../owner', () => ({ useActiveCorporationId: () => 98000001 }));

import { useCorpBook } from './useCorpBook';

const SYNC = { run: { phase: 'idle' } } as never;

function book(): BookRead {
  return {
    settings: {
      active: true,
      startDate: '2026-10-01',
      graceHours: 24,
      overdueDays: 14,
      hubId: 'jita',
      oreForm: 'raw',
      structureExpiryHours: {},
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
    } as never,
    state: {
      miners: [],
      notices: [],
      payments: [],
      dismissals: [],
      extractions: [],
    } as never,
    observed: [
      // Frozen: before the window, priced by nobody.
      {
        structureId: 1,
        characterId: 5,
        recordedCorporationId: 98000001,
        typeId: 11,
        date: '2026-10-02',
        quantity: 1,
        cachedAt: '2026-10-02T00:00:00Z',
      },
      {
        structureId: 1,
        characterId: 5,
        recordedCorporationId: 98000001,
        typeId: 22,
        date: '2026-10-20',
        quantity: 1,
        cachedAt: '2026-10-20T00:00:00Z',
      },
    ],
    declarations: [],
    adjustments: [],
    parts: new Set(['core', 'observed', 'ledger', 'answers']),
  };
}

/** The read the hook asked for: its scope, and nothing else. */
const asked = (n: number) =>
  Object.fromEntries(
    Object.entries(readBook.mock.calls[n]![2] as Record<string, unknown>).filter(
      ([k]) => k !== 'parts'
    )
  );

beforeEach(() => {
  readBook
    .mockReset()
    .mockImplementation(async (_c, _b, ask: { minerId?: string }) =>
      ask.minerId === undefined
        ? book()
        : { ...book(), scopedMiner: ask.minerId, minerScope: { from: '2026-10-15' } }
    );
  extendBook.mockReset().mockImplementation(async (_c, _b, held: BookRead) => held);
  loadDatedUnitPricesByHub.mockClear();
});

describe('Miner page read path', () => {
  it('reads the Miner slice only, and prices only its open window', async () => {
    const { result } = renderHook(() => useCorpBook(SYNC, undefined, { minerId: 'solo:5' }));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBook).toHaveBeenCalledTimes(1);
    expect(readBook.mock.calls[0]?.slice(0, 2)).toEqual([7, 98000001]);
    expect(asked(0)).toEqual({ minerId: 'solo:5' });
    expect(loadDatedUnitPricesByHub.mock.calls[0]?.[0]).toEqual([22]);
  });

  it('no Miner open: the whole book, every day priced', async () => {
    const { result } = renderHook(() => useCorpBook(SYNC));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBook).toHaveBeenCalledTimes(1);
    expect(asked(0)).toEqual({});
    expect(loadDatedUnitPricesByHub.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([11, 22]));
  });

  it('leaving the Miner reads the whole book again, and shows loading meanwhile', async () => {
    const { result, rerender } = renderHook(
      ({ minerId }: { minerId?: string }) => useCorpBook(SYNC, undefined, { minerId }),
      { initialProps: { minerId: 'solo:5' } as { minerId?: string } }
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    rerender({ minerId: undefined });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBook).toHaveBeenCalledTimes(2);
    expect(asked(1)).toEqual({});
  });
});

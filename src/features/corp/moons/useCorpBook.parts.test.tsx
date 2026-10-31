// Which slices of the book `useCorpBook` reads as the page's tab changes (issue #5248).
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookData } from '../taxBook/bookClient';
import type { BookPartSet } from '../taxBook/bookParts';

const readBookData = vi.hoisted(() => vi.fn());
vi.mock('../taxBook/bookClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookClient')>()),
  readBookData,
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
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/features/miningTax/pricing', async (orig) => ({
  ...(await orig<typeof import('@/features/miningTax/pricing')>()),
  loadDatedUnitPricesByHub: vi.fn().mockResolvedValue({}),
  moonOwnerPricesAtHubOnDate: vi.fn().mockReturnValue(new Map()),
  pricesAtHubOnDate: vi.fn().mockReturnValue([]),
  sourcesAtHubOnDate: vi.fn().mockReturnValue([]),
}));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 7 }),
}));
vi.mock('../owner', () => ({ useActiveCorporationId: () => 98000001 }));

import { bookPartsFor } from '../taxBook/bookParts';
import { useCorpBook } from './useCorpBook';

const SYNC = { run: { phase: 'idle' } } as never;

function book(parts: BookPartSet): BookData {
  return {
    settings: {
      active: true,
      startDate: '2026-10-01',
      graceHours: 24,
      minimumStatement: 0,
      overdueDays: 14,
      cadence: { kind: 'monthly' },
      hubId: 'jita',
      oreForm: 'raw',
      structureExpiryHours: {},
      rates: [],
    } as never,
    state: {
      miners: [],
      statements: [],
      payments: [],
      dismissals: [],
      extractions: [],
      paidStatementIds: new Set(),
    } as never,
    observed: [],
    declarations: [],
    adjustments: [],
    parts,
  };
}

beforeEach(() => {
  readBookData.mockReset().mockImplementation(async (_c, _b, parts: BookPartSet) => book(parts));
});

describe('useCorpBook read plan', () => {
  it('opens on the core and rows, and reads just the ledger when Statements opens', async () => {
    const { result, rerender } = renderHook(
      ({ tab }) => useCorpBook(SYNC, bookPartsFor(tab, null)),
      {
        initialProps: { tab: 'extractions' },
      }
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBookData).toHaveBeenCalledTimes(1);
    expect(readBookData.mock.calls[0]?.[2]).toEqual(new Set(['core', 'observed']));

    rerender({ tab: 'statements' });
    await waitFor(() => expect(readBookData).toHaveBeenCalledTimes(2));
    expect(readBookData.mock.calls[1]?.[2]).toEqual(new Set(['ledger']));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // Going back, and on to a tab the held slices cover, reads nothing.
    rerender({ tab: 'extractions' });
    rerender({ tab: 'statements' });
    expect(readBookData).toHaveBeenCalledTimes(2);
  });

  it('the Moon owners tab opens without rows, and falls back to them only when it must (#5717)', async () => {
    const owners = (extractions: unknown[], summaries?: Map<number, unknown>) =>
      readBookData.mockImplementation(async (_c, _b, parts: BookPartSet) => ({
        ...book(parts),
        ...(parts.has('core')
          ? {
              state: { ...book(parts).state, extractions } as never,
              feeders: [
                {
                  corporationId: 5,
                  status: 'active',
                  mode: 'normal',
                  joinedAt: 0,
                  coveragePeriods: [],
                  payouts: [],
                },
              ] as never,
            }
          : {}),
        ...(summaries ? { feederSummaries: summaries as never } : {}),
      }));
    // An Extraction settles has-own-refineries; the moon owner has no summary: rows needed.
    owners(
      [
        {
          structureId: 1,
          moonId: 2,
          chunkArrivalTime: '2026-10-20T00:00:00.000Z',
          naturalDecayTime: '2026-10-22T00:00:00.000Z',
        },
      ],
      new Map()
    );
    const first = renderHook(() => useCorpBook(SYNC, bookPartsFor('moon-owners', null)));
    await waitFor(() => expect(first.result.current.state.status).toBe('ready'));
    expect(readBookData.mock.calls.map((c) => [...(c[2] as BookPartSet)].sort())).toEqual([
      ['core', 'owners'],
      ['observed'],
    ]);
    first.unmount();

    // The same book with no way to tell (no Extraction, one moon owner) also reads the rows.
    readBookData.mockClear();
    owners([], new Map());
    const second = renderHook(() => useCorpBook(SYNC, bookPartsFor('moon-owners', null)));
    await waitFor(() => expect(second.result.current.state.status).toBe('ready'));
    expect(readBookData.mock.calls.map((c) => [...(c[2] as BookPartSet)].sort())).toContainEqual([
      'observed',
    ]);
  });

  it('shows the loading state, not a half-joined book, while a tab reads its slices', async () => {
    const { result, rerender } = renderHook(
      ({ tab }) => useCorpBook(SYNC, bookPartsFor(tab, null)),
      {
        initialProps: { tab: 'moon-owners' },
      }
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    let finish!: (d: BookData) => void;
    readBookData.mockReturnValueOnce(new Promise<BookData>((r) => (finish = r)));

    rerender({ tab: 'miners' });
    expect(result.current.state.status).toBe('loading');
    finish(book(new Set(['ledger', 'answers'])));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookPart } from '../taxBook/bookClient';
import type { BookRead } from '../taxBook/bookRead';

type BookPartSet = ReadonlySet<BookPart>;
const readBook = vi.hoisted(() => vi.fn());
vi.mock('../taxBook/bookRead', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookRead')>()),
  readBook,
  extendBook: async (c: number, b: number, held: BookRead, wanted: BookPartSet) => {
    const missing = new Set([...wanted].filter((p) => !held.parts.has(p)));
    if (missing.size === 0) return held;
    const extra: BookRead | null = await readBook(c, b, { parts: missing });
    return extra ? { ...held, parts: new Set([...held.parts, ...extra.parts]) } : held;
  },
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

import { bookPartsFor } from '../taxBook/bookRead';
import { useCorpBook } from './useCorpBook';

const SYNC = { run: { phase: 'idle' } } as never;

function book(parts: BookPartSet): BookRead {
  return {
    settings: {
      active: true,
      startDate: '2026-10-01',
      graceHours: 24,
      overdueDays: 14,
      hubId: 'jita',
      oreForm: 'raw',
      structureExpiryHours: {},
      rates: [],
    } as never,
    state: {
      miners: [],
      notices: [],
      payments: [],
      dismissals: [],
      extractions: [],
    } as never,
    observed: [],
    declarations: [],
    adjustments: [],
    parts,
  };
}

beforeEach(() => {
  readBook
    .mockReset()
    .mockImplementation(async (_c, _b, ask: { parts: BookPartSet }) => book(ask.parts));
});

describe('useCorpBook read plan', () => {
  it('opens on the core and rows, and reads just the ledger when Late notices opens', async () => {
    const { result, rerender } = renderHook(
      ({ tab }) => useCorpBook(SYNC, bookPartsFor(tab, null)),
      {
        initialProps: { tab: 'extractions' },
      }
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBook).toHaveBeenCalledTimes(1);
    expect(readBook.mock.calls[0]?.[2].parts).toEqual(new Set(['core', 'observed']));

    rerender({ tab: 'late-notices' });
    await waitFor(() => expect(readBook).toHaveBeenCalledTimes(2));
    expect(readBook.mock.calls[1]?.[2].parts).toEqual(new Set(['ledger']));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    rerender({ tab: 'extractions' });
    rerender({ tab: 'late-notices' });
    expect(readBook).toHaveBeenCalledTimes(2);
  });

  it('the Moon owners tab opens without rows, and falls back to them only when it must (#5717)', async () => {
    const owners = (extractions: unknown[], summaries?: Map<number, unknown>) =>
      readBook.mockImplementation(async (_c, _b, { parts }: { parts: BookPartSet }) => ({
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
    expect(readBook.mock.calls.map((c) => [...(c[2].parts as BookPartSet)].sort())).toEqual([
      ['core', 'owners'],
      ['observed'],
    ]);
    first.unmount();

    readBook.mockClear();
    owners([], new Map());
    const second = renderHook(() => useCorpBook(SYNC, bookPartsFor('moon-owners', null)));
    await waitFor(() => expect(second.result.current.state.status).toBe('ready'));
    expect(readBook.mock.calls.map((c) => [...(c[2].parts as BookPartSet)].sort())).toContainEqual([
      'observed',
    ]);
  });

  it('requestRows reads the rows a Moon owners tab opened without, and keeps the page ready', async () => {
    const { result } = renderHook(() => useCorpBook(SYNC, bookPartsFor('moon-owners', null)));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBook).toHaveBeenCalledTimes(1);

    act(() => result.current.requestRows());
    expect(result.current.state.status).toBe('ready');
    await waitFor(() => expect(readBook).toHaveBeenCalledTimes(2));
    expect([...(readBook.mock.calls[1]?.[2].parts as BookPartSet)]).toEqual(['observed']);
    await waitFor(() =>
      expect(
        result.current.state.status === 'ready' && result.current.state.data.parts?.has('observed')
      ).toBe(true)
    );
  });

  it('shows the loading state, not a half-joined book, while a tab reads its slices', async () => {
    const { result, rerender } = renderHook(
      ({ tab }) => useCorpBook(SYNC, bookPartsFor(tab, null)),
      {
        initialProps: { tab: 'moon-owners' },
      }
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    let finish!: (d: BookRead) => void;
    readBook.mockReturnValueOnce(new Promise<BookRead>((r) => (finish = r)));

    rerender({ tab: 'miners' });
    expect(result.current.state.status).toBe('loading');
    finish(book(new Set(['ledger', 'answers'])));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });
});

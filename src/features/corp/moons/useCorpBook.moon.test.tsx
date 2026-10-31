// The moon page reads one pull's window and the moon docs (issue #5716); every other page the whole book.
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookData } from '../taxBook/bookClient';

const readBookData = vi.hoisted(() => vi.fn());
const readMoonBookData = vi.hoisted(() => vi.fn());
vi.mock('../taxBook/bookClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookClient')>()),
  readBookData,
  readMoonBookData,
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

const PULL = {
  structureId: 1,
  moonId: 31,
  extractionStartTime: '2026-10-10T00:00:00Z',
  chunkArrivalTime: '2026-10-17T00:00:00Z',
  naturalDecayTime: '2026-10-17T12:00:00Z',
  laserFiredAt: '2026-10-17T12:00:00Z',
  oreLines: [{ typeId: 22, quantity: 100 }],
};
const PULL_ID = `1_${Date.parse(PULL.extractionStartTime)}`;

function book(): BookData {
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
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
    } as never,
    state: {
      miners: [],
      statements: [],
      payments: [],
      dismissals: [],
      extractions: [PULL],
      paidStatementIds: new Set(),
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
  };
}

beforeEach(() => {
  readBookData.mockReset().mockImplementation(async () => book());
  readMoonBookData.mockReset().mockImplementation(async () => ({
    data: { ...book(), observed: book().observed.slice(1) },
    docs: new Map(),
    fromDocs: new Set(),
  }));
  loadDatedUnitPricesByHub.mockClear();
});

describe('moon page read path', () => {
  it('reads the pull window only, and prices only its days', async () => {
    const { result } = renderHook(() => useCorpBook(SYNC, undefined, { extractionId: PULL_ID }));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readMoonBookData).toHaveBeenCalledWith(7, 98000001, PULL_ID);
    expect(readBookData).not.toHaveBeenCalled();
    expect(loadDatedUnitPricesByHub.mock.calls[0]?.[0]).toEqual([22]);
  });

  it('a missing doc reads the whole book and prices every day', async () => {
    readMoonBookData.mockResolvedValue('fallback');
    const { result } = renderHook(() => useCorpBook(SYNC, undefined, { extractionId: PULL_ID }));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBookData).toHaveBeenCalledTimes(1);
    expect(loadDatedUnitPricesByHub.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([11, 22]));
  });

  it('every other page reads the whole book', async () => {
    const { result } = renderHook(() => useCorpBook(SYNC));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBookData).toHaveBeenCalledTimes(1);
    expect(readMoonBookData).not.toHaveBeenCalled();
  });

  it('leaving the moon page reads the whole book again, and shows loading meanwhile', async () => {
    const { result, rerender } = renderHook(
      ({ extractionId }: { extractionId?: string }) =>
        useCorpBook(SYNC, undefined, { extractionId }),
      { initialProps: { extractionId: PULL_ID } as { extractionId?: string } }
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    rerender({ extractionId: undefined });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readBookData).toHaveBeenCalledTimes(1);
  });
});

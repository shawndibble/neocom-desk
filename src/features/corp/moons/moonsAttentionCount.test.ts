// The Moons nav dot's background recount (#6208) must not load market prices on every
// 30-minute poll: it reuses the prices this session already holds for the book.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRead } from '../taxBook/bookRead';

const readBook = vi.hoisted(() => vi.fn());
const loadDatedUnitPricesByHub = vi.hoisted(() => vi.fn());
vi.mock('../taxBook/bookRead', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookRead')>()),
  readBook,
}));
vi.mock('../currentMembers', () => ({
  loadCurrentMemberIds: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock('@/features/miningTax/pricing', async (orig) => ({
  ...(await orig<typeof import('@/features/miningTax/pricing')>()),
  loadDatedUnitPricesByHub,
  moonOwnerPricesAtHubOnDate: vi.fn().mockReturnValue(new Map()),
  pricesAtHubOnDate: vi.fn().mockReturnValue([]),
  sourcesAtHubOnDate: vi.fn().mockReturnValue([]),
}));

import { loadBookPrices } from './bookViewOf';
import { loadNeedsYouCount } from './moonsAttentionCount';

const ROW = { characterId: 9, typeId: 45490, date: '2026-11-01', quantity: 100 };

function book(observed: unknown[] = [ROW], hubId = 'jita'): BookRead {
  return {
    settings: {
      active: true,
      startDate: '2026-10-01',
      graceHours: 24,
      minimumStatement: 0,
      overdueDays: 14,
      cadence: { kind: 'monthly' },
      hubId,
      oreForm: 'raw',
      structureExpiryHours: {},
      rates: [],
      divisions: [1],
    } as never,
    state: {
      miners: [],
      statements: [],
      payments: [],
      dismissals: [],
      extractions: [],
      paidStatementIds: new Set(),
    } as never,
    observed: observed as never,
    declarations: [],
    adjustments: [],
    parts: new Set(['core', 'observed']),
  };
}

beforeEach(() => {
  readBook.mockReset().mockResolvedValue(book());
  loadDatedUnitPricesByHub.mockReset().mockResolvedValue({});
});

describe('loadNeedsYouCount', () => {
  it('loads no prices when the Moons page already loaded them this session', async () => {
    await loadBookPrices(book());
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(1);

    await expect(loadNeedsYouCount(7, 98000001)).resolves.toBe(0);
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(1);
  });

  it('loads prices once a session, not on every 30-minute recount', async () => {
    await loadNeedsYouCount(7, 98000001);
    await loadNeedsYouCount(7, 98000001);
    await loadNeedsYouCount(7, 98000001);
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(1);
  });

  it('loads again for an ore, hub or Ore Form the held prices do not cover', async () => {
    await loadNeedsYouCount(7, 98000001);
    readBook.mockResolvedValue(book([ROW, { ...ROW, typeId: 45491 }]));
    await loadNeedsYouCount(7, 98000001);
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(2);

    readBook.mockResolvedValue(book([ROW], 'amarr'));
    await loadNeedsYouCount(7, 98000001);
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(3);
  });
});

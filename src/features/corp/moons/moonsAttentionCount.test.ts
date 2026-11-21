// The Moons nav dot's background recount (#6208) must not load market prices on every
// 30-minute poll: it reuses the prices this session already holds for the book.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { loadBookPrices, surveyTypeIdsOf } from './bookViewOf';
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

afterEach(() => {
  vi.useRealTimers();
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

  it('loads again when the held prices skip a day the book mined, or were loaded on another day', async () => {
    // The Moons page's windowed load prices only days from its `from`.
    await loadBookPrices(book(), '2026-11-05');
    await loadNeedsYouCount(7, 98000001);
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(2);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 86_400_000);
    await loadNeedsYouCount(7, 98000001);
    expect(loadDatedUnitPricesByHub).toHaveBeenCalledTimes(3);
  });
});

describe('loadBookPrices on a refinery page', () => {
  it('prices the ore its moon docs hold, though no ledger row was read', async () => {
    const doc = { mined: [{ typeId: 45492, quantity: 5 }], miners: [] };
    await loadBookPrices({
      ...book([]),
      refinery: { structureId: 1, docs: new Map([['x', doc as never]]) },
    });
    expect(loadDatedUnitPricesByHub.mock.calls[0]![0]).toEqual([45492]);
  });
});

describe('survey ores', () => {
  it('are priced with the ones the read holds, though no row or notification names them', async () => {
    const survey = new Map([['x1', [{ typeId: 45492, quantity: 5 }]]]);
    expect([...surveyTypeIdsOf(survey)]).toEqual([45492]);
    expect([...surveyTypeIdsOf(undefined)]).toEqual([]);

    await loadBookPrices(book([]), undefined, surveyTypeIdsOf(survey));
    expect(loadDatedUnitPricesByHub.mock.calls[0]![0]).toEqual([45492]);
  });
});

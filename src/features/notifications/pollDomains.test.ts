import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from './events';
import {
  POLL_DOMAINS,
  calendarDomain,
  skillQueueDomain,
  contractDomain,
  walletDomain,
  marketOrderDomain,
  gatedOn,
  deriveMarketOrderEntries,
} from './pollDomains';
import { loadContracts } from '@/features/character/contracts';
import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type { StatusResult } from '@/esi/cache';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';

vi.mock('@/features/character/contracts', () => ({ loadContracts: vi.fn() }));
vi.mock('@/features/character/wallet', () => ({ loadWalletJournalWithStatus: vi.fn() }));
vi.mock('@/features/character/orders', () => ({
  loadOrders: vi.fn(),
  loadOrderHistory: vi.fn(),
}));

function statusResult<T>(data: T, truncated: boolean): StatusResult<T> {
  return {
    needsReauth: false,
    cached: { data, fetchedAt: new Date(0), fromCache: false, truncated },
  };
}

function marketOrder(overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: 1,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_corporation: false,
    price: 100,
    volume_remain: 5,
    volume_total: 10,
    issued: '2026-01-01T00:00:00Z',
    duration: 90,
    range: 'region',
    ...overrides,
  };
}

function marketOrderHistoryEntry(overrides: Partial<MarketOrderHistory> = {}): MarketOrderHistory {
  return { ...marketOrder(), state: 'expired', ...overrides };
}

describe('POLL_DOMAINS', () => {
  it('covers every notification event exactly once', () => {
    const covered = POLL_DOMAINS.flatMap((domain) => domain.eventIds);
    expect([...covered].sort()).toEqual([...NOTIFICATION_EVENT_IDS].sort());
  });

  it('gives every domain a distinct id', () => {
    const ids = POLL_DOMAINS.map((domain) => domain.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every domain a distinct, non-syncing state key', () => {
    const keys = POLL_DOMAINS.map((domain) => domain.stateKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('sync.')).toBe(false);
  });

  it('stamps the poll time onto every domain snapshot it builds', () => {
    for (const domain of POLL_DOMAINS) {
      expect(domain.toSnapshot([], 4242)).toMatchObject({ nowMs: 4242 });
    }
  });

  it('registers two diffs off the one calendar snapshot', () => {
    expect(calendarDomain.eventIds).toEqual(['newCalendarEvent', 'calendarEventStarting']);
  });

  it('drives the skill queue off the engine diff registry, not a hand-written list', () => {
    expect([...skillQueueDomain.eventIds].sort()).toEqual([
      'characterNotTraining',
      'skillLevelComplete',
    ]);
  });
});

describe('gatedOn', () => {
  const snapshot = { entries: [], nowMs: 1 };

  it('runs the wrapped diff when its event is enabled', () => {
    const diff = vi.fn(() => [{ eventId: 'newMail' as const, characterId: 1, mailId: 2 }]);
    const gated = gatedOn('newMail', diff);
    const fires = gated(1, undefined, snapshot, new Set<NotificationEventId>(['newMail']));
    expect(diff).toHaveBeenCalledWith(1, undefined, snapshot);
    expect(fires).toEqual([{ eventId: 'newMail', characterId: 1, mailId: 2 }]);
  });

  it('fires nothing and does not run the diff when its event is not enabled', () => {
    const diff = vi.fn(() => [{ eventId: 'newMail' as const, characterId: 1, mailId: 2 }]);
    const gated = gatedOn('newMail', diff);
    const fires = gated(
      1,
      undefined,
      snapshot,
      new Set<NotificationEventId>(['calendarEventStarting'])
    );
    expect(diff).not.toHaveBeenCalled();
    expect(fires).toEqual([]);
  });
});

describe('deriveMarketOrderEntries', () => {
  it('marks every still-open order as not filled', () => {
    const entries = deriveMarketOrderEntries([marketOrder({ order_id: 1 })], []);
    expect(entries).toEqual([{ orderId: 1, filled: false }]);
  });

  it('marks a history order gone from the open list as filled once volume_remain is 0', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [marketOrderHistoryEntry({ order_id: 2, volume_remain: 0 })]
    );
    expect(entries).toEqual([{ orderId: 2, filled: true }]);
  });

  it('does not mark a history order with remaining volume as filled (cancelled/expired unfilled)', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [marketOrderHistoryEntry({ order_id: 3, volume_remain: 4 })]
    );
    expect(entries).toEqual([{ orderId: 3, filled: false }]);
  });

  it('prefers the open-list entry over a stale history row for the same order id', () => {
    const entries = deriveMarketOrderEntries(
      [marketOrder({ order_id: 4 })],
      [marketOrderHistoryEntry({ order_id: 4, volume_remain: 0 })]
    );
    expect(entries).toEqual([{ orderId: 4, filled: false }]);
  });

  it('derives the same shape for a filled buy order as a filled sell order', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [
        marketOrderHistoryEntry({ order_id: 5, is_buy_order: true, volume_remain: 0 }),
        marketOrderHistoryEntry({ order_id: 6, is_buy_order: false, volume_remain: 0 }),
      ]
    );
    expect(entries).toEqual([
      { orderId: 5, filled: true },
      { orderId: 6, filled: true },
    ]);
  });
});

/**
 * Three separate bug fixes from the #174/#175 reviews, now testable because
 * each domain's loader sits on its registry entry rather than inside
 * `liveDependencies()`'s object literal. A truncated page set must skip the
 * poll — persisting a partial baseline is what makes the next complete poll
 * false-fire.
 */
describe('truncation guards', () => {
  beforeEach(() => {
    vi.mocked(loadContracts).mockReset();
    vi.mocked(loadWalletJournalWithStatus).mockReset();
    vi.mocked(loadOrders).mockReset();
    vi.mocked(loadOrderHistory).mockReset();
  });

  it('skips the contracts poll rather than persist a truncated page set', async () => {
    vi.mocked(loadContracts).mockResolvedValue(statusResult([], true));
    expect(await contractDomain.load(1)).toBeNull();
  });

  it('polls contracts normally when the page set is complete', async () => {
    vi.mocked(loadContracts).mockResolvedValue(statusResult([], false));
    expect(await contractDomain.load(1)).toEqual([]);
  });

  it('skips the wallet poll rather than lower the high-water mark from a truncated page set', async () => {
    vi.mocked(loadWalletJournalWithStatus).mockResolvedValue(statusResult([], true));
    expect(await walletDomain.load(1)).toBeNull();
  });

  it('polls the wallet normally when the page set is complete', async () => {
    vi.mocked(loadWalletJournalWithStatus).mockResolvedValue(statusResult([], false));
    expect(await walletDomain.load(1)).toEqual([]);
  });

  it('skips the market-order poll rather than misreport an open order as filled-and-gone', async () => {
    vi.mocked(loadOrders).mockResolvedValue(statusResult([], false));
    vi.mocked(loadOrderHistory).mockResolvedValue(statusResult([], true));
    expect(await marketOrderDomain.load(1)).toBeNull();
  });

  it('polls market orders normally when the history page set is complete', async () => {
    vi.mocked(loadOrders).mockResolvedValue(statusResult([marketOrder({ order_id: 9 })], false));
    vi.mocked(loadOrderHistory).mockResolvedValue(statusResult([], false));
    expect(await marketOrderDomain.load(1)).toEqual([{ orderId: 9, filled: false }]);
  });
});

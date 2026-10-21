import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadCorporationId = vi.fn();
const fetchCorporationStatsRead = vi.fn();
vi.mock('@/features/corp/boardData', () => ({
  loadCorporationId: (...a: unknown[]) => loadCorporationId(...a),
  MASTER_WALLET_DIVISION: 1,
}));
vi.mock('@/lib/zkillboard', () => ({
  fetchCorporationStatsRead: (...a: unknown[]) => fetchCorporationStatsRead(...a),
}));
vi.mock('@/features/corp/corpReadAccess', () => ({ resolveCorpReadAccess: vi.fn() }));

import { loadCorpKills } from './corpFeedLoaders';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadCorpKills', () => {
  it('asks zKillboard nothing for an NPC corporation', async () => {
    loadCorporationId.mockResolvedValue(1000125);
    const feed = await loadCorpKills(1);
    expect(feed.readable).toBe(false);
    expect(feed.corporationId).toBe(1000125);
    expect(fetchCorporationStatsRead).not.toHaveBeenCalled();
  });

  it('is unreadable when the corporation is unknown', async () => {
    loadCorporationId.mockResolvedValue(null);
    expect((await loadCorpKills(1)).readable).toBe(false);
    expect(fetchCorporationStatsRead).not.toHaveBeenCalled();
  });

  it('carries the totals for a player corporation', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    fetchCorporationStatsRead.mockResolvedValue({
      result: { kind: 'stats', stats: { kills: 3 } },
      fetchedAt: new Date(0),
      fromCache: false,
    });
    const feed = await loadCorpKills(1);
    expect(fetchCorporationStatsRead).toHaveBeenCalledWith(98000001);
    expect(feed).toMatchObject({ readable: true, stats: { kills: 3 }, failed: null });
  });

  it('keeps a zKillboard failure as a reason, not a throw', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    fetchCorporationStatsRead.mockResolvedValue({
      result: { kind: 'failed', reason: 'rate-limited' },
      fetchedAt: new Date(0),
      fromCache: false,
    });
    const feed = await loadCorpKills(1);
    expect(feed).toMatchObject({ readable: true, stats: null, failed: 'rate-limited' });
  });

  it('reads no history as no stats', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    fetchCorporationStatsRead.mockResolvedValue({
      result: { kind: 'no-history' },
      fetchedAt: new Date(0),
      fromCache: false,
    });
    expect(await loadCorpKills(1)).toMatchObject({ readable: true, stats: null, failed: null });
  });

  it('reports the real read time and cache flag', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    const fetchedAt = new Date('2026-10-20T00:00:00Z');
    fetchCorporationStatsRead.mockResolvedValue({
      result: { kind: 'stats', stats: { kills: 3 } },
      fetchedAt,
      fromCache: true,
    });
    const feed = await loadCorpKills(1);
    expect(feed.fetchedAt).toBe(fetchedAt);
    expect(feed.fromCache).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadCorporationId = vi.fn();
const fetchCorporationStats = vi.fn();
vi.mock('@/features/corp/boardData', () => ({
  loadCorporationId: (...a: unknown[]) => loadCorporationId(...a),
  MASTER_WALLET_DIVISION: 1,
}));
vi.mock('@/lib/zkillboard', () => ({
  fetchCorporationStats: (...a: unknown[]) => fetchCorporationStats(...a),
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
    expect(fetchCorporationStats).not.toHaveBeenCalled();
  });

  it('is unreadable when the corporation is unknown', async () => {
    loadCorporationId.mockResolvedValue(null);
    expect((await loadCorpKills(1)).readable).toBe(false);
    expect(fetchCorporationStats).not.toHaveBeenCalled();
  });

  it('carries the totals for a player corporation', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    fetchCorporationStats.mockResolvedValue({ kind: 'stats', stats: { kills: 3 } });
    const feed = await loadCorpKills(1);
    expect(fetchCorporationStats).toHaveBeenCalledWith(98000001);
    expect(feed).toMatchObject({ readable: true, stats: { kills: 3 }, failed: null });
  });

  it('keeps a zKillboard failure as a reason, not a throw', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    fetchCorporationStats.mockResolvedValue({ kind: 'failed', reason: 'rate-limited' });
    const feed = await loadCorpKills(1);
    expect(feed).toMatchObject({ readable: true, stats: null, failed: 'rate-limited' });
  });

  it('reads no history as no stats', async () => {
    loadCorporationId.mockResolvedValue(98000001);
    fetchCorporationStats.mockResolvedValue({ kind: 'no-history' });
    expect(await loadCorpKills(1)).toMatchObject({ readable: true, stats: null, failed: null });
  });
});

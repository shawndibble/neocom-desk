import { HOUR_MS } from '@/lib/age';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { summarizeCorpContracts } from '@/engine/contracts/corpContracts';

const resolveCorpReadAccess = vi.fn();
const loadCorpPaginatedWithCacheStatus = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));
vi.mock('@/features/corp/corpRead', () => ({
  loadCorpPaginatedWithCacheStatus: (...a: unknown[]) => loadCorpPaginatedWithCacheStatus(...a),
}));
vi.mock('@/features/character/names', () => ({ resolveNames: async () => new Map() }));

import { loadCorpContracts } from './corpFeedLoaders';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const acceptedCourier: Contract = {
  contract_id: 7,
  issuer_id: 1,
  issuer_corporation_id: 9,
  assignee_id: 9,
  acceptor_id: 555,
  type: 'courier',
  status: 'outstanding',
  for_corporation: true,
  availability: 'personal',
  date_issued: iso(NOW - 72 * HOUR_MS),
  date_expired: iso(NOW - 24 * HOUR_MS),
  date_accepted: iso(NOW - 48 * HOUR_MS),
  days_to_complete: 7,
  collateral: 900,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveCorpReadAccess.mockResolvedValue({ corporationId: 98000001, can: () => true });
  loadCorpPaginatedWithCacheStatus.mockResolvedValue({
    cached: { data: [acceptedCourier], fetchedAt: new Date(0), fromCache: false, truncated: false },
    needsReauth: false,
  });
});

describe('loadCorpContracts', () => {
  it('keeps an accepted courier on day 2, in progress with its delivery deadline', async () => {
    const feed = await loadCorpContracts(1);
    expect(feed.contracts[0]!.status).toBe('in_progress');
    const summary = summarizeCorpContracts(feed.contracts, NOW);
    expect(summary.rows).toHaveLength(1);
    expect(summary.collateral).toBe(900);
    expect(summary.rows[0]).toMatchObject({ atMs: NOW + 5 * 24 * HOUR_MS, overdue: false });
  });

  it('marks it overdue once the delivery deadline passes', async () => {
    const feed = await loadCorpContracts(1);
    const summary = summarizeCorpContracts(feed.contracts, NOW + 6 * 24 * HOUR_MS);
    expect(summary.overdue).toBe(1);
  });
});

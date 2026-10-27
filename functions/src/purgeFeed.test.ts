import { describe, it, expect } from 'vitest';
import { FIRED_RETENTION_MS, isPastRetention } from './dispatchProjections.js';
import {
  FEED_PURGE_BATCH_SIZE,
  FEED_PURGE_MAX_PASSES,
  feedPurgeCutoff,
  isPurgeableFeedRow,
} from './purgeFeed.js';

const NOW = 1_800_000_000_000;

describe('feedPurgeCutoff', () => {
  it('is the retention window back from now', () => {
    expect(feedPurgeCutoff(NOW)).toBe(NOW - FIRED_RETENTION_MS);
  });

  it('reuses the retention the fired-projection purge already applies', () => {
    // AC2 of #595: no third retention constant. The client's own
    // FEED_SYNC_WINDOW_MS is the same 30 days but lives in the other package
    // (functions/ cannot import from src/), so the two are kept equal by the
    // comment at each declaration rather than by a shared module.
    expect(FIRED_RETENTION_MS).toBe(30 * 24 * 3_600_000);
  });
});

describe('isPurgeableFeedRow', () => {
  it('purges a row fired past the retention window', () => {
    expect(isPurgeableFeedRow(NOW - FIRED_RETENTION_MS - 1, NOW)).toBe(true);
  });

  it('keeps a row fired exactly at the window edge', () => {
    expect(isPurgeableFeedRow(NOW - FIRED_RETENTION_MS, NOW)).toBe(false);
  });

  it('keeps a row fired inside the window', () => {
    expect(isPurgeableFeedRow(NOW - 1000, NOW)).toBe(false);
  });

  it('agrees with isPastRetention on both sides of the edge', () => {
    // index.ts expresses this as a `where('firedAt', '<', cutoff)` filter,
    // which cannot call isPastRetention — so the boundary is pinned here
    // instead of being left to drift between the query and the predicate.
    for (const offset of [-1, 0, 1]) {
      const firedAt = NOW - FIRED_RETENTION_MS + offset;
      expect(isPurgeableFeedRow(firedAt, NOW)).toBe(isPastRetention(firedAt, NOW));
    }
  });

  it('honours an explicit retention override', () => {
    expect(isPurgeableFeedRow(NOW - 5001, NOW, 5000)).toBe(true);
    expect(isPurgeableFeedRow(NOW - 5000, NOW, 5000)).toBe(false);
  });
});

describe('purge bounds', () => {
  it('deletes at most one Firestore batch per pass', () => {
    expect(FEED_PURGE_BATCH_SIZE).toBeLessThanOrEqual(500);
  });

  it('bounds the passes one run may take', () => {
    expect(FEED_PURGE_MAX_PASSES).toBeGreaterThan(0);
    expect(Number.isFinite(FEED_PURGE_MAX_PASSES)).toBe(true);
  });
});

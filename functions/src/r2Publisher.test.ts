import { describe, expect, it } from 'vitest';
import {
  publishContractOffersToR2,
  r2PublishOutcome,
  publicContractsRunVerdict,
  PROGRESS_FLUSH_EVERY,
  REFRESH_AFTER_MS,
  type R2Put,
} from './r2Publisher.js';
import type { PublicContractOfferRow } from './publicContracts.js';

const row = (over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow => ({
  contractId: 1,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 34,
  price: 100,
  isAuction: false,
  quantity: 1,
  dateExpired: 1_800_000_000_000,
  ...over,
});

interface Put {
  key: string;
  headers: Record<string, string>;
}

function recorder(failOn?: (key: string) => boolean): { puts: Put[]; put: R2Put } {
  const puts: Put[] = [];
  return {
    puts,
    put: async (key, _body, headers) => {
      if (failOn?.(key)) throw new Error('boom');
      puts.push({ key, headers });
    },
  };
}

const rows = [row(), row({ typeId: 35 })];
const INDEX_KEY = 'contract-offers/index.json';
const typePuts = (puts: Put[]) => puts.filter((p) => p.key.startsWith('contract-offers/types/'));
const bundlePuts = (puts: Put[]) =>
  puts.filter((p) => p.key.startsWith('contract-offers/bundles/'));
const nonBundlePuts = (puts: Put[]) =>
  puts.filter((p) => !p.key.startsWith('contract-offers/bundles/'));

describe('publishContractOffersToR2', () => {
  it('uploads every type then index.json last, with the right headers', async () => {
    const { puts, put } = recorder();
    const result = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put,
    });
    expect(typePuts(puts)).toHaveLength(2);
    expect(puts.at(-1)!.key).toBe(INDEX_KEY);
    expect(typePuts(puts)[0].headers).toMatchObject({
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(puts.at(-1)!.headers['Cache-Control']).toBe('public, max-age=60');
    expect(puts.at(-1)!.headers['Content-Encoding']).toBeUndefined();
    expect(result).toMatchObject({ uploaded: 2, skipped: 0, failed: 0, indexWritten: true });
    expect(Object.keys(result.state.hashes).sort()).toEqual(['34', '35']);
    expect(result.state.fullUploadAt).toBe(1000);
  });

  it('uploads only index.json when nothing changed', async () => {
    const first = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
    });
    const { puts, put } = recorder();
    const result = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 2,
      previous: first.state,
      now: 2000,
      put,
    });
    expect(typePuts(puts)).toHaveLength(0);
    expect(nonBundlePuts(puts).map((p) => p.key)).toEqual([INDEX_KEY]);
    expect(result).toMatchObject({ uploaded: 0, skipped: 2 });
  });

  it('uploads just the changed type', async () => {
    const first = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
    });
    const { puts, put } = recorder();
    await publishContractOffersToR2({
      rows: [row({ price: 101 }), row({ typeId: 35 })],
      lastSyncedAt: 2,
      previous: first.state,
      now: 2000,
      put,
    });
    expect(typePuts(puts)).toHaveLength(1);
    expect(typePuts(puts)[0].key).toContain('/34.');
  });

  it('re-uploads everything once the refresh interval passes, so a lifecycle rule cannot expire live objects', async () => {
    const first = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
    });
    const { puts, put } = recorder();
    const result = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 2,
      previous: first.state,
      now: 1000 + REFRESH_AFTER_MS,
      put,
    });
    expect(typePuts(puts)).toHaveLength(2);
    expect(result.state.fullUploadAt).toBe(1000 + REFRESH_AFTER_MS);
  });

  it('on a type failure skips index.json, keeps the successes, and retries the failure next time', async () => {
    const failing = recorder((key) => key.includes('/35.'));
    const result = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: failing.put,
    });
    expect(result).toMatchObject({ uploaded: 1, failed: 1, indexWritten: false });
    expect(failing.puts.map((p) => p.key)).not.toContain(INDEX_KEY);
    expect(Object.keys(result.state.hashes)).toEqual(['34']);
    expect(result.state.fullUploadAt).toBeNull();

    const retry = recorder();
    await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: result.state,
      now: 2000,
      put: retry.put,
    });
    expect(typePuts(retry.puts)).toHaveLength(1);
    expect(typePuts(retry.puts)[0].key).toContain('/35.');
    expect(retry.puts.at(-1)!.key).toBe(INDEX_KEY);
  });

  it('reports a failed index write without throwing', async () => {
    const result = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder((key) => key === INDEX_KEY).put,
    });
    expect(result).toMatchObject({ uploaded: 2, failed: 0, indexWritten: false });
  });

  it('drops a vanished type from the saved hashes', async () => {
    const first = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
    });
    const result = await publishContractOffersToR2({
      rows: [row()],
      lastSyncedAt: 2,
      previous: first.state,
      now: 2000,
      put: recorder().put,
    });
    expect(Object.keys(result.state.hashes)).toEqual(['34']);
  });
});

describe('publishContractOffersToR2 bundles', () => {
  const bpRows = [row(), row({ contractId: 2, typeId: 999, isBlueprintCopy: true, me: 1, te: 2 })];

  it('uploads the bundle shards after the types and names them in the index', async () => {
    const puts: Put[] = [];
    let index: { bundles?: { blueprints: string[]; others: string[] } } | null = null;
    const result = await publishContractOffersToR2({
      rows: bpRows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: async (key, body, headers) => {
        puts.push({ key, headers });
        if (key === INDEX_KEY) index = JSON.parse(String(body));
      },
    });
    const bundles = bundlePuts(puts);
    expect(bundles.map((p) => p.key.split('/').at(-1)!.split('.')[0]).sort()).toEqual([
      'blueprints',
      'others',
    ]);
    expect(bundles[0].headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    const keys = puts.map((p) => p.key);
    expect(Math.min(...bundles.map((p) => keys.indexOf(p.key)))).toBeGreaterThan(
      Math.max(...typePuts(puts).map((p) => keys.indexOf(p.key)))
    );
    expect(keys.at(-1)).toBe(INDEX_KEY);
    expect(index!.bundles!.blueprints).toHaveLength(1);
    expect(index!.bundles!.others).toHaveLength(1);
    expect(result.bundlesWritten).toBe(true);
    expect(result.state.bundles).toEqual([
      ...index!.bundles!.blueprints,
      ...index!.bundles!.others,
    ]);
  });

  it('skips unchanged shards on the next publish but still names them', async () => {
    const first = await publishContractOffersToR2({
      rows: bpRows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
    });
    const { puts, put } = recorder();
    const result = await publishContractOffersToR2({
      rows: bpRows,
      lastSyncedAt: 2,
      previous: first.state,
      now: 2000,
      put,
    });
    expect(bundlePuts(puts)).toHaveLength(0);
    expect(result.bundlesWritten).toBe(true);
    expect(result.state.bundles).toEqual(first.state.bundles);
  });

  it('still writes the index, without bundles, when a shard upload fails', async () => {
    let index: { bundles?: unknown } | null = null;
    const result = await publishContractOffersToR2({
      rows: bpRows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: async (key, body) => {
        if (key.startsWith('contract-offers/bundles/')) throw new Error('boom');
        if (key === INDEX_KEY) index = JSON.parse(String(body));
      },
    });
    expect(result.indexWritten).toBe(true);
    expect(result.bundlesWritten).toBe(false);
    expect(index!.bundles).toBeUndefined();
    expect(result.state.bundles).toEqual([]);
    expect(result.firstError).toContain('boom');
    expect(r2PublishOutcome(result).kind).toBe('complete');
  });

  it('uploads no shard while the types are incomplete', async () => {
    const { puts, put } = recorder((key) => key.includes('/types/34.'));
    const result = await publishContractOffersToR2({
      rows: bpRows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put,
    });
    expect(bundlePuts(puts)).toHaveLength(0);
    expect(result.bundlesWritten).toBe(false);
  });
});

describe('publishContractOffersToR2 failed refresh', () => {
  it('resumes from recorded hashes instead of re-uploading everything', async () => {
    const first = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
    });
    const due = 1000 + REFRESH_AFTER_MS;
    const partial = await publishContractOffersToR2({
      rows,
      lastSyncedAt: 2,
      previous: first.state,
      now: due,
      put: recorder((key) => key.includes('/35.')).put,
    });
    expect(partial.firstError).toContain('boom');
    expect(partial.state.fullUploadAt).toBeNull();
    const retry = recorder();
    await publishContractOffersToR2({
      rows,
      lastSyncedAt: 2,
      previous: partial.state,
      now: due + 1800_000,
      put: retry.put,
    });
    expect(typePuts(retry.puts)).toHaveLength(1);
  });
});

describe('publishContractOffersToR2 time budget', () => {
  const many = [34, 35, 36].map((typeId) => row({ typeId }));

  /** A clock that advances 100 ms per reading, so a 150 ms budget admits a bounded number of starts. */
  const ticking = () => {
    let t = 0;
    return () => (t += 100);
  };

  it('stops starting uploads once the budget is spent, keeps partial hashes, and holds the index', async () => {
    const { puts, put } = recorder();
    const result = await publishContractOffersToR2({
      rows: many,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put,
      budgetMs: 150,
      clock: ticking(),
    });
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.uploaded + result.remaining).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.indexWritten).toBe(false);
    expect(puts.some((p) => p.key === INDEX_KEY)).toBe(false);
    expect(Object.keys(result.state.hashes)).toHaveLength(result.uploaded);
    expect(result.state.fullUploadAt).toBeNull();
  });

  it('resumes from the partial state and finishes with the index last', async () => {
    const first = await publishContractOffersToR2({
      rows: many,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
      budgetMs: 150,
      clock: ticking(),
    });
    const retry = recorder();
    const second = await publishContractOffersToR2({
      rows: many,
      lastSyncedAt: 1,
      previous: first.state,
      now: 2000,
      put: retry.put,
    });
    expect(typePuts(retry.puts)).toHaveLength(first.remaining);
    expect(second).toMatchObject({ remaining: 0, failed: 0, indexWritten: true });
    expect(retry.puts.at(-1)!.key).toBe(INDEX_KEY);
    expect(second.state.fullUploadAt).toBe(2000);
  });

  it('flushes progress every PROGRESS_FLUSH_EVERY uploads', async () => {
    const flushed: number[] = [];
    const bulk = Array.from({ length: PROGRESS_FLUSH_EVERY + 5 }, (_, i) =>
      row({ typeId: 1000 + i })
    );
    await publishContractOffersToR2({
      rows: bulk,
      lastSyncedAt: 1,
      previous: null,
      now: 1000,
      put: recorder().put,
      onProgress: async (state) => {
        flushed.push(Object.keys(state.hashes).length);
      },
    });
    expect(flushed).toEqual([PROGRESS_FLUSH_EVERY]);
  });
});

describe('r2PublishOutcome', () => {
  it('is complete once the index is written', () => {
    expect(
      r2PublishOutcome({ failed: 0, remaining: 0, indexWritten: true, firstError: null })
    ).toEqual({ kind: 'complete' });
  });

  it('fails when an object upload failed, naming the first error', () => {
    expect(
      r2PublishOutcome({ failed: 2, remaining: 0, indexWritten: false, firstError: 'boom' })
    ).toEqual({ kind: 'failed', error: '2 objects failed; first error: boom' });
  });

  it('fails when only the index write failed', () => {
    expect(
      r2PublishOutcome({ failed: 0, remaining: 0, indexWritten: false, firstError: 'denied' })
    ).toEqual({
      kind: 'failed',
      error: 'index not written; first error: denied',
    });
  });

  it('is resumable, not failed, when the time budget ran out', () => {
    expect(
      r2PublishOutcome({ failed: 0, remaining: 40, indexWritten: false, firstError: null })
    ).toEqual({ kind: 'resumable', remaining: 40 });
  });

  it('reads a courier result, which has no per-object counts', () => {
    expect(r2PublishOutcome({ indexWritten: true, firstError: null })).toEqual({
      kind: 'complete',
    });
    expect(r2PublishOutcome({ indexWritten: false, firstError: 'boom' })).toEqual({
      kind: 'failed',
      error: 'index not written; first error: boom',
    });
  });
});

describe('publicContractsRunVerdict', () => {
  const complete = { kind: 'complete' } as const;

  it('stores the fingerprint only when both snapshots published completely', () => {
    expect(publicContractsRunVerdict(complete, complete)).toEqual({
      error: null,
      storeFingerprint: true,
    });
  });

  it('fails the run naming every failed snapshot, and stores no fingerprint', () => {
    expect(
      publicContractsRunVerdict({ kind: 'failed', error: 'a' }, { kind: 'failed', error: 'b' })
    ).toEqual({
      error: 'Public contracts R2 publish failed — courier: a; offers: b',
      storeFingerprint: false,
    });
  });

  it('fails the run when only one snapshot failed', () => {
    expect(publicContractsRunVerdict(complete, { kind: 'failed', error: 'b' })).toEqual({
      error: 'Public contracts R2 publish failed — offers: b',
      storeFingerprint: false,
    });
  });

  it('does not fail a budget-cut run, but leaves the fingerprint for the next run to resume', () => {
    expect(publicContractsRunVerdict(complete, { kind: 'resumable', remaining: 9 })).toEqual({
      error: null,
      storeFingerprint: false,
    });
  });
});

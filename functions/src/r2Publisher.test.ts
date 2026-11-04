import { describe, expect, it } from 'vitest';
import {
  publishContractOffersToR2,
  r2PublishOutcome,
  publicContractsRunVerdict,
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

/** One plain type and one blueprint type, so the two groups get a shard each. */
const rows = [row(), row({ contractId: 2, typeId: 999, isBlueprintCopy: true, me: 1, te: 2 })];
const INDEX_KEY = 'contract-offers/index.json';
const shardPuts = (puts: Put[]) => puts.filter((p) => p.key.startsWith('contract-offers/bundles/'));

interface WrittenIndex {
  types: Record<string, { objects: string[] }>;
  bundles: { blueprints: string[]; others: string[] };
}

/** A put that records keys and keeps the last index written. */
function indexRecorder(failOn?: (key: string) => boolean) {
  const puts: Put[] = [];
  let index: WrittenIndex | null = null;
  const put: R2Put = async (key, body, headers) => {
    if (failOn?.(key)) throw new Error('boom');
    puts.push({ key, headers });
    if (key === INDEX_KEY) index = JSON.parse(String(body)) as WrittenIndex;
  };
  return { puts, put, index: () => index };
}

const publish = (over: Partial<Parameters<typeof publishContractOffersToR2>[0]> = {}) =>
  publishContractOffersToR2({
    rows,
    lastSyncedAt: 1,
    previous: null,
    now: 1000,
    put: recorder().put,
    ...over,
  });

describe('publishContractOffersToR2', () => {
  it('uploads the shards then index.json last, with the right headers, and no per-type objects', async () => {
    const { puts, put, index } = indexRecorder();
    const result = await publish({ put });
    expect(shardPuts(puts)).toHaveLength(2);
    expect(puts.some((p) => p.key.startsWith('contract-offers/types/'))).toBe(false);
    expect(puts.at(-1)!.key).toBe(INDEX_KEY);
    expect(shardPuts(puts)[0].headers).toMatchObject({
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(puts.at(-1)!.headers['Cache-Control']).toBe('public, max-age=60');
    expect(puts.at(-1)!.headers['Content-Encoding']).toBeUndefined();
    expect(result).toMatchObject({ uploaded: 2, skipped: 0, failed: 0, indexWritten: true });
    expect(result.state.fullUploadAt).toBe(1000);
    expect(result.state.bundles).toEqual([
      ...index()!.bundles.blueprints,
      ...index()!.bundles.others,
    ]);
  });

  it("names each type's own shard in the index", async () => {
    const { put, index } = indexRecorder();
    await publish({ put });
    expect(index()!.types['34'].objects).toEqual(index()!.bundles.others);
    expect(index()!.types['999'].objects).toEqual(index()!.bundles.blueprints);
  });

  it('uploads only index.json when nothing changed', async () => {
    const first = await publish();
    const { puts, put } = recorder();
    const result = await publish({ lastSyncedAt: 2, previous: first.state, now: 2000, put });
    expect(puts.map((p) => p.key)).toEqual([INDEX_KEY]);
    expect(result).toMatchObject({ uploaded: 0, skipped: 2, indexWritten: true });
  });

  it('uploads just the shard whose rows changed', async () => {
    const first = await publish();
    const { puts, put, index } = indexRecorder();
    await publish({
      rows: [row({ price: 101 }), rows[1]],
      lastSyncedAt: 2,
      previous: first.state,
      now: 2000,
      put,
    });
    expect(shardPuts(puts).map((p) => p.key)).toEqual(index()!.bundles.others);
    expect(index()!.bundles.blueprints).toEqual(
      first.state.bundles.filter((name) => name.includes('/blueprints.'))
    );
  });

  it('re-uploads every shard once the refresh interval passes, so a lifecycle rule cannot expire live objects', async () => {
    const first = await publish();
    const { puts, put } = recorder();
    const result = await publish({
      lastSyncedAt: 2,
      previous: first.state,
      now: 1000 + REFRESH_AFTER_MS,
      put,
    });
    expect(shardPuts(puts)).toHaveLength(2);
    expect(result.state.fullUploadAt).toBe(1000 + REFRESH_AFTER_MS);
  });

  it('on a shard failure holds index.json back and uploads the missing shard next time', async () => {
    const failing = recorder((key) => key.includes('/bundles/others.'));
    const result = await publish({ put: failing.put });
    expect(result).toMatchObject({ uploaded: 1, failed: 1, indexWritten: false });
    expect(result.firstError).toContain('boom');
    expect(failing.puts.map((p) => p.key)).not.toContain(INDEX_KEY);
    expect(result.state.fullUploadAt).toBeNull();
    expect(r2PublishOutcome(result).kind).toBe('failed');

    const retry = recorder();
    await publish({ previous: result.state, now: 2000, put: retry.put });
    expect(shardPuts(retry.puts)).toHaveLength(2);
    expect(retry.puts.at(-1)!.key).toBe(INDEX_KEY);
  });

  it('keeps the shards of the last index it wrote when a later one is held back', async () => {
    const first = await publish();
    const result = await publish({
      rows: [row({ price: 101 }), rows[1]],
      previous: first.state,
      now: 2000,
      put: recorder((key) => key.includes('/bundles/')).put,
    });
    expect(result.indexWritten).toBe(false);
    expect(result.state.bundles).toEqual(first.state.bundles);
    expect(result.state.fullUploadAt).toBe(1000);
  });

  it('reports a failed index write without throwing', async () => {
    const result = await publish({ put: recorder((key) => key === INDEX_KEY).put });
    expect(result).toMatchObject({ uploaded: 2, failed: 0, indexWritten: false });
  });
});

describe('r2PublishOutcome', () => {
  it('is complete once the index is written', () => {
    expect(r2PublishOutcome({ failed: 0, indexWritten: true, firstError: null })).toEqual({
      kind: 'complete',
    });
  });

  it('fails when an object upload failed, naming the first error', () => {
    expect(r2PublishOutcome({ failed: 2, indexWritten: false, firstError: 'boom' })).toEqual({
      kind: 'failed',
      error: '2 objects failed; first error: boom',
    });
  });

  it('fails when only the index write failed', () => {
    expect(r2PublishOutcome({ failed: 0, indexWritten: false, firstError: 'denied' })).toEqual({
      kind: 'failed',
      error: 'index not written; first error: denied',
    });
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
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import {
  loadR2AllRows,
  loadR2BlueprintRows,
  loadR2OfferIndex,
  loadR2TypeRows,
  parseR2OfferIndex,
  resetR2ObjectMemo,
  type R2OfferIndex,
} from './r2OfferSnapshot';

const ORIGIN = 'https://data.neocomdesk.com';
const INDEX_URL = `${ORIGIN}/contract-offers/index.json`;
const obj = (typeId: number, hash: string, region = '') =>
  `contract-offers/types/${typeId}.${region}${hash}.json`;
const row = (typeId: number, contractId: number) => ({ typeId, contractId });

const INDEX: R2OfferIndex = {
  lastSyncedAt: 100,
  types: {
    '34': { count: 1, cheapest: 10, objects: [obj(34, 'aaaa')] },
    '35': { count: 2, cheapest: 20, objects: [obj(35, 'bbbb', 'r1.'), obj(35, 'bbbb', 'r2.')] },
  },
  regionIds: [10000002],
};

const bundle = (group: string, shard: number) =>
  `contract-offers/bundles/${group}.${shard}.ffff.json`;
const BUNDLES = {
  blueprints: [bundle('blueprints', 0)],
  others: [bundle('others', 0), bundle('others', 1)],
};

/** Serves each URL's body; anything else is a 404. */
function serve(files: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url in files) return new Response(JSON.stringify(files[url]), { status: 200 });
    return new Response('missing', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const urlsRead = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.map(([url]) => String(url).replace(`${ORIGIN}/`, ''));

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  resetR2ObjectMemo();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseR2OfferIndex', () => {
  it('accepts the index the writer produces', () => {
    expect(parseR2OfferIndex(INDEX)).toEqual(INDEX);
  });

  it.each([
    ['not an object', 'nope'],
    ['no lastSyncedAt', { ...INDEX, lastSyncedAt: undefined }],
    ['a zero lastSyncedAt', { ...INDEX, lastSyncedAt: 0 }],
    [
      'a type naming no objects',
      { ...INDEX, types: { '34': { count: 1, cheapest: 1, objects: [] } } },
    ],
    [
      'an object name outside the types prefix',
      { ...INDEX, types: { '34': { count: 1, cheapest: 1, objects: ['../secrets.json'] } } },
    ],
    [
      'a non-numeric type key',
      { ...INDEX, types: { abc: { count: 1, cheapest: 1, objects: [obj(34, 'aaaa')] } } },
    ],
    ['regionIds that are not numbers', { ...INDEX, regionIds: ['x'] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseR2OfferIndex(raw)).toBeNull();
  });

  it('keeps the bundle shard names the writer adds', () => {
    const withBundles = { ...INDEX, bundles: BUNDLES };
    expect(parseR2OfferIndex(withBundles)).toEqual(withBundles);
  });

  it.each([
    ['a name outside the bundles prefix', { blueprints: ['../x.json'], others: [] }],
    ['a missing group', { blueprints: [] }],
    ['not an object', 'nope'],
  ])('drops bundles with %s but keeps the index', (_label, bundles) => {
    expect(parseR2OfferIndex({ ...INDEX, bundles })).toEqual(INDEX);
  });
});

describe('loadR2OfferIndex', () => {
  it('reads and returns the index', async () => {
    serve({ [INDEX_URL]: INDEX });
    expect((await loadR2OfferIndex())?.data).toEqual(INDEX);
  });

  it('is null when R2 is unreachable and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));
    expect(await loadR2OfferIndex()).toBeNull();
  });

  it('is null when the index is missing', async () => {
    serve({});
    expect(await loadR2OfferIndex()).toBeNull();
  });

  it('is null when the index is not the expected shape', async () => {
    serve({ [INDEX_URL]: { lastSyncedAt: 'yesterday' } });
    expect(await loadR2OfferIndex()).toBeNull();
  });
});

describe('loadR2TypeRows', () => {
  const files = {
    [`${ORIGIN}/${obj(34, 'aaaa')}`]: [row(34, 1)],
    [`${ORIGIN}/${obj(35, 'bbbb', 'r1.')}`]: [row(35, 2)],
    [`${ORIGIN}/${obj(35, 'bbbb', 'r2.')}`]: [row(35, 3)],
  };

  it('reads only the objects the index names for the asked types', async () => {
    const fetchMock = serve(files);
    const rows = await loadR2TypeRows(INDEX, [34]);
    expect(rows).toEqual([row(34, 1)]);
    expect(urlsRead(fetchMock)).toEqual([obj(34, 'aaaa')]);
  });

  it('keeps the requested-side flags a row carries', async () => {
    const flagged = { ...row(34, 1), requestedPlex: 10, requestsItems: true };
    serve({ [`${ORIGIN}/${obj(34, 'aaaa')}`]: [flagged] });
    expect(await loadR2TypeRows(INDEX, [34])).toEqual([flagged]);
  });

  it('joins every region part of a split type', async () => {
    serve(files);
    expect(await loadR2TypeRows(INDEX, [35])).toEqual([row(35, 2), row(35, 3)]);
  });

  it('ignores a type the index does not list', async () => {
    const fetchMock = serve(files);
    expect(await loadR2TypeRows(INDEX, [999])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses an object while the index still names it', async () => {
    const fetchMock = serve(files);
    await loadR2TypeRows(INDEX, [34]);
    await loadR2TypeRows(INDEX, [34, 35]);
    expect(urlsRead(fetchMock).filter((name) => name === obj(34, 'aaaa'))).toHaveLength(1);
  });

  it('reads a new object once a later publish names it instead', async () => {
    const fetchMock = serve({ ...files, [`${ORIGIN}/${obj(34, 'cccc')}`]: [row(34, 9)] });
    await loadR2TypeRows(INDEX, [34]);
    const next: R2OfferIndex = {
      ...INDEX,
      lastSyncedAt: 200,
      types: { ...INDEX.types, '34': { count: 1, cheapest: 10, objects: [obj(34, 'cccc')] } },
    };
    expect(await loadR2TypeRows(next, [34])).toEqual([row(34, 9)]);
    expect(urlsRead(fetchMock)).toEqual([obj(34, 'aaaa'), obj(34, 'cccc')]);
  });

  it('is null when an object holds rows without the fields consumers read', async () => {
    serve({ [`${ORIGIN}/${obj(34, 'aaaa')}`]: [null, { typeId: 'x' }] });
    expect(await loadR2TypeRows(INDEX, [34])).toBeNull();
  });

  it('is null, not partial rows, when any object cannot be read', async () => {
    serve({ [`${ORIGIN}/${obj(34, 'aaaa')}`]: [row(34, 1)] });
    expect(await loadR2TypeRows(INDEX, [34, 35])).toBeNull();
  });

  it('retries an object that failed instead of remembering the failure', async () => {
    serve({});
    expect(await loadR2TypeRows(INDEX, [34])).toBeNull();
    serve(files);
    expect(await loadR2TypeRows(INDEX, [34])).toEqual([row(34, 1)]);
  });
});

describe('loadR2AllRows', () => {
  const typeFiles = {
    [`${ORIGIN}/${obj(34, 'aaaa')}`]: [row(34, 1)],
    [`${ORIGIN}/${obj(35, 'bbbb', 'r1.')}`]: [row(35, 2)],
    [`${ORIGIN}/${obj(35, 'bbbb', 'r2.')}`]: [row(35, 3)],
  };
  const bundleFiles = {
    [`${ORIGIN}/${bundle('blueprints', 0)}`]: [row(999, 4)],
    [`${ORIGIN}/${bundle('others', 0)}`]: [row(34, 1)],
    [`${ORIGIN}/${bundle('others', 1)}`]: [row(35, 2), row(35, 3)],
  };

  it('reads the bundle shards instead of every type when the index names them', async () => {
    const fetchMock = serve(bundleFiles);
    const rows = await loadR2AllRows({ ...INDEX, bundles: BUNDLES });
    expect(rows).toEqual([row(999, 4), row(34, 1), row(35, 2), row(35, 3)]);
    expect(urlsRead(fetchMock).sort()).toEqual([...BUNDLES.blueprints, ...BUNDLES.others].sort());
  });

  it('falls back to every type object for an index without bundles', async () => {
    serve(typeFiles);
    expect(await loadR2AllRows(INDEX)).toEqual([row(34, 1), row(35, 2), row(35, 3)]);
  });

  it('is null when a shard cannot be read', async () => {
    serve({ [`${ORIGIN}/${bundle('blueprints', 0)}`]: [row(999, 4)] });
    expect(await loadR2AllRows({ ...INDEX, bundles: BUNDLES })).toBeNull();
  });
});

describe('loadR2BlueprintRows', () => {
  it('reads only the blueprints shards, keeping the asked types', async () => {
    const fetchMock = serve({
      [`${ORIGIN}/${bundle('blueprints', 0)}`]: [row(999, 4), row(1000, 5)],
    });
    const rows = await loadR2BlueprintRows({ ...INDEX, bundles: BUNDLES }, [999]);
    expect(rows).toEqual([row(999, 4)]);
    expect(urlsRead(fetchMock)).toEqual(BUNDLES.blueprints);
  });

  it('falls back to the asked types objects for an index without bundles', async () => {
    const fetchMock = serve({ [`${ORIGIN}/${obj(34, 'aaaa')}`]: [row(34, 1)] });
    expect(await loadR2BlueprintRows(INDEX, [34])).toEqual([row(34, 1)]);
    expect(urlsRead(fetchMock)).toEqual([obj(34, 'aaaa')]);
  });
});

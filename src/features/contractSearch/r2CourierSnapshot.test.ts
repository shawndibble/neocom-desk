import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseR2CourierIndex, readR2CourierSnapshot } from './r2CourierSnapshot';

const ORIGIN = 'https://data.neocomdesk.com';
const OBJECT = 'courier-contracts/rows.0123abcd.json';
const INDEX = { lastSyncedAt: 100, count: 2, object: OBJECT };
const ROWS = [{ contractId: 1 }, { contractId: 2 }];

function serve(files: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) =>
    url in files
      ? new Response(JSON.stringify(files[url]), { status: 200 })
      : new Response('missing', { status: 404 })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseR2CourierIndex', () => {
  it('accepts the index the writer produces', () => {
    expect(parseR2CourierIndex(INDEX)).toEqual(INDEX);
  });

  it.each([
    ['not an object', 'nope'],
    ['no lastSyncedAt', { ...INDEX, lastSyncedAt: undefined }],
    ['a zero lastSyncedAt', { ...INDEX, lastSyncedAt: 0 }],
    ['no count', { ...INDEX, count: undefined }],
    [
      'an object name outside the courier prefix',
      { ...INDEX, object: 'contract-offers/types/1.a.json' },
    ],
    ['a path-escaping object name', { ...INDEX, object: 'courier-contracts/rows.../../x.json' }],
  ])('rejects %s', (_label, raw) => {
    expect(parseR2CourierIndex(raw)).toBeNull();
  });
});

describe('readR2CourierSnapshot', () => {
  it('reads the index, then the object it names', async () => {
    const fetchMock = serve({
      [`${ORIGIN}/courier-contracts/index.json`]: INDEX,
      [`${ORIGIN}/${OBJECT}`]: ROWS,
    });
    expect(await readR2CourierSnapshot()).toEqual({ rows: ROWS, lastSyncedAt: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves an empty snapshot', async () => {
    serve({
      [`${ORIGIN}/courier-contracts/index.json`]: { ...INDEX, count: 0 },
      [`${ORIGIN}/${OBJECT}`]: [],
    });
    expect(await readR2CourierSnapshot()).toEqual({ rows: [], lastSyncedAt: 100 });
  });

  it('is null when R2 has no index', async () => {
    serve({});
    expect(await readR2CourierSnapshot()).toBeNull();
  });

  it('is null when the index names an object that cannot be read', async () => {
    serve({ [`${ORIGIN}/courier-contracts/index.json`]: INDEX });
    expect(await readR2CourierSnapshot()).toBeNull();
  });

  it('is null when the object holds fewer rows than the index counts', async () => {
    serve({
      [`${ORIGIN}/courier-contracts/index.json`]: INDEX,
      [`${ORIGIN}/${OBJECT}`]: [{ contractId: 1 }],
    });
    expect(await readR2CourierSnapshot()).toBeNull();
  });

  it('is null when the object holds bad rows', async () => {
    serve({
      [`${ORIGIN}/courier-contracts/index.json`]: INDEX,
      [`${ORIGIN}/${OBJECT}`]: [{ nope: true }],
    });
    expect(await readR2CourierSnapshot()).toBeNull();
  });

  it('is null when the network is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('blocked')));
    expect(await readR2CourierSnapshot()).toBeNull();
  });
});

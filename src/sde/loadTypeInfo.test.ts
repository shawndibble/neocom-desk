import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { TypeInfoShard } from './typeInfoShard';

const fetchMock = vi.fn<typeof fetch>();

const RIFTER = 587;
/** Same shard as the Rifter (bucket 0: ids 0–1999). */
const SAME_SHARD = RIFTER + 32;

const shard: TypeInfoShard = {
  [String(RIFTER)]: {
    description: 'A rugged little frigate.',
    effects: [],
    attributes: [
      [9, 350],
      [161, 27289],
    ],
    volume: 27289,
  },
  [String(SAME_SHARD)]: { description: '', effects: [], attributes: [] },
};

function shardResponse(): Response {
  return new Response(JSON.stringify(shard));
}

beforeEach(() => {
  // Fresh module per test: shards are memoized for the whole session.
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadTypeInfo', () => {
  it("reads a type's record from its shard file", async () => {
    fetchMock.mockResolvedValueOnce(shardResponse());
    const { loadTypeInfo } = await import('./loadTypeInfo');

    expect(await loadTypeInfo(RIFTER)).toEqual(shard[String(RIFTER)]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('data/typeInfo/0.json');
  });

  it('returns null for a type its shard does not carry (unpublished, or newer than the build)', async () => {
    fetchMock.mockResolvedValueOnce(shardResponse());
    const { loadTypeInfo } = await import('./loadTypeInfo');

    expect(await loadTypeInfo(RIFTER + 64)).toBeNull();
  });

  it('fetches a shard once for every type in it', async () => {
    fetchMock.mockImplementation(async () => shardResponse());
    const { loadTypeInfo } = await import('./loadTypeInfo');

    await loadTypeInfo(RIFTER);
    await loadTypeInfo(SAME_SHARD);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await loadTypeInfo(RIFTER + 2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null without a fetch for an id past the last shard, so ESI answers', async () => {
    const { loadTypeInfo } = await import('./loadTypeInfo');

    expect(await loadTypeInfo(1_000_000)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the shard cannot be fetched, and retries on the next call', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce(shardResponse());
    const { loadTypeInfo } = await import('./loadTypeInfo');

    await expect(loadTypeInfo(RIFTER)).rejects.toThrow();
    expect(await loadTypeInfo(RIFTER)).toEqual(shard[String(RIFTER)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

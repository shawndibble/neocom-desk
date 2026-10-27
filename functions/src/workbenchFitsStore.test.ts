import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { R2Put } from './r2Client.js';
import type { StoredWorkbenchFit } from './workbenchFits.js';
import { WORKBENCH_SYNC_STATE_R2_KEY } from './workbenchFits.js';
import { r2WorkbenchHulls, r2WorkbenchStore } from './workbenchFitsStore.js';

function fit(id: string, dateAdded: number): StoredWorkbenchFit {
  return { id, name: id, authorId: 1, authorName: 'Pilot', dateAdded, eft: `[Vexor, ${id}]` };
}

function fakeR2(stored: Record<string, unknown> = {}) {
  const puts: Array<{ key: string; json: unknown; headers: Record<string, string> }> = [];
  const gets: string[] = [];
  const get = async (key: string) => {
    gets.push(key);
    return key in stored ? stored[key] : null;
  };
  const put: R2Put = async (key, body, headers) => {
    const raw = typeof body === 'string' ? body : gunzipSync(body).toString('utf8');
    puts.push({ key, json: JSON.parse(raw), headers });
  };
  return { get, put, puts, gets };
}

describe('r2WorkbenchHulls', () => {
  it('writes one gzip object per hull, keyed by hull id, with a cache life under the 12h cadence', async () => {
    const r2 = fakeR2();
    await r2WorkbenchHulls(r2).writeHull(626, [fit('a', 2), fit('b', 1)]);
    expect(r2.puts).toHaveLength(1);
    expect(r2.puts[0].key).toBe('workbench-fits/626.json');
    expect(r2.puts[0].json).toEqual({ shipTypeId: 626, fits: [fit('a', 2), fit('b', 1)] });
    expect(r2.puts[0].headers).toMatchObject({
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=21600',
    });
  });

  it('reads a hull back by its key, and a missing object as no fits', async () => {
    const r2 = fakeR2({ 'workbench-fits/626.json': { shipTypeId: 626, fits: [fit('a', 2)] } });
    const hulls = r2WorkbenchHulls(r2);
    expect(await hulls.readHull(626)).toEqual([fit('a', 2)]);
    expect(await hulls.readHull(627)).toEqual([]);
    expect(r2.gets).toEqual(['workbench-fits/626.json', 'workbench-fits/627.json']);
  });

  it('drops malformed rows from a stored object rather than failing the run', async () => {
    const r2 = fakeR2({
      'workbench-fits/626.json': {
        fits: [fit('a', 2), { id: 7 }, null, { ...fit('b', 1), eft: 3 }],
      },
      'workbench-fits/627.json': 'garbage',
    });
    const hulls = r2WorkbenchHulls(r2);
    expect(await hulls.readHull(626)).toEqual([fit('a', 2)]);
    expect(await hulls.readHull(627)).toEqual([]);
  });
});

describe('r2WorkbenchStore state', () => {
  const head = { ids: ['a', 'b'], dateAdded: 5 };

  it('reads a fresh start when no checkpoint object exists', async () => {
    expect(await r2WorkbenchStore(fakeR2()).readState()).toEqual({ boundary: null, pass: null });
  });

  it('saves the checkpoint as an uncached R2 object and reads it back', async () => {
    const r2 = fakeR2();
    const state = { boundary: head, pass: { nextPage: 7, head: { ids: ['c'], dateAdded: 9 } } };
    await r2WorkbenchStore(r2).saveState(state);
    expect(r2.puts[0].key).toBe(WORKBENCH_SYNC_STATE_R2_KEY);
    expect(r2.puts[0].json).toMatchObject(state);
    expect(r2.puts[0].headers['Cache-Control']).toBe('no-store');
    const back = await r2WorkbenchStore(
      fakeR2({ [WORKBENCH_SYNC_STATE_R2_KEY]: r2.puts[0].json })
    ).readState();
    expect(back).toEqual(state);
  });

  it('treats a malformed checkpoint as a fresh start', async () => {
    const bad = { boundary: { ids: 'x' }, pass: { nextPage: 0, head } };
    expect(
      await r2WorkbenchStore(fakeR2({ [WORKBENCH_SYNC_STATE_R2_KEY]: bad })).readState()
    ).toEqual({ boundary: null, pass: null });
  });
});

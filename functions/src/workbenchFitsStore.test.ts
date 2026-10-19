import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { R2Put } from './r2Client.js';
import type { StoredWorkbenchFit } from './workbenchFits.js';
import { migrateLegacyWorkbenchFits, r2WorkbenchHulls } from './workbenchFitsStore.js';

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

describe('migrateLegacyWorkbenchFits', () => {
  function flag(initial = false) {
    const state = { migrated: initial, reads: 0 };
    return {
      state,
      isMigrated: async () => state.migrated,
      markMigrated: async () => {
        state.migrated = true;
      },
    };
  }

  it('copies the Firestore hull parts into one R2 object per hull, once', async () => {
    const r2 = fakeR2({ 'workbench-fits/627.json': { shipTypeId: 627, fits: [fit('z', 9)] } });
    const f = flag();
    const legacy = [
      { shipTypeId: 626, part: 0, parts: 2, fits: [fit('b', 2)] },
      { shipTypeId: 626, part: 1, fits: [fit('a', 1), { id: 'broken' }] },
      { shipTypeId: 627, part: 0, parts: 1, fits: [fit('y', 3)] },
      { part: 0, fits: [fit('orphan', 1)] },
    ];
    const deps = {
      isMigrated: f.isMigrated,
      markMigrated: f.markMigrated,
      readLegacyParts: async () => {
        f.state.reads += 1;
        return legacy;
      },
      hulls: r2WorkbenchHulls(r2),
    };

    expect(await migrateLegacyWorkbenchFits(deps)).toEqual({ migrated: true, hulls: 2, fits: 3 });
    const byKey = Object.fromEntries(r2.puts.map((p) => [p.key, p.json]));
    expect(byKey['workbench-fits/626.json']).toEqual({
      shipTypeId: 626,
      fits: [fit('b', 2), fit('a', 1)],
    });
    // Merged with what the R2 sync already wrote, never overwriting it.
    expect(byKey['workbench-fits/627.json']).toEqual({
      shipTypeId: 627,
      fits: [fit('z', 9), fit('y', 3)],
    });
    expect(f.state.migrated).toBe(true);

    r2.puts.length = 0;
    expect(await migrateLegacyWorkbenchFits(deps)).toEqual({ migrated: false });
    expect(f.state.reads).toBe(1);
    expect(r2.puts).toEqual([]);
  });

  it('marks an empty collection migrated without writing anything', async () => {
    const r2 = fakeR2();
    const f = flag();
    const result = await migrateLegacyWorkbenchFits({
      isMigrated: f.isMigrated,
      markMigrated: f.markMigrated,
      readLegacyParts: async () => [],
      hulls: r2WorkbenchHulls(r2),
    });
    expect(result).toEqual({ migrated: true, hulls: 0, fits: 0 });
    expect(r2.puts).toEqual([]);
    expect(f.state.migrated).toBe(true);
  });
});

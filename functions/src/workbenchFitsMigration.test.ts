import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { R2Put } from './r2Client.js';
import type { StoredWorkbenchFit } from './workbenchFits.js';
import { migrateLegacyWorkbenchFits } from './workbenchFitsMigration.js';
import { r2WorkbenchHulls } from './workbenchFitsStore.js';

function fit(id: string, dateAdded: number): StoredWorkbenchFit {
  return { id, name: id, authorId: 1, authorName: 'Pilot', dateAdded, eft: `[Vexor, ${id}]` };
}

function fakeR2(stored: Record<string, unknown> = {}) {
  const puts: Array<{ key: string; json: unknown }> = [];
  const get = async (key: string) => (key in stored ? stored[key] : null);
  const put: R2Put = async (key, body) => {
    const raw = typeof body === 'string' ? body : gunzipSync(body).toString('utf8');
    puts.push({ key, json: JSON.parse(raw) });
    stored[key] = JSON.parse(raw);
  };
  return { get, put, puts };
}

function legacy(parts: unknown[], reads: { count: number }) {
  return async function* () {
    reads.count += 1;
    yield* parts;
  };
}

function flag() {
  const state = { migrated: false };
  return {
    state,
    isMigrated: async () => state.migrated,
    markMigrated: async () => {
      state.migrated = true;
    },
  };
}

describe('migrateLegacyWorkbenchFits', () => {
  it('copies the Firestore hull parts into one R2 object per hull, once', async () => {
    const r2 = fakeR2({ 'workbench-fits/627.json': { shipTypeId: 627, fits: [fit('z', 9)] } });
    const f = flag();
    const reads = { count: 0 };
    const deps = {
      isMigrated: f.isMigrated,
      markMigrated: f.markMigrated,
      legacyParts: legacy(
        [
          { shipTypeId: 626, part: 1, fits: [fit('a', 1), { id: 'broken' }] },
          { shipTypeId: 626, part: 0, parts: 2, fits: [fit('b', 2), fit('a', 1)] },
          { shipTypeId: 627, part: 0, parts: 1, fits: [fit('y', 3)] },
          { part: 0, fits: [fit('orphan', 1)] },
        ],
        reads
      ),
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
    expect(reads.count).toBe(1);
    expect(r2.puts).toEqual([]);
  });

  it('merges a hull whose parts arrive apart instead of overwriting it', async () => {
    const r2 = fakeR2();
    const f = flag();
    await migrateLegacyWorkbenchFits({
      ...f,
      legacyParts: legacy(
        [
          { shipTypeId: 626, fits: [fit('a', 1)] },
          { shipTypeId: 627, fits: [fit('y', 3)] },
          { shipTypeId: 626, fits: [fit('b', 2)] },
        ],
        { count: 0 }
      ),
      hulls: r2WorkbenchHulls(r2),
    });
    const last626 = r2.puts.filter((p) => p.key === 'workbench-fits/626.json').at(-1);
    expect(last626?.json).toEqual({ shipTypeId: 626, fits: [fit('b', 2), fit('a', 1)] });
  });

  it('leaves the flag unset when a write fails, so the next run retries', async () => {
    const f = flag();
    const failing = {
      readHull: async () => [],
      writeHull: async () => {
        throw new Error('R2 down');
      },
    };
    await expect(
      migrateLegacyWorkbenchFits({
        ...f,
        legacyParts: legacy([{ shipTypeId: 626, fits: [fit('a', 1)] }], { count: 0 }),
        hulls: failing,
      })
    ).rejects.toThrow('R2 down');
    expect(f.state.migrated).toBe(false);
  });

  it('marks an empty collection migrated without writing anything', async () => {
    const r2 = fakeR2();
    const f = flag();
    const result = await migrateLegacyWorkbenchFits({
      ...f,
      legacyParts: legacy([], { count: 0 }),
      hulls: r2WorkbenchHulls(r2),
    });
    expect(result).toEqual({ migrated: true, hulls: 0, fits: 0 });
    expect(r2.puts).toEqual([]);
    expect(f.state.migrated).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  chunkLibrary,
  isLibraryStale,
  libraryHash,
  planPush,
  selectSharedBlueprints,
  splitSharedBlueprints,
  LIBRARY_CHUNK_SIZE,
  LIBRARY_STALE_MS,
  LIBRARY_STAMP_REFRESH_MS,
  type SharedBlueprint,
} from './sharedLibrary';

const DAY = 24 * 60 * 60 * 1000;
const place = { locationName: 'Jita IV - Moon 4', systemName: 'Jita' };

const bp = (over: Partial<SharedBlueprint> = {}): SharedBlueprint => ({
  typeId: 100,
  me: 10,
  te: 20,
  runs: -1,
  ...place,
  ...over,
});

describe('selectSharedBlueprints', () => {
  const owned = [
    { type_id: 100, material_efficiency: 10, time_efficiency: 20, runs: -1, location_id: 1 },
    { type_id: 200, material_efficiency: 0, time_efficiency: 0, runs: 5, location_id: 2 },
    { type_id: 300, material_efficiency: 2, time_efficiency: 4, runs: 1, location_id: 3 },
  ];
  const placeOf = (b: { location_id: number }) => (b.location_id === 3 ? null : place);

  it('keeps only selected types', () => {
    const out = selectSharedBlueprints(owned, new Set([100]), placeOf);
    expect(out).toEqual([bp()]);
  });

  it('drops a blueprint whose station or structure is unknown (container, unresolved)', () => {
    expect(selectSharedBlueprints(owned, new Set([300]), placeOf)).toEqual([]);
  });

  it('shares nothing for an empty selection', () => {
    expect(selectSharedBlueprints(owned, new Set(), placeOf)).toEqual([]);
  });

  it('is sorted so input order does not change the list', () => {
    const a = selectSharedBlueprints(owned, new Set([100, 200]), placeOf);
    const b = selectSharedBlueprints([...owned].reverse(), new Set([100, 200]), placeOf);
    expect(a).toEqual(b);
  });

  it('carries only type, ME/TE, runs, station and system', () => {
    const [item] = selectSharedBlueprints(owned, new Set([100]), placeOf);
    expect(Object.keys(item!).sort()).toEqual(
      ['locationName', 'me', 'runs', 'systemName', 'te', 'typeId'].sort()
    );
  });
});

describe('splitSharedBlueprints', () => {
  const owned = [
    { type_id: 100, material_efficiency: 10, time_efficiency: 20, runs: -1, location_id: 1 },
    { type_id: 100, material_efficiency: 0, time_efficiency: 0, runs: 3, location_id: 3 },
    { type_id: 200, material_efficiency: 0, time_efficiency: 0, runs: 5, location_id: 3 },
    { type_id: 300, material_efficiency: 2, time_efficiency: 4, runs: 1, location_id: 3 },
  ];
  const placeOf = (b: { location_id: number }) => (b.location_id === 3 ? null : place);

  it('counts the selected blueprints it could not place, and shares the rest', () => {
    const { shared, skipped } = splitSharedBlueprints(owned, new Set([100, 200]), placeOf);
    expect(shared).toEqual([bp()]);
    expect(skipped).toBe(2);
  });

  it('does not count a blueprint that was never selected', () => {
    expect(splitSharedBlueprints(owned, new Set([100]), placeOf).skipped).toBe(1);
    expect(splitSharedBlueprints(owned, new Set(), placeOf)).toEqual({ shared: [], skipped: 0 });
  });
});

describe('libraryHash', () => {
  it('is stable for equal lists and differs when anything changes', () => {
    expect(libraryHash([bp()])).toBe(libraryHash([bp()]));
    expect(libraryHash([bp()])).not.toBe(libraryHash([bp({ me: 9 })]));
    expect(libraryHash([bp()])).not.toBe(libraryHash([bp({ locationName: 'Amarr' })]));
    expect(libraryHash([])).not.toBe(libraryHash([bp()]));
  });

  it('fits the 128 character rule cap', () => {
    expect(libraryHash([bp()]).length).toBeLessThanOrEqual(128);
  });
});

describe('chunkLibrary', () => {
  it('splits at the chunk size', () => {
    const items = Array.from({ length: LIBRARY_CHUNK_SIZE + 1 }, (_, i) => bp({ typeId: i }));
    const chunks = chunkLibrary(items);
    expect(chunks.map((c) => c.length)).toEqual([LIBRARY_CHUNK_SIZE, 1]);
  });

  it('makes no chunks for an empty list', () => {
    expect(chunkLibrary([])).toEqual([]);
  });
});

describe('isLibraryStale', () => {
  const now = 1_000 * DAY;
  it('is stale after 30 days', () => {
    expect(isLibraryStale(now - LIBRARY_STALE_MS - 1, now)).toBe(true);
    expect(isLibraryStale(now - LIBRARY_STALE_MS, now)).toBe(false);
  });
  it('is not stale with no stamp: nothing was ever shared', () => {
    expect(isLibraryStale(null, now)).toBe(false);
  });
});

describe('planPush', () => {
  const now = 1_000 * DAY;
  const items = [bp()];
  const hash = libraryHash(items);

  it('pushes the list when the hash differs', () => {
    expect(planPush({ hash: 'old', pushedAt: now }, hash, items.length, now)).toBe('full');
  });

  it('pushes a first library', () => {
    expect(planPush(null, hash, items.length, now)).toBe('full');
  });

  it('skips an unchanged, recently stamped list', () => {
    expect(planPush({ hash, pushedAt: now - DAY }, hash, items.length, now)).toBe('skip');
  });

  it('only refreshes the stamp on an unchanged list that is getting old', () => {
    expect(
      planPush({ hash, pushedAt: now - LIBRARY_STAMP_REFRESH_MS - 1 }, hash, items.length, now)
    ).toBe('stamp');
  });

  it('skips when nothing was ever shared and nothing is selected', () => {
    expect(planPush(null, libraryHash([]), 0, now)).toBe('skip');
  });

  it('clears a library the Member emptied', () => {
    expect(planPush({ hash, pushedAt: now }, libraryHash([]), 0, now)).toBe('full');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocMock, listMock, syncConfigured } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  listMock: vi.fn(),
  syncConfigured: { value: true },
}));
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: getDocMock,
  // Listing is denied by the rules: none of these may be reached.
  collection: listMock,
  query: listMock,
  where: listMock,
  getDocs: listMock,
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));

import {
  loadWorkbenchFits,
  mergeWorkbenchParts,
  resetWorkbenchFitsCache,
  workbenchPartCount,
  type WorkbenchFit,
} from './workbenchFits';

function fit(id: string, dateAdded: number): WorkbenchFit {
  return { id, name: id, authorId: 1, authorName: 'Pilot', dateAdded, eft: `[Vexor, ${id}]` };
}

/** A fake store of part docs by path; `getDoc` answers from it. */
function serve(parts: Record<string, unknown>) {
  getDocMock.mockImplementation(async (ref: { path: string }) => {
    const data = parts[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  });
}

function requested(): string[] {
  return getDocMock.mock.calls.map(([ref]) => (ref as { path: string }).path);
}

describe('mergeWorkbenchParts', () => {
  it('unions every part newest first, one per id, skipping malformed rows', () => {
    const merged = mergeWorkbenchParts([
      { fits: [fit('b', 2), fit('a', 1)] },
      { fits: [fit('c', 3), fit('a', 1), { id: 'x' }] },
      { fits: 'nope' },
    ]);
    expect(merged.map((f) => f.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('workbenchPartCount', () => {
  it('is 0 with no part 0, its parts count when valid, else 1 (written before the count)', () => {
    expect(workbenchPartCount(undefined)).toBe(0);
    expect(workbenchPartCount({ parts: 3, fits: [] })).toBe(3);
    expect(workbenchPartCount({ fits: [] })).toBe(1);
    expect(workbenchPartCount({ parts: 0 })).toBe(1);
    expect(workbenchPartCount({ parts: 1.5 })).toBe(1);
  });
});

describe('loadWorkbenchFits', () => {
  beforeEach(() => {
    resetWorkbenchFitsCache();
    getDocMock.mockReset();
    listMock.mockReset();
    syncConfigured.value = true;
  });

  it('reads part 0, then every part it claims by id, and caches the answer', async () => {
    serve({
      'workbenchFits/626_0': { part: 0, parts: 3, fits: [fit('c', 3)] },
      'workbenchFits/626_1': { part: 1, fits: [fit('b', 2)] },
      'workbenchFits/626_2': { part: 2, fits: [fit('a', 1), fit('b', 2)] },
    });
    const result = await loadWorkbenchFits(626, 1_000);
    expect(result).toEqual({ ok: true, fits: [fit('c', 3), fit('b', 2), fit('a', 1)] });
    expect(requested().sort()).toEqual([
      'workbenchFits/626_0',
      'workbenchFits/626_1',
      'workbenchFits/626_2',
    ]);
    await loadWorkbenchFits(626, 2_000);
    expect(getDocMock).toHaveBeenCalledTimes(3);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('reads only part 0 when it carries no count', async () => {
    serve({
      'workbenchFits/626_0': { part: 0, fits: [fit('a', 1)] },
      'workbenchFits/626_1': { part: 1, fits: [fit('b', 2)] },
    });
    expect(await loadWorkbenchFits(626)).toEqual({ ok: true, fits: [fit('a', 1)] });
    expect(requested()).toEqual(['workbenchFits/626_0']);
  });

  it('a hull with no part 0 is ok with no fits', async () => {
    serve({});
    expect(await loadWorkbenchFits(626)).toEqual({ ok: true, fits: [] });
    expect(requested()).toEqual(['workbenchFits/626_0']);
  });

  it('skips a claimed part that is gone (deleted mid-read) rather than failing', async () => {
    serve({
      'workbenchFits/626_0': { part: 0, parts: 2, fits: [fit('a', 1)] },
    });
    expect(await loadWorkbenchFits(626)).toEqual({ ok: true, fits: [fit('a', 1)] });
  });

  it('a failed read is not ok', async () => {
    getDocMock.mockRejectedValueOnce(new Error('offline'));
    expect(await loadWorkbenchFits(627)).toEqual({ ok: false });
  });

  it('is not ok without a Firebase config', async () => {
    syncConfigured.value = false;
    expect(await loadWorkbenchFits(626)).toEqual({ ok: false });
    expect(getDocMock).not.toHaveBeenCalled();
  });
});

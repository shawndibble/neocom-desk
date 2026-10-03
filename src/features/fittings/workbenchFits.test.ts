import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocsMock, whereMock, syncConfigured } = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
  whereMock: vi.fn((...args: unknown[]) => ({ where: args })),
  syncConfigured: { value: true },
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  query: (...args: unknown[]) => ({ query: args }),
  where: whereMock,
  getDocs: getDocsMock,
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));

import {
  loadWorkbenchFits,
  mergeWorkbenchParts,
  resetWorkbenchFitsCache,
  workbenchFitUrl,
  type WorkbenchFit,
} from './workbenchFits';

function fit(id: string, dateAdded: number): WorkbenchFit {
  return { id, name: id, authorId: 1, authorName: 'Pilot', dateAdded, eft: `[Vexor, ${id}]` };
}

function docs(...parts: { fits: unknown }[]) {
  return { docs: parts.map((part) => ({ data: () => part })) };
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

describe('loadWorkbenchFits', () => {
  beforeEach(() => {
    resetWorkbenchFitsCache();
    getDocsMock.mockReset();
    whereMock.mockClear();
    syncConfigured.value = true;
  });

  it("queries the hull's parts and caches the answer", async () => {
    getDocsMock.mockResolvedValue(docs({ fits: [fit('a', 1)] }, { fits: [fit('b', 2)] }));
    const result = await loadWorkbenchFits(626, 1_000);
    expect(result).toEqual({ ok: true, fits: [fit('b', 2), fit('a', 1)] });
    expect(whereMock).toHaveBeenCalledWith('shipTypeId', '==', 626);
    await loadWorkbenchFits(626, 2_000);
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it('an empty hull is ok with no fits; a failed read is not ok', async () => {
    getDocsMock.mockResolvedValueOnce(docs());
    expect(await loadWorkbenchFits(626)).toEqual({ ok: true, fits: [] });
    getDocsMock.mockRejectedValueOnce(new Error('offline'));
    expect(await loadWorkbenchFits(627)).toEqual({ ok: false });
  });

  it('is not ok without a Firebase config', async () => {
    syncConfigured.value = false;
    expect(await loadWorkbenchFits(626)).toEqual({ ok: false });
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});

describe('workbenchFitUrl', () => {
  it("links the fit's page on eveworkbench.com", () => {
    expect(workbenchFitUrl('cc7c9893-6e13')).toBe('https://eveworkbench.com/fit/cc7c9893-6e13');
  });
});

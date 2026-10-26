import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDoc = vi.fn();
const getDocs = vi.fn();

vi.mock('firebase/firestore/lite', () => ({
  collection: (...path: unknown[]) => ({ path: path.slice(1).join('/') }),
  doc: (...path: unknown[]) => ({ path: path.slice(1).join('/') }),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
}));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn() }));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => 'db' }));
vi.mock('./bookClient', () => ({ call: vi.fn() }));

import { clearFeederViewCache, readFeederView } from './feederViewClient';

const summarySnap = (builtAt: number, over: object = {}) => ({
  exists: () => true,
  data: () => ({ builtAt, ...over }),
});
const listSnap = (rows: object[]) => ({ docs: rows.map((r) => ({ data: () => r })) });

describe('readFeederView stamp (#5241)', () => {
  beforeEach(() => {
    clearFeederViewCache();
    getDoc.mockReset();
    getDocs.mockReset();
    getDocs.mockResolvedValue(listSnap([{ id: 1 }]));
  });

  it('reads the subcollections once while the stamp holds', async () => {
    getDoc.mockResolvedValue(summarySnap(5));
    const first = await readFeederView(1, 2, 3);
    expect(getDocs).toHaveBeenCalledTimes(3);
    getDoc.mockResolvedValue(summarySnap(5, { paidIsk: 9 }));
    const second = await readFeederView(1, 2, 3);
    expect(getDocs).toHaveBeenCalledTimes(3);
    expect(second?.days).toEqual(first?.days);
    expect(second?.summary).toMatchObject({ paidIsk: 9 });
  });

  it('reads them again when the stamp moves', async () => {
    getDoc.mockResolvedValue(summarySnap(5));
    await readFeederView(1, 2, 3);
    getDoc.mockResolvedValue(summarySnap(6));
    await readFeederView(1, 2, 3);
    expect(getDocs).toHaveBeenCalledTimes(6);
  });

  it('keeps a cache per feeder and returns null for no summary', async () => {
    getDoc.mockResolvedValue(summarySnap(5));
    await readFeederView(1, 2, 3);
    await readFeederView(1, 2, 4);
    expect(getDocs).toHaveBeenCalledTimes(6);
    getDoc.mockResolvedValue({ exists: () => false });
    expect(await readFeederView(1, 2, 3)).toBeNull();
  });
});

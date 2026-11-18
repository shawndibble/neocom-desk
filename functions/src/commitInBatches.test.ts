import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { commitInBatches } from './commitInBatches.js';

function fakeDb() {
  const commits: number[] = [];
  const db = {
    batch: () => {
      let n = 0;
      return {
        mark: () => void n++,
        commit: vi.fn(async () => void commits.push(n)),
      };
    },
  };
  return { db: db as unknown as Firestore, commits };
}

describe('commitInBatches', () => {
  it('commits nothing for no ops', async () => {
    const { db, commits } = fakeDb();
    await commitInBatches(db, []);
    expect(commits).toEqual([]);
  });

  it('splits at 400 by default', async () => {
    const { db, commits } = fakeDb();
    const ops = Array.from({ length: 850 }, () => (b: unknown) => (b as { mark(): void }).mark());
    await commitInBatches(db, ops);
    expect(commits).toEqual([400, 400, 50]);
  });

  it('honours a custom size', async () => {
    const { db, commits } = fakeDb();
    const ops = Array.from({ length: 5 }, () => (b: unknown) => (b as { mark(): void }).mark());
    await commitInBatches(db, ops, 2);
    expect(commits).toEqual([2, 2, 1]);
  });
});

import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { queuePledgeDeletes } from './communitiesStore.js';

// A Firestore stand-in just deep enough for `communities/{c}/itemRequests` and
// `{request}/pledges/{uid}`: refs are plain path strings.
function fakeDb(requestIds: string[]) {
  const ref = (path: string) => ({
    path,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${path}/${name}/${id}`),
      listDocuments: async () => requestIds.map((id) => ref(`${path}/${name}/${id}`)),
    }),
  });
  return {
    db: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    } as unknown as Firestore,
  };
}

describe('queuePledgeDeletes', () => {
  it('deletes the leaving Member’s Pledge on every Request of the Community, and only theirs', async () => {
    const deleted: string[] = [];
    const writer = {
      delete: async (r: FirebaseFirestore.DocumentReference) => {
        deleted.push((r as unknown as { path: string }).path);
      },
    };
    const { db } = fakeDb(['r1', 'r2']);
    const promises = await queuePledgeDeletes(db, writer, 'c1', 'char:7');
    await Promise.all(promises);
    expect(deleted.sort()).toEqual([
      'communities/c1/itemRequests/r1/pledges/char:7',
      'communities/c1/itemRequests/r2/pledges/char:7',
    ]);
  });
});

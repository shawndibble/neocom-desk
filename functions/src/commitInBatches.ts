import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { chunk } from './chunk.js';

/** One write staged on a batch. */
export type BatchOp = (batch: WriteBatch) => void;

/** Firestore allows 500 ops per batch; 400 leaves headroom for transforms. */
export const DEFAULT_BATCH_OPS = 400;

/** Applies `ops` in sequential batches of at most `size`. */
export async function commitInBatches(
  db: Firestore,
  ops: readonly BatchOp[],
  size = DEFAULT_BATCH_OPS
): Promise<void> {
  for (const part of chunk(ops, size)) {
    const batch = db.batch();
    for (const op of part) op(batch);
    await batch.commit();
  }
}

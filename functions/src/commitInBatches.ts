import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { chunk } from './chunk.js';

export type BatchOp = (batch: WriteBatch) => void;

const DEFAULT_BATCH_OPS = 400;

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

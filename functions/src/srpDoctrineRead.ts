import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { CORPS_COLLECTION, SRP_DOCTRINES, type DoctrineFit } from './srpTypes.js';

export const doctrinesCollection = (db: Firestore, corporationId: number) =>
  db.collection(CORPS_COLLECTION).doc(String(corporationId)).collection(SRP_DOCTRINES);

export async function readDoctrines(
  db: Firestore,
  corporationId: number,
  ids: readonly string[],
  tx?: Transaction
): Promise<Map<string, DoctrineFit>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const refs = unique.map((id) => doctrinesCollection(db, corporationId).doc(id));
  const docs = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, d.data() as DoctrineFit] as const));
}

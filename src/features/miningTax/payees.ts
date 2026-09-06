/**
 * Payee CRUD for the Moon Mining Tax ledger (issue #523). Per-character
 * Editable Data, synced like a Build Plan (`sync/planSync.ts`'s `payeeSpec`) —
 * writes go straight to Dexie plus a debounced `scheduleSync`, and deletes go
 * through `markPayeeDeleted` so the removal propagates instead of
 * resurrecting from a remote copy.
 */
import { db, type PayeeRecord } from '@/db';
import { markPayeeDeleted, scheduleSync } from '@/sync';

export function loadPayees(characterId: number): Promise<PayeeRecord[]> {
  return db.payees.where('characterId').equals(characterId).toArray();
}

export interface PayeeInput {
  name: string;
  defaultTaxPct: number;
  systemId?: number;
}

export async function createPayee(characterId: number, input: PayeeInput): Promise<PayeeRecord> {
  const record: PayeeRecord = {
    id: crypto.randomUUID(),
    characterId,
    name: input.name,
    defaultTaxPct: input.defaultTaxPct,
    ...(input.systemId !== undefined ? { systemId: input.systemId } : {}),
    updatedAt: Date.now(),
  };
  await db.payees.put(record);
  scheduleSync(characterId);
  return record;
}

export async function updatePayee(payee: PayeeRecord, input: PayeeInput): Promise<PayeeRecord> {
  const updated: PayeeRecord = {
    ...payee,
    name: input.name,
    defaultTaxPct: input.defaultTaxPct,
    ...(input.systemId !== undefined ? { systemId: input.systemId } : { systemId: undefined }),
    updatedAt: Date.now(),
  };
  // Firestore rejects `undefined` fields; an explicit removal must drop the
  // key entirely rather than write `systemId: undefined` to Dexie, which
  // `toRemoteDoc`'s `!== undefined` check would then happily (and wrongly)
  // treat as "no change to push".
  if (input.systemId === undefined) delete updated.systemId;
  await db.payees.put(updated);
  scheduleSync(payee.characterId);
  return updated;
}

/**
 * Records who this Payee actually is in game (issue #540), learned when the
 * pilot confirms that a payment to `entityId` settled this Payee's entries —
 * never asked for up front, since a Payee is a free-text label and a field
 * almost nobody fills in is worse than none.
 *
 * A later confirmation against a different recipient wins: a corp renamed, or
 * a landlord who now collects on a different character, is exactly the case
 * worth re-learning. Returns the payee untouched when nothing changed, so a
 * repeat link is not a pointless write and sync.
 *
 * `updatePayee` spreads the existing record, so an ordinary name/rate edit
 * cannot silently drop what this learned.
 */
export async function rememberPayeeEntity(
  payee: PayeeRecord,
  entityId: number
): Promise<PayeeRecord> {
  if (payee.entityId === entityId) return payee;
  const updated: PayeeRecord = { ...payee, entityId, updatedAt: Date.now() };
  await db.payees.put(updated);
  scheduleSync(payee.characterId);
  return updated;
}

export async function deletePayee(payee: PayeeRecord): Promise<void> {
  await markPayeeDeleted(payee.characterId, payee.id);
}

/**
 * Payee CRUD for the Moon Mining Tax ledger (issue #523). Per-character
 * Editable Data, synced like a Build Plan (`sync/planSync.ts`'s `payeeSpec`) —
 * writes go straight to Dexie plus a debounced `scheduleSync`. Deleting is a
 * ledger action (`ledgerActions.deletePayee`), since it moves the Payee's
 * entries in the same transaction.
 */
import { db, type PayeeRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { PAYEES } from '@/sync/syncedCollections';

export function loadPayees(characterId: number): Promise<PayeeRecord[]> {
  return db.payees.where('characterId').equals(characterId).toArray();
}

export interface PayeeInput {
  name: string;
  defaultTaxPct: number;
  systemId?: number;
  /** Absent means Jita — the basis every Payee was priced at before this was settable. */
  hubId?: string;
}

export async function createPayee(characterId: number, input: PayeeInput): Promise<PayeeRecord> {
  const record: PayeeRecord = {
    id: crypto.randomUUID(),
    characterId,
    name: input.name,
    defaultTaxPct: input.defaultTaxPct,
    ...(input.systemId !== undefined ? { systemId: input.systemId } : {}),
    ...(input.hubId !== undefined ? { hubId: input.hubId } : {}),
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
    ...(input.hubId !== undefined ? { hubId: input.hubId } : { hubId: undefined }),
    updatedAt: Date.now(),
  };
  // Firestore rejects `undefined` fields; an explicit removal must drop the
  // key entirely rather than write `systemId: undefined` to Dexie, which
  // `toRemoteDoc`'s `!== undefined` check would then happily (and wrongly)
  // treat as "no change to push".
  if (input.systemId === undefined) delete updated.systemId;
  // Same reason as `systemId` above: Firestore rejects an `undefined` field,
  // and `toRemoteDoc`'s `!== undefined` check would read a written `undefined`
  // as "no change to push", so clearing the hub has to drop the key entirely.
  if (input.hubId === undefined) delete updated.hubId;
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

/**
 * Deletes a Payee and tombstones it, so the deletion syncs instead of the next
 * pull resurrecting it. Dexie-only: no transaction of its own and no sync —
 * `ledgerActions.deletePayee` runs it inside its transaction and schedules
 * the sync after the commit.
 */
export async function removePayeeRecord(
  payee: Pick<PayeeRecord, 'id' | 'characterId'>
): Promise<void> {
  await db.payees.delete(payee.id);
  await appendTombstones(tombstoneKey(PAYEES, payee.characterId), [payee.id]);
}

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
  /**
   * The EVE entity this Payee is, from the name search. On `updatePayee`
   * absent keeps what the record has (an ordinary rename must not forget what
   * a payment taught it); `null` clears it.
   */
  entityId?: number | null;
  entityKind?: PayeeEntityKind | null;
}

export type PayeeEntityKind = NonNullable<PayeeRecord['entityKind']>;

export async function createPayee(characterId: number, input: PayeeInput): Promise<PayeeRecord> {
  const record: PayeeRecord = {
    id: crypto.randomUUID(),
    characterId,
    name: input.name,
    defaultTaxPct: input.defaultTaxPct,
    ...(input.systemId !== undefined ? { systemId: input.systemId } : {}),
    ...(input.hubId !== undefined ? { hubId: input.hubId } : {}),
    ...(input.entityId != null ? { entityId: input.entityId } : {}),
    ...(input.entityId != null && input.entityKind != null ? { entityKind: input.entityKind } : {}),
    updatedAt: Date.now(),
  };
  await db.payees.put(record);
  scheduleSync(characterId, { collections: ['payees'] });
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
  // Absent keeps the stored entity; `null` clears it. A kind without an id is
  // meaningless, so clearing the id drops the kind too.
  if (input.entityId === null) {
    delete updated.entityId;
    delete updated.entityKind;
  } else if (input.entityId !== undefined) {
    updated.entityId = input.entityId;
    if (input.entityId !== payee.entityId && input.entityKind === undefined) {
      delete updated.entityKind;
    }
  }
  if (input.entityKind === null) delete updated.entityKind;
  else if (input.entityKind !== undefined && updated.entityId !== undefined) {
    updated.entityKind = input.entityKind;
  }
  await db.payees.put(updated);
  scheduleSync(payee.characterId, { collections: ['payees'] });
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
  entityId: number,
  kind?: PayeeEntityKind
): Promise<PayeeRecord> {
  if (payee.entityId === entityId) {
    // A kind the pilot verified is never overwritten by a guess.
    if (kind === undefined || payee.entityKind !== undefined) return payee;
    return writeEntity({ ...payee, entityKind: kind });
  }
  // A different recipient: the old kind described someone else.
  const next: PayeeRecord = { ...payee, entityId };
  delete next.entityKind;
  if (kind !== undefined) next.entityKind = kind;
  return writeEntity(next);
}

async function writeEntity(next: PayeeRecord): Promise<PayeeRecord> {
  const updated: PayeeRecord = { ...next, updatedAt: Date.now() };
  await db.payees.put(updated);
  scheduleSync(updated.characterId, { collections: ['payees'] });
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

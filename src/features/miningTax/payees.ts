/**
 * Payee CRUD for the Moon Mining Tax ledger (issue #523). Per-character
 * Editable Data, synced like a Build Plan (`sync/planSync.ts`'s `payeeSpec`) —
 * writes go straight to Dexie plus a debounced `scheduleSync`. Deleting is a
 * ledger action (`ledgerActions.deletePayee`), since it moves the Payee's
 * entries in the same transaction.
 */
import { db, type PayeeRecord } from '@/db';
import { utcDay } from '@/engine/localDay';
import { scheduleSync } from '@/sync';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { PAYEES } from '@/sync/syncedCollections';

/**
 * The Character's Payees. A Payee that still carries the old single remembered `systemId` has it
 * folded into its Default Systems first (`migrateLegacyPayeeSystems`).
 */
export async function loadPayees(characterId: number): Promise<PayeeRecord[]> {
  const payees = await db.payees.where('characterId').equals(characterId).toArray();
  if (!payees.some((p) => p.systemId !== undefined)) return payees;
  return migrateLegacyPayeeSystems(characterId, payees);
}

/**
 * The old "remember this system" tag becomes a Default System, effective today: forward-only, so
 * ore mined before the migration is never billed unasked. A system two Payees both remembered
 * goes to the lowest id, the way the plan picks (`defaultPayeeForSystem`); the other loses it.
 */
async function migrateLegacyPayeeSystems(
  characterId: number,
  payees: PayeeRecord[]
): Promise<PayeeRecord[]> {
  const today = utcDay(Date.now());
  const held = new Set(payees.flatMap((p) => p.defaultSystems?.map((s) => s.systemId) ?? []));
  const migrated = new Map<string, PayeeRecord>();
  for (const payee of [...payees].sort((a, b) => a.id.localeCompare(b.id))) {
    if (payee.systemId === undefined) continue;
    const { systemId, ...rest } = payee;
    const next: PayeeRecord = { ...rest, updatedAt: Date.now() };
    if (!held.has(systemId)) {
      held.add(systemId);
      next.defaultSystems = [...(payee.defaultSystems ?? []), { systemId, from: today }];
    }
    migrated.set(payee.id, next);
  }
  await db.payees.bulkPut([...migrated.values()]);
  scheduleSync(characterId, { collections: ['payees'] });
  return payees.map((p) => migrated.get(p.id) ?? p);
}

/** A Default System can belong to one of a Character's Payees only; this names the one that has it. */
export class DefaultSystemTakenError extends Error {
  constructor(
    readonly systemId: number,
    readonly holderName: string
  ) {
    super(`System ${systemId} is already the default of ${holderName}`);
    this.name = 'DefaultSystemTakenError';
  }
}

/**
 * The Default Systems a save leaves a Payee with: each requested system keeps the day it was
 * added if the Payee already had it, and is stamped today otherwise. Throws if another of the
 * Character's Payees already holds one.
 */
async function resolveDefaultSystems(
  characterId: number,
  payeeId: string | undefined,
  existing: PayeeRecord['defaultSystems'],
  systemIds: readonly number[]
): Promise<NonNullable<PayeeRecord['defaultSystems']>> {
  const others = (await loadPayees(characterId)).filter((p) => p.id !== payeeId);
  const today = utcDay(Date.now());
  return [...new Set(systemIds)].map((systemId) => {
    const holder = others.find((p) => p.defaultSystems?.some((s) => s.systemId === systemId));
    if (holder) throw new DefaultSystemTakenError(systemId, holder.name);
    return { systemId, from: existing?.find((s) => s.systemId === systemId)?.from ?? today };
  });
}

export interface PayeeInput {
  name: string;
  defaultTaxPct: number;
  /**
   * The systems this Payee is the default for. On `updatePayee` absent keeps what the record has
   * (an ordinary rename or rate change must not forget them); an empty list clears them.
   */
  defaultSystemIds?: readonly number[];
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
  const defaultSystems = input.defaultSystemIds?.length
    ? await resolveDefaultSystems(characterId, undefined, undefined, input.defaultSystemIds)
    : [];
  const record: PayeeRecord = {
    id: crypto.randomUUID(),
    characterId,
    name: input.name,
    defaultTaxPct: input.defaultTaxPct,
    ...(defaultSystems.length > 0 ? { defaultSystems } : {}),
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
    ...(input.hubId !== undefined ? { hubId: input.hubId } : { hubId: undefined }),
    updatedAt: Date.now(),
  };
  if (input.defaultSystemIds !== undefined) {
    const defaultSystems = await resolveDefaultSystems(
      payee.characterId,
      payee.id,
      payee.defaultSystems,
      input.defaultSystemIds
    );
    // Firestore rejects `undefined` fields, and `toRemoteDoc`'s `!== undefined` check would read
    // a written `undefined` as "no change to push", so an empty list drops the key entirely.
    if (defaultSystems.length > 0) updated.defaultSystems = defaultSystems;
    else delete updated.defaultSystems;
  }
  // Same reason as the Default Systems above: clearing the hub has to drop the key entirely.
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

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

/**
 * Creates the Payee unless `existing` finds one among the Character's stored Payees, both in one
 * transaction: two callers racing (two Survey surfaces) never make two records for one recipient.
 * No Default Systems: a caller that sets them uses `createPayee`.
 */
export async function createPayeeOnce(
  characterId: number,
  input: Omit<PayeeInput, 'defaultSystemIds'>,
  existing: (payees: readonly PayeeRecord[]) => PayeeRecord | undefined
): Promise<{ payee: PayeeRecord; created: boolean }> {
  const out = await db.transaction('rw', db.payees, async () => {
    const found = existing(await db.payees.where('characterId').equals(characterId).toArray());
    if (found) return { payee: found, created: false };
    const record: PayeeRecord = {
      id: crypto.randomUUID(),
      characterId,
      name: input.name,
      defaultTaxPct: input.defaultTaxPct,
      ...(input.hubId !== undefined ? { hubId: input.hubId } : {}),
      ...(input.entityId != null ? { entityId: input.entityId } : {}),
      ...(input.entityId != null && input.entityKind != null
        ? { entityKind: input.entityKind }
        : {}),
      updatedAt: Date.now(),
    };
    await db.payees.put(record);
    return { payee: record, created: true };
  });
  if (out.created) scheduleSync(characterId, { collections: ['payees'] });
  return out;
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
 * Archives (`archivedAt` stamped) or unarchives (the key dropped: Firestore rejects `undefined`)
 * every record of a merged Payee, syncing each Character once. Whether it then reads archived is
 * `isArchivedPayee`'s: nothing owed, nothing newer.
 */
export async function setPayeesArchived(
  records: readonly PayeeRecord[],
  archived: boolean,
  now: number = Date.now()
): Promise<void> {
  const written = records.map((record): PayeeRecord => {
    const next: PayeeRecord = { ...record, updatedAt: now };
    if (archived) next.archivedAt = now;
    else delete next.archivedAt;
    return next;
  });
  if (written.length === 0) return;
  await db.payees.bulkPut(written);
  for (const characterId of new Set(written.map((p) => p.characterId))) {
    scheduleSync(characterId, { collections: ['payees'] });
  }
}

/**
 * Makes every target bill like `source` (#6308: the pilot picks which of a merged Payee's records
 * wins): its name, tax %, Trade Hub and EVE link. Default Systems are left alone, they route one
 * Character's ore. Returns nothing; each target's Character is synced once.
 */
export async function applyPayeeTerms(
  source: PayeeRecord,
  targets: readonly PayeeRecord[]
): Promise<void> {
  const now = Date.now();
  const written = targets
    .filter((t) => t.id !== source.id)
    .map((target) => {
      const next: PayeeRecord = {
        ...target,
        name: source.name,
        defaultTaxPct: source.defaultTaxPct,
        updatedAt: now,
      };
      // Firestore rejects `undefined`: an absent field is dropped, never written empty.
      for (const key of ['hubId', 'entityId', 'entityKind'] as const) {
        if (source[key] === undefined) delete next[key];
        else Object.assign(next, { [key]: source[key] });
      }
      return next;
    });
  if (written.length === 0) return;
  await db.payees.bulkPut(written);
  for (const characterId of new Set(written.map((p) => p.characterId))) {
    scheduleSync(characterId, { collections: ['payees'] });
  }
}

/**
 * Records who this Payee actually is in game (issue #540), learned when the
 * pilot confirms that a payment to `entityId` settled this Payee's entries, or
 * when an unlinked Payee from before Payees had to be someone in EVE is matched
 * by name (`payeeAutoLink`).
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
  // Judged on the stored record, in one transaction with the write: a caller's older copy must
  // never re-point a Payee verified since it was read.
  return (await writeIf(payee.id, (stored) => learnedEntity(stored, entityId, kind))) ?? payee;
}

function learnedEntity(
  payee: PayeeRecord,
  entityId: number,
  kind: PayeeEntityKind | undefined
): PayeeRecord | undefined {
  if (payee.entityId === entityId) {
    // A kind the pilot verified is never overwritten by a guess.
    if (kind === undefined || payee.entityKind !== undefined) return undefined;
    return { ...payee, entityKind: kind };
  }
  // A Payee verified as a corporation or character is who it is: a payment to someone else (its
  // CEO, an officer) is never a reason to re-point it.
  if (payee.entityKind !== undefined) return undefined;
  // A different recipient: the old kind described someone else.
  const next: PayeeRecord = { ...payee, entityId };
  delete next.entityKind;
  if (kind !== undefined) next.entityKind = kind;
  return next;
}

/**
 * Links a stored Payee as `corporationId` (`payeesOfBookCorporation`'s `link`), read and written in
 * one transaction so an edit since the caller's copy is kept. Only while it is still unlinked, or
 * carries that id with no kind: never re-points a Payee linked to someone else meanwhile.
 */
export async function linkPayeeToCorporation(
  payeeId: string,
  corporationId: number
): Promise<void> {
  await writeIf(payeeId, (payee) => {
    const unlinked = payee.entityId === undefined;
    const kindless = payee.entityId === corporationId && payee.entityKind === undefined;
    return unlinked || kindless ? withCorporationLink(payee, corporationId) : undefined;
  });
}

/**
 * Reads the stored Payee, asks `change` what it becomes (undefined: nothing to write) and writes
 * it, all in one transaction; the sync is scheduled once it has committed.
 */
async function writeIf(
  payeeId: string,
  change: (stored: PayeeRecord) => PayeeRecord | undefined
): Promise<PayeeRecord | undefined> {
  const updated = await db.transaction('rw', db.payees, async () => {
    const stored = await db.payees.get(payeeId);
    const next = stored ? change(stored) : undefined;
    if (!next) return undefined;
    const record: PayeeRecord = { ...next, updatedAt: Date.now() };
    await db.payees.put(record);
    return record;
  });
  if (updated) scheduleSync(updated.characterId, { collections: ['payees'] });
  return updated;
}

/** The Payee linked as `corporationId`: what every path that links one writes. */
export function withCorporationLink(payee: PayeeRecord, corporationId: number): PayeeRecord {
  return { ...payee, entityId: corporationId, entityKind: 'corporation', updatedAt: Date.now() };
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

import { db, type PayeeRecord } from '@/db';
import { utcDay } from '@/engine/localDay';
import { scheduleSync } from '@/sync';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { PAYEES } from '@/sync/syncedCollections';

export async function loadPayees(characterId: number): Promise<PayeeRecord[]> {
  const payees = await db.payees.where('characterId').equals(characterId).toArray();
  if (!payees.some((p) => p.systemId !== undefined)) return payees;
  return migrateLegacyPayeeSystems(characterId, payees);
}

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

export class DefaultSystemTakenError extends Error {
  constructor(
    readonly systemId: number,
    readonly holderName: string
  ) {
    super(`System ${systemId} is already the default of ${holderName}`);
    this.name = 'DefaultSystemTakenError';
  }
}

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
  defaultSystemIds?: readonly number[];
  hubId?: string;
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
    if (defaultSystems.length > 0) updated.defaultSystems = defaultSystems;
    else delete updated.defaultSystems;
  }
  if (input.hubId === undefined) delete updated.hubId;
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

export async function setPayeesArchived(
  records: readonly PayeeRecord[],
  archived: boolean,
  now: number = Date.now()
): Promise<void> {
  const written: PayeeRecord[] = [];
  await db.transaction('rw', db.payees, async () => {
    for (const record of records) {
      const stored = await db.payees.get(record.id);
      if (!stored) continue;
      const next: PayeeRecord = { ...stored, updatedAt: now };
      if (archived) next.archivedAt = now;
      else delete next.archivedAt;
      written.push(next);
    }
    await db.payees.bulkPut(written);
  });
  for (const characterId of new Set(written.map((p) => p.characterId))) {
    scheduleSync(characterId, { collections: ['payees'] });
  }
}

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

export async function rememberPayeeEntity(
  payee: PayeeRecord,
  entityId: number,
  kind?: PayeeEntityKind
): Promise<PayeeRecord> {
  return (await writeIf(payee.id, (stored) => learnedEntity(stored, entityId, kind))) ?? payee;
}

function learnedEntity(
  payee: PayeeRecord,
  entityId: number,
  kind: PayeeEntityKind | undefined
): PayeeRecord | undefined {
  if (payee.entityId === entityId) {
    if (kind === undefined || payee.entityKind !== undefined) return undefined;
    return { ...payee, entityKind: kind };
  }
  if (payee.entityKind !== undefined) return undefined;
  const next: PayeeRecord = { ...payee, entityId };
  delete next.entityKind;
  if (kind !== undefined) next.entityKind = kind;
  return next;
}

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

export function withCorporationLink(payee: PayeeRecord, corporationId: number): PayeeRecord {
  return { ...payee, entityId: corporationId, entityKind: 'corporation', updatedAt: Date.now() };
}

export async function removePayeeRecord(
  payee: Pick<PayeeRecord, 'id' | 'characterId'>
): Promise<void> {
  await db.payees.delete(payee.id);
  await appendTombstones(tombstoneKey(PAYEES, payee.characterId), [payee.id]);
}

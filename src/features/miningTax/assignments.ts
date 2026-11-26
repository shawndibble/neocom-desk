import { normalizeLabel } from './assignmentLabel';
import { db, type MiningTaxAssignmentRecord, type MiningTaxOreLine } from '@/db';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS } from '@/sync/syncedCollections';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { growthCollector, linesOwnedBy } from '@/engine/miningTax/ownership';
import { planSplit } from '@/engine/miningTax/split';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { loadPayees } from './payees';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';
import { currentCompressedOre, withOreFormMarker } from './oreForm';
import { putAssignments } from './storedAssignments';

export class AlreadyAssignedError extends Error {
  constructor() {
    super('This ore is already assigned');
    this.name = 'AlreadyAssignedError';
  }
}

function assertUnclaimed(
  covering: readonly MiningTaxAssignmentRecord[],
  oreLines: readonly MiningTaxOreLine[],
  entryOreLines?: readonly MiningTaxOreLine[]
): void {
  const claimed = new Map<number, number>();
  for (const a of covering) {
    for (const line of a.oreLines) {
      claimed.set(line.typeId, (claimed.get(line.typeId) ?? 0) + line.quantity);
    }
  }
  const entryByType = entryOreLines && new Map(entryOreLines.map((l) => [l.typeId, l.quantity]));
  const clash = oreLines.some((line) => {
    const already = claimed.get(line.typeId) ?? 0;
    if (already === 0) return false;
    const held = entryByType?.get(line.typeId);
    return held === undefined ? true : already + line.quantity > held;
  });
  if (clash) throw new AlreadyAssignedError();
}

function entryAssignments(
  record: Pick<MiningTaxAssignmentRecord, 'characterId' | 'date' | 'solarSystemId'>
): Promise<MiningTaxAssignmentRecord[]> {
  return db.miningTaxAssignments
    .where('characterId')
    .equals(record.characterId)
    .filter((a) => a.date === record.date && a.solarSystemId === record.solarSystemId)
    .toArray();
}

async function claimNewOre(
  record: MiningTaxAssignmentRecord,
  isPaid: (a: MiningTaxAssignmentRecord) => boolean,
  entryOreLines?: readonly MiningTaxOreLine[],
  takesGrowth = false
): Promise<MiningTaxAssignmentRecord[]> {
  const covering = await entryAssignments(record);
  assertUnclaimed(covering, record.oreLines, entryOreLines);
  if (covering.length === 0) return [record];
  const collector = growthCollector(covering);
  if (!takesGrowth && !(collector && isPaid(collector))) return [record];
  record.collectsGrowth = true;
  if (!collector?.collectsGrowth) return [record];
  const handedOver: MiningTaxAssignmentRecord = { ...collector, updatedAt: record.updatedAt };
  delete handedOver.collectsGrowth;
  return [record, handedOver];
}

export function loadAssignments(characterId: number): Promise<MiningTaxAssignmentRecord[]> {
  return db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
}

export interface AssignInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId: string;
  oreLines: MiningTaxOreLine[];
  entryOreLines?: readonly MiningTaxOreLine[];
  taxPct: number;
  estimatedValue: number;
  taxOwed: number;
  label?: string;
  releasedTypeIds?: readonly number[];
  takesGrowth?: boolean;
  isPaid: (a: MiningTaxAssignmentRecord) => boolean;
  byDefault?: boolean;
}

function asPilotAct(record: MiningTaxAssignmentRecord): MiningTaxAssignmentRecord {
  delete record.override;
  return record;
}

function oreFormMarker(): { rawOrePriced?: true } {
  return currentCompressedOre() ? {} : { rawOrePriced: true };
}

export async function createAssignment(input: AssignInput): Promise<MiningTaxAssignmentRecord> {
  const now = Date.now();
  const record: MiningTaxAssignmentRecord = {
    id: crypto.randomUUID(),
    characterId: input.characterId,
    date: input.date,
    solarSystemId: input.solarSystemId,
    payeeId: input.payeeId,
    oreLines: input.oreLines,
    taxPct: input.taxPct,
    estimatedValue: input.estimatedValue,
    taxOwed: input.taxOwed,
    status: 'outstanding',
    ...(normalizeLabel(input.label) ? { label: normalizeLabel(input.label) } : {}),
    ...(input.byDefault ? { override: false } : {}),
    ...(input.releasedTypeIds?.length ? { releasedTypeIds: [...input.releasedTypeIds] } : {}),
    ...oreFormMarker(),
    updatedAt: now,
  };
  await db.transaction('rw', db.miningTaxAssignments, db.settings, async () => {
    await putAssignments(
      await claimNewOre(record, input.isPaid, input.entryOreLines, input.takesGrowth)
    );
  });
  return record;
}

export interface DismissInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: MiningTaxOreLine[];
  estimatedValue: number;
}

export async function dismissEntries(
  inputs: readonly DismissInput[]
): Promise<MiningTaxAssignmentRecord[]> {
  if (inputs.length === 0) return [];
  const now = Date.now();
  const records = inputs.map((input): MiningTaxAssignmentRecord => ({
    id: crypto.randomUUID(),
    characterId: input.characterId,
    date: input.date,
    solarSystemId: input.solarSystemId,
    oreLines: input.oreLines,
    taxPct: 0,
    estimatedValue: input.estimatedValue,
    taxOwed: 0,
    status: 'dismissed',
    updatedAt: now,
  }));
  await putAssignments(records);
  return records;
}

export interface CombinedMemberValues {
  estimatedValue: number;
  taxOwed: number;
  oreLineValues?: Record<number, number>;
}

export interface UpdateCombinedInput {
  payeeId: string;
  taxPct: number;
  label?: string;
  members: Readonly<Record<string, CombinedMemberValues>>;
}

export async function updateCombinedAssignments(
  assignments: readonly MiningTaxAssignmentRecord[],
  input: UpdateCombinedInput
): Promise<MiningTaxAssignmentRecord[]> {
  if (assignments.length === 0) return [];
  const now = Date.now();
  const updated = assignments.map((a): MiningTaxAssignmentRecord => {
    const values = input.members[a.id];
    const next: MiningTaxAssignmentRecord = {
      ...a,
      payeeId: input.payeeId,
      taxPct: input.taxPct,
      ...(values ? { estimatedValue: values.estimatedValue, taxOwed: values.taxOwed } : {}),
      updatedAt: now,
    };
    if (input.label !== undefined) {
      const label = normalizeLabel(input.label);
      if (label) next.label = label;
      else delete next.label;
    }
    if (values) {
      if (values.oreLineValues !== undefined) next.oreLineValues = values.oreLineValues;
      else delete next.oreLineValues;
    }
    return asPilotAct(next);
  });
  await putAssignments(updated);
  return updated;
}

export async function uncombineAssignments(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<void> {
  const now = Date.now();
  const updated = assignments
    .filter((a) => a.groupId !== undefined)
    .map((a): MiningTaxAssignmentRecord => {
      const next: MiningTaxAssignmentRecord = { ...a, updatedAt: now };
      delete next.groupId;
      return next;
    });
  if (updated.length === 0) return;
  await putAssignments(updated);
}

export async function moveAssignmentsToPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  const updated = assignments.map((a) => asPilotAct({ ...a, payeeId, updatedAt: now }));
  await putAssignments(updated);
}

export interface JoinMemberInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  assignment: MiningTaxAssignmentRecord | null;
  oreLines?: MiningTaxOreLine[];
  entryOreLines?: readonly MiningTaxOreLine[];
}

export async function joinAssignments(
  members: readonly JoinMemberInput[],
  payeeId: string,
  taxPct: number,
  pricesOn: (date: string) => ReadonlyMap<number, number>,
  isPaid: (a: MiningTaxAssignmentRecord) => boolean
): Promise<MiningTaxAssignmentRecord[]> {
  const groupId =
    members.map((m) => m.assignment?.groupId).find((id) => id !== undefined) ?? crypto.randomUUID();
  const now = Date.now();
  const marker = oreFormMarker();
  const records: MiningTaxAssignmentRecord[] = members.map((m) => {
    if (m.assignment) return asPilotAct({ ...m.assignment, groupId, updatedAt: now });
    const oreLines = m.oreLines ?? [];
    const { estimatedValue, taxOwed } = computeAssignmentValue(oreLines, pricesOn(m.date), taxPct);
    return {
      id: crypto.randomUUID(),
      characterId: m.characterId,
      date: m.date,
      solarSystemId: m.solarSystemId,
      payeeId,
      oreLines,
      taxPct,
      estimatedValue,
      taxOwed,
      status: 'outstanding',
      groupId,
      ...marker,
      updatedAt: now,
    };
  });
  await db.transaction('rw', db.miningTaxAssignments, db.settings, async () => {
    const handedOver: MiningTaxAssignmentRecord[] = [];
    for (const [i, m] of members.entries()) {
      if (m.assignment) continue;
      handedOver.push(...(await claimNewOre(records[i], isPaid, m.entryOreLines)).slice(1));
    }
    await putAssignments([...records, ...handedOver]);
  });
  return records;
}

export type SplitCollector = 'original' | 'new';

export interface SplitInput {
  moves: readonly MiningTaxOreLine[];
  unreported?: readonly MiningTaxOreLine[];
  payeeId: string;
  taxPct: number;
  collector?: SplitCollector;
  label?: string;
}

export interface SplitPrices {
  kept: ReadonlyMap<number, number>;
  moved: ReadonlyMap<number, number>;
}

export async function splitAssignment(
  original: MiningTaxAssignmentRecord,
  input: SplitInput,
  prices: SplitPrices
): Promise<{ kept: MiningTaxAssignmentRecord; created: MiningTaxAssignmentRecord }> {
  const unreported = (input.unreported ?? []).filter((l) => l.quantity > 0);
  const { kept: keptLines, moved: movedLines } = planSplit(
    original.oreLines,
    input.moves,
    unreported
  );
  if (movedLines.length === 0 && unreported.length === 0) throw new Error('Nothing to move');
  if (keptLines.length === 0) throw new Error('Cannot move every unit — unassign instead');
  if (unreported.length > 0) {
    if (input.collector !== 'new') throw new Error('Unreported ore needs the new side to collect');
    if (original.status === 'paid') throw new Error('A paid day cannot claim more ore');
  }

  const now = Date.now();
  const marker = oreFormMarker();
  const keptValue = computeAssignmentValue(keptLines, prices.kept, original.taxPct);
  const kept: MiningTaxAssignmentRecord = {
    ...original,
    oreLines: keptLines,
    estimatedValue: keptValue.estimatedValue,
    taxOwed: keptValue.taxOwed,
    updatedAt: now,
  };
  delete kept.oreLineValues;
  delete kept.collectsGrowth;
  delete kept.rawOrePriced;
  delete kept.override;
  Object.assign(kept, marker);
  if (input.collector === 'original') kept.collectsGrowth = true;
  if (original.status === 'needs-review') {
    kept.status = 'outstanding';
    delete kept.reviewDiff;
  }

  const createdValue = computeAssignmentValue(movedLines, prices.moved, input.taxPct);
  const created: MiningTaxAssignmentRecord = {
    id: crypto.randomUUID(),
    characterId: original.characterId,
    date: original.date,
    solarSystemId: original.solarSystemId,
    payeeId: input.payeeId,
    oreLines: movedLines,
    taxPct: input.taxPct,
    estimatedValue: createdValue.estimatedValue,
    taxOwed: createdValue.taxOwed,
    status: 'outstanding',
    ...(input.collector === 'new' ? { collectsGrowth: true } : {}),
    ...(normalizeLabel(input.label) ? { label: normalizeLabel(input.label) } : {}),
    ...marker,
    updatedAt: now,
  };

  const handedOver = input.collector
    ? (await entryAssignments(original))
        .filter((a) => a.id !== original.id && a.collectsGrowth === true)
        .map((a) => {
          const unflagged: MiningTaxAssignmentRecord = { ...a, updatedAt: now };
          delete unflagged.collectsGrowth;
          return unflagged;
        })
    : [];

  await putAssignments([kept, created, ...handedOver]);
  return { kept, created };
}

export async function deleteAssignments(
  assignments: readonly Pick<MiningTaxAssignmentRecord, 'id' | 'characterId'>[]
): Promise<void> {
  if (assignments.length === 0) return;
  await db.miningTaxAssignments.bulkDelete(assignments.map((a) => a.id));
  const idsByCharacter = new Map<number, string[]>();
  for (const a of assignments) {
    const ids = idsByCharacter.get(a.characterId);
    if (ids) ids.push(a.id);
    else idsByCharacter.set(a.characterId, [a.id]);
  }
  for (const [characterId, ids] of idsByCharacter) {
    await appendTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, characterId), ids);
  }
}

export interface ReleasePrices {
  prices: ReadonlyMap<number, number>;
  compressed: boolean;
}

export async function loadReleasePrices(
  assignment: MiningTaxAssignmentRecord,
  remaining: readonly MiningTaxOreLine[]
): Promise<ReleasePrices> {
  const payee =
    assignment.payeeId === undefined
      ? undefined
      : (await loadPayees(assignment.characterId)).find((p) => p.id === assignment.payeeId);
  const compressed = currentCompressedOre();
  const { prices } = await loadUnitPricesOnDate(
    remaining.filter((l) => l.quantity > 0).map((line) => line.typeId),
    hubForPayee(payee?.hubId),
    assignment.date,
    compressed
  );
  return { prices, compressed };
}

export async function releaseOreFromAssignment(
  assignment: MiningTaxAssignmentRecord,
  remaining: readonly MiningTaxOreLine[],
  priced: ReleasePrices,
  keepOverride = false
): Promise<MiningTaxAssignmentRecord | undefined> {
  const kept = remaining.filter((l) => l.quantity > 0);
  if (kept.length === 0) {
    await deleteAssignments([assignment]);
    return undefined;
  }
  const { estimatedValue, taxOwed } = computeAssignmentValue(
    kept,
    priced.prices,
    assignment.taxPct
  );
  const keptBy = new Map(kept.map((l) => [l.typeId, l.quantity]));
  const released = keepOverride
    ? []
    : assignment.oreLines
        .filter((l) => (keptBy.get(l.typeId) ?? 0) < l.quantity)
        .map((l) => l.typeId);
  const releasedTypeIds = [...new Set([...(assignment.releasedTypeIds ?? []), ...released])];
  const next: MiningTaxAssignmentRecord = withOreFormMarker(
    { ...assignment, oreLines: kept, estimatedValue, taxOwed, updatedAt: Date.now() },
    priced.compressed
  );
  delete next.oreLineValues;
  if (releasedTypeIds.length > 0) next.releasedTypeIds = releasedTypeIds;
  if (!keepOverride) asPilotAct(next);
  await putAssignments([next]);
  return next;
}

export async function planNeedsReviewResolution(
  assignment: MiningTaxAssignmentRecord,
  freshEntry: MiningLedgerEntry,
  siblings: readonly MiningTaxAssignmentRecord[]
): Promise<MiningTaxAssignmentRecord> {
  const relevantFresh = linesOwnedBy(freshEntry.oreLines, siblings, assignment.id);
  const payee =
    assignment.payeeId === undefined
      ? undefined
      : (await loadPayees(assignment.characterId)).find((p) => p.id === assignment.payeeId);
  const compressed = currentCompressedOre();
  const { prices } = await loadUnitPricesOnDate(
    relevantFresh.map((line) => line.typeId),
    hubForPayee(payee?.hubId),
    assignment.date,
    compressed
  );
  const { estimatedValue, taxOwed } = computeAssignmentValue(
    relevantFresh,
    prices,
    assignment.taxPct
  );
  const updated: MiningTaxAssignmentRecord = withOreFormMarker(
    {
      ...assignment,
      oreLines: relevantFresh,
      estimatedValue,
      taxOwed,
      status: 'outstanding',
      updatedAt: Date.now(),
    },
    compressed
  );
  delete updated.reviewDiff;
  delete updated.oreLineValues;
  return updated;
}

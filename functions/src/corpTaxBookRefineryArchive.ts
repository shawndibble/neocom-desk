import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { record, utcDayKey } from './communities.js';
import { EXTRACTIONS, OBSERVED, parseFeederTarget, type FeederTargetCall } from './corpTaxBook.js';
import { ENDED } from './corpTaxBookFeederOwnerCalls.js';
import type { FeederRecord, RefineryArchiveDoc } from './corpTaxBookFeeders.js';
import { fail, type Caller } from './actorAuth.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  feederRef,
  type BookDeps,
} from './corpTaxBookStore.js';

const REASONS: readonly RefineryArchiveDoc['reason'][] = ['gone', 'idle', 'manual'];

export interface SetRefineryArchiveInput extends FeederTargetCall {
  structureId: number;
  archived: boolean;
  reason: RefineryArchiveDoc['reason'];
}

export function parseSetRefineryArchiveInput(data: unknown): SetRefineryArchiveInput {
  const d = record(data);
  const id = d.structureId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'structureId must be a structure id');
  }
  if (typeof d.archived !== 'boolean') {
    throw new HttpsError('invalid-argument', 'archived must be true or false');
  }
  const reason = d.reason ?? 'manual';
  if (!REASONS.some((r) => r === reason)) {
    throw new HttpsError('invalid-argument', 'reason must be gone, idle or manual');
  }
  return {
    ...parseFeederTarget(data),
    structureId: id,
    archived: d.archived,
    reason: reason as RefineryArchiveDoc['reason'],
  };
}

export function archiveNeedsWrite(
  stored: RefineryArchiveDoc | undefined,
  archived: boolean,
  now: number
): boolean {
  if (!archived) return stored !== undefined;
  return stored === undefined || utcDayKey(stored.at) < utcDayKey(now);
}

export async function setRefineryArchive(
  deps: BookDeps,
  caller: Caller,
  input: SetRefineryArchiveInput
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const book = bookRef(deps.db, input.corporationId);
  const feeder = input.feederCorporationId;
  const [observed, extractions] = await Promise.all([
    book
      .collection(OBSERVED)
      .where('sourceCorporationId', '==', feeder)
      .where('structureId', '==', input.structureId)
      .limit(1)
      .get(),
    book
      .collection(EXTRACTIONS)
      .where('sourceCorporationId', '==', feeder)
      .where('structureId', '==', input.structureId)
      .limit(1)
      .get(),
  ]);
  if (input.archived && observed.empty && extractions.empty) {
    fail('not-found', 'Not one of this moon owner’s refineries', 'unknown-refinery');
  }
  const ref = feederRef(deps.db, input.corporationId, feeder);
  const field = new FieldPath('refineryArchive', String(input.structureId));
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const rec = snap.data() as FeederRecord | undefined;
    if (!rec) fail('not-found', 'No such moon owner', 'no-feeder');
    if (ENDED.includes(rec.status)) {
      fail('failed-precondition', 'This moon owner has left', 'feeder-ended');
    }
    const stored = rec.refineryArchive?.[String(input.structureId)];
    if (!archiveNeedsWrite(stored, input.archived, deps.now())) return;
    const doc: RefineryArchiveDoc = {
      at: deps.now(),
      by: access.characterId,
      reason: input.reason,
    };
    tx.update(ref, field, input.archived ? doc : FieldValue.delete());
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      input.archived ? 'refineryArchived' : 'refineryRestored',
      {
        feederCorporationId: feeder,
        structureId: input.structureId,
        ...(input.archived ? { reason: input.reason } : {}),
      }
    );
  });
  return { ok: true };
}

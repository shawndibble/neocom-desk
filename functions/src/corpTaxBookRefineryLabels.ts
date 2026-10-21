// Refinery labels (issue #4640, spec #4504): either side's officers label a moon owner's refinery.
// Written to the record and the view's refinery doc in one transaction, so a failed price read in a
// rebuild can't hold it back; the rest of the label chain is the client's. Failures carry a `reason`.
// A refinery's system (issue #4650) is learned by a miner's client from its own ledger and kept the
// same way, on the record and the view's refinery doc.

import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { record } from './communities.js';
import { OBSERVED, parseFeederTarget, type FeederTargetCall } from './corpTaxBook.js';
import type { CorpSyncDeps } from './corpSyncGrant.js';
import {
  authorizeFeederCaller,
  parseFeederCall,
  type FeederCall,
} from './corpTaxBookFeederGrant.js';
import { FEEDER_VIEW_REFINERIES, feederViewRef } from './corpTaxBookFeederView.js';
import { ENDED } from './corpTaxBookFeederOwnerCalls.js';
import { feederBookDeps } from './corpTaxBookFeederViewCalls.js';
import type { FeederRecord, RefineryLabelDoc } from './corpTaxBookFeeders.js';
import { characterIdForUid } from './verifyEveToken.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  fail,
  feederRef,
  type Actor,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';

export const MAX_REFINERY_LABEL = 100;

export interface RefineryLabelFields {
  structureId: number;
  /** Null clears it: the label chain falls back to the structure name and on. */
  label: string | null;
}

function parseLabelFields(data: unknown): RefineryLabelFields {
  const d = record(data);
  const id = d.structureId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'structureId must be a structure id');
  }
  if (d.label !== null && typeof d.label !== 'string') {
    throw new HttpsError('invalid-argument', 'label must be text or null');
  }
  const text = typeof d.label === 'string' ? d.label.trim() : '';
  if (text.length > MAX_REFINERY_LABEL) {
    throw new HttpsError(
      'invalid-argument',
      `label must be at most ${MAX_REFINERY_LABEL} characters`
    );
  }
  return { structureId: id, label: text === '' ? null : text };
}

/** The accounting corporation's officer labels one of a moon owner's refineries. */
export interface SetRefineryLabelInput extends FeederTargetCall, RefineryLabelFields {}

export function parseSetRefineryLabelInput(data: unknown): SetRefineryLabelInput {
  return { ...parseFeederTarget(data), ...parseLabelFields(data) };
}

/** The moon owner's own officer labels one of its refineries. */
export interface SetOwnRefineryLabelInput extends FeederCall, RefineryLabelFields {}

export function parseSetOwnRefineryLabelInput(data: unknown): SetOwnRefineryLabelInput {
  return { ...parseFeederCall(data), ...parseLabelFields(data) };
}

/** One label per refinery, replaced in a transaction: the last edit wins, whichever side made it. */
async function writeRefineryLabel(
  deps: BookDeps,
  collector: number,
  feeder: number,
  input: RefineryLabelFields,
  actor: Actor & { characterId: number },
  side: RefineryLabelDoc['side']
): Promise<{ ok: true }> {
  // Only a refinery that recorded this moon owner's ore: the map never grows past its refineries.
  const known = await bookRef(deps.db, collector)
    .collection(OBSERVED)
    .where('sourceCorporationId', '==', feeder)
    .where('structureId', '==', input.structureId)
    .limit(1)
    .get();
  if (known.empty) fail('not-found', 'Not one of this moon owner’s refineries', 'unknown-refinery');
  const ref = feederRef(deps.db, collector, feeder);
  const field = new FieldPath('refineryLabels', String(input.structureId));
  const viewRefinery = feederViewRef(deps.db, collector, feeder)
    .collection(FEEDER_VIEW_REFINERIES)
    .doc(String(input.structureId));
  await deps.db.runTransaction(async (tx) => {
    const [recSnap, viewSnap] = await Promise.all([tx.get(ref), tx.get(viewRefinery)]);
    const rec = recSnap.data() as FeederRecord | undefined;
    if (!rec) fail('not-found', 'No such moon owner', 'no-feeder');
    if (ENDED.includes(rec.status)) {
      fail('failed-precondition', 'This moon owner has left', 'feeder-ended');
    }
    const doc: RefineryLabelDoc | null =
      input.label === null
        ? null
        : {
            label: input.label,
            setAt: new Date(deps.now()).toISOString(),
            setBy: actor.characterId,
            side,
          };
    tx.update(ref, field, doc ?? FieldValue.delete());
    // Absent until the view's first build, which then reads the label off the record.
    if (viewSnap.exists) {
      tx.update(viewRefinery, { label: doc?.label ?? null, labelSetAt: doc?.setAt ?? null });
    }
    appendAudit(tx, deps, collector, actor, 'refineryLabelSet', {
      feederCorporationId: feeder,
      structureId: input.structureId,
      label: input.label,
      side,
    });
  });
  return { ok: true };
}

/** The accounting corporation's officers (Accountant or higher, live role check). */
export async function setRefineryLabel(
  deps: BookDeps,
  caller: Caller,
  input: SetRefineryLabelInput
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  return writeRefineryLabel(
    deps,
    input.corporationId,
    input.feederCorporationId,
    input,
    { characterId: access.characterId, name: access.characterName },
    'accounting'
  );
}

/** The moon owner's own CEO, Directors and Accountants (live role check). */
export async function setOwnRefineryLabel(
  deps: CorpSyncDeps,
  caller: Caller,
  input: SetOwnRefineryLabelInput
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  return writeRefineryLabel(
    feederBookDeps(deps),
    ctx.collectorCorporationId,
    input.corporationId,
    input,
    { characterId: ctx.callerId, name: 'Moon owner' },
    'moon-owner'
  );
}

/** The most refineries one learning call may name. */
export const MAX_LEARNED_SYSTEMS = 50;

/** A miner's client reports the systems its own ledger placed a book's moon owner refineries in. */
export interface LearnRefinerySystemsInput {
  /** The book's corporation. */
  corporationId: number;
  /** System by structure id. */
  systems: Record<string, number>;
}

const isId = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

export function parseLearnRefinerySystemsInput(data: unknown): LearnRefinerySystemsInput {
  const d = record(data);
  if (!isId(d.corporationId, 1)) {
    throw new HttpsError('invalid-argument', 'corporationId must be a corporation id');
  }
  const entries = Object.entries(record(d.systems));
  if (entries.length === 0 || entries.length > MAX_LEARNED_SYSTEMS) {
    throw new HttpsError(
      'invalid-argument',
      `systems must name 1 to ${MAX_LEARNED_SYSTEMS} refineries`
    );
  }
  const systems: Record<string, number> = {};
  for (const [id, system] of entries) {
    if (!isId(Number(id), 1) || String(Number(id)) !== id) {
      throw new HttpsError('invalid-argument', 'systems must be keyed by structure id');
    }
    if (!isId(system, 30_000_000, 32_000_000)) {
      throw new HttpsError('invalid-argument', 'systems must be solar system ids');
    }
    systems[id] = system;
  }
  return { corporationId: d.corporationId, systems };
}

/**
 * Keeps each system a miner's own ledger placed a moon owner's refinery in. Only a refinery the
 * caller's Character has a row at, from a moon owner, whose rows carry no system; the first one
 * learned stays. Says nothing about which it kept, so the call leaks nothing about the book.
 */
export async function learnRefinerySystems(
  deps: BookDeps,
  caller: Caller,
  input: LearnRefinerySystemsInput
): Promise<{ ok: true }> {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined) {
    fail('unauthenticated', 'Log in with a Character first', 'not-signed-in');
  }
  const book = bookRef(deps.db, input.corporationId);
  for (const [id, system] of Object.entries(input.systems)) {
    const own = await book
      .collection(OBSERVED)
      .where('uid', '==', caller.uid)
      .where('structureId', '==', Number(id))
      .limit(1)
      .get();
    const row = own.docs[0];
    const feeder: unknown = row?.get('sourceCorporationId');
    if (typeof feeder !== 'number' || typeof row.get('solarSystemId') === 'number') continue;
    const ref = feederRef(deps.db, input.corporationId, feeder);
    const field = new FieldPath('refinerySystems', id);
    const viewRefinery = feederViewRef(deps.db, input.corporationId, feeder)
      .collection(FEEDER_VIEW_REFINERIES)
      .doc(id);
    await deps.db.runTransaction(async (tx) => {
      const [recSnap, viewSnap] = await Promise.all([tx.get(ref), tx.get(viewRefinery)]);
      if (!recSnap.exists || recSnap.get(field) !== undefined) return;
      tx.update(ref, field, system);
      // Absent until the view's first build, which then reads it off the record.
      if (viewSnap.exists && typeof viewSnap.get('solarSystemId') !== 'number') {
        tx.update(viewRefinery, { solarSystemId: system });
      }
      appendAudit(
        tx,
        deps,
        input.corporationId,
        { characterId, name: '' },
        'refinerySystemLearned',
        {
          feederCorporationId: feeder,
          structureId: Number(id),
          solarSystemId: system,
        }
      );
    });
  }
  return { ok: true };
}

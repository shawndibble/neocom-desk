// Refinery labels (issue #4640, spec #4504): either side's officers give a moon owner's refinery a
// free-text label; the last edit wins. Stored on the moon owner's record (it carries on across a
// rejoin) and copied into the view's `refineries` docs on rebuild. The rest of the label chain
// (structure name, system, the moon owner's name plus the id) is the client's. Failures carry a
// stable `reason`; no player-facing text lives here.

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
import { tryRebuildFeederView } from './corpTaxBookFeederView.js';
import { feederBookDeps } from './corpTaxBookFeederViewCalls.js';
import type { FeederRecord, RefineryLabelDoc } from './corpTaxBookFeeders.js';
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

const ENDED: readonly FeederRecord['status'][] = ['left', 'removed'];

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
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
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
    appendAudit(tx, deps, collector, actor, 'refineryLabelSet', {
      feederCorporationId: feeder,
      structureId: input.structureId,
      label: input.label,
      side,
    });
  });
  await tryRebuildFeederView(deps, collector, feeder);
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

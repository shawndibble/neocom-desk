// The accounting corporation's side of a moon owner (issue #4586, spec #4504): agree a rate,
// switch to settled otherwise, and list open invite links. Officer-only, the same live role
// check as creating an invite. Failures carry a stable `reason`; no player-facing text lives here.

import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import {
  FEEDERS,
  FEEDER_INVITES_COLLECTION,
  parseBookCall,
  utcDate,
  type BookCall,
} from './corpTaxBook.js';
import type { FeederModeChange, OwnerRateEntry } from './corpTaxBookEngine.js';
import {
  deriveModeChanges,
  deriveOwnerRateHistory,
  tryRebuildFeederView,
} from './corpTaxBookFeederView.js';
import type { FeederInviteDoc, FeederRecord } from './corpTaxBookFeeders.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';

const MAX_NOTE = 500;

function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

// --- Input -----------------------------------------------------------------

export interface FeederTargetCall extends BookCall {
  feederCorporationId: number;
}

function parseTarget(data: unknown): FeederTargetCall {
  const id = record(data).feederCorporationId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'feederCorporationId must be a corporation id');
  }
  return { ...parseBookCall(data), feederCorporationId: id };
}

export interface SetFeederRateInput extends FeederTargetCall {
  /** The agreed owner rate (0-100). */
  pct: number;
}

export function parseSetFeederRateInput(data: unknown): SetFeederRateInput {
  const target = parseTarget(data);
  const pct = record(data).pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new HttpsError('invalid-argument', 'pct must be 0-100');
  }
  return { ...target, pct };
}

export interface SetFeederModeInput extends FeederTargetCall {
  mode: FeederRecord['mode'];
  note?: string;
}

export function parseSetFeederModeInput(data: unknown): SetFeederModeInput {
  const target = parseTarget(data);
  const d = record(data);
  if (d.mode !== 'normal' && d.mode !== 'settled-otherwise') {
    throw new HttpsError('invalid-argument', 'mode must be normal or settled-otherwise');
  }
  const blank = typeof d.note === 'string' && d.note.trim() === '';
  const note =
    d.note === undefined || d.note === null || blank
      ? undefined
      : boundedString(d.note, 'note', MAX_NOTE);
  return { ...target, mode: d.mode, ...(note !== undefined ? { note } : {}) };
}

// --- History ---------------------------------------------------------------

/** The history with an agreed rate dated today. Repeating the standing agreed rate adds nothing. */
export function appendAgreedRate(rec: FeederRecord, pct: number, now: number): OwnerRateEntry[] {
  const history = deriveOwnerRateHistory(rec);
  const lastAgreed = [...history].reverse().find((e) => e.kind === 'agreed');
  if (lastAgreed?.pct === pct) return history;
  return [
    ...history,
    {
      kind: 'agreed',
      pct,
      effectiveFrom: utcDate(now),
      recordedAt: new Date(now).toISOString(),
    },
  ];
}

/**
 * The mode switches with one dated today, so accrual resumes (or stops) from the switch day.
 * Returns the derived list unchanged when the mode does not move.
 */
export function appendModeChange(
  rec: FeederRecord,
  mode: FeederRecord['mode'],
  now: number
): FeederModeChange[] {
  const changes = deriveModeChanges(rec);
  const current = changes.at(-1)?.mode ?? 'normal';
  if (current === mode) return changes;
  return [...changes, { from: utcDate(now), mode }];
}

// --- Calls -----------------------------------------------------------------

const ENDED: readonly FeederRecord['status'][] = ['left', 'removed'];

async function editFeeder(
  deps: BookDeps,
  caller: Caller,
  input: FeederTargetCall,
  edit: (
    rec: FeederRecord,
    now: number
  ) => { update: Record<string, unknown>; action: string; detail: Record<string, unknown> }
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = bookRef(deps.db, input.corporationId)
    .collection(FEEDERS)
    .doc(String(input.feederCorporationId));
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec) fail('not-found', 'No such moon owner', 'no-feeder');
    if (ENDED.includes(rec.status)) {
      fail('failed-precondition', 'This moon owner has left', 'feeder-ended');
    }
    const { update, action, detail } = edit(rec, deps.now());
    tx.update(ref, update);
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      action,
      { feederCorporationId: input.feederCorporationId, ...detail }
    );
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  return { ok: true };
}

/** Agree a rate with a moon owner. It wins over what the moon owner asked for, from today on. */
export function setFeederRate(
  deps: BookDeps,
  caller: Caller,
  input: SetFeederRateInput
): Promise<{ ok: true }> {
  return editFeeder(deps, caller, input, (rec, now) => ({
    update: { agreedRatePct: input.pct, ownerRateHistory: appendAgreedRate(rec, input.pct, now) },
    action: 'feederRateAgreed',
    detail: { pct: input.pct },
  }));
}

/** Settle a moon owner otherwise (or back to normal), from today on. */
export function setFeederMode(
  deps: BookDeps,
  caller: Caller,
  input: SetFeederModeInput
): Promise<{ ok: true }> {
  return editFeeder(deps, caller, input, (rec, now) => ({
    update: {
      mode: input.mode,
      modeChanges: appendModeChange(rec, input.mode, now),
      note: input.note !== undefined ? input.note : FieldValue.delete(),
    },
    action: 'feederModeSet',
    detail: { mode: input.mode, ...(input.note !== undefined ? { note: input.note } : {}) },
  }));
}

export interface OpenFeederInvite {
  inviteId: string;
  createdBy: number;
  createdAt: number;
  offeredOwnerRatePct?: number;
}

/** The book's open invite links (neither revoked nor used), newest first. Never the codes: only hashes are stored. */
export async function listFeederInvites(
  deps: BookDeps,
  caller: Caller,
  input: BookCall
): Promise<{ invites: OpenFeederInvite[] }> {
  await authorizeOfficer(deps, caller, input, 'edit', { live: false });
  const snap = await deps.db
    .collection(FEEDER_INVITES_COLLECTION)
    .where('collectorCorporationId', '==', input.corporationId)
    .get();
  const invites = snap.docs
    .map((d) => ({ id: d.id, doc: d.data() as FeederInviteDoc }))
    .filter(({ doc }) => !doc.revokedAt && !doc.acceptedAt)
    .sort((a, b) => b.doc.createdAt - a.doc.createdAt)
    .map(({ id, doc }) => ({
      inviteId: id,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      ...(doc.offeredOwnerRatePct !== undefined
        ? { offeredOwnerRatePct: doc.offeredOwnerRatePct }
        : {}),
    }));
  return { invites };
}

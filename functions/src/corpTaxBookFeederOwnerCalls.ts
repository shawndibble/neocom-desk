import { utcDay } from './timeConstants.js';
import { fail, type Caller } from './actorAuth.js';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import {
  FEEDER_INVITES_COLLECTION,
  parseFeederTarget,
  dateString,
  pctField,
  type BookCall,
  type FeederTargetCall,
} from './corpTaxBook.js';
import {
  latestOwnerRate,
  shiftDate,
  type FeederModeChange,
  type OwnerRateEntry,
} from './corpTaxBookEngine.js';
import {
  deriveModeChanges,
  deriveOwnerRateHistory,
  tryRebuildFeederView,
} from './corpTaxBookFeederView.js';
import type { FeederInviteDoc, FeederRecord } from './corpTaxBookFeeders.js';
import type { AuditAction } from './corpTaxBookKinds.js';
import { appendAudit, authorizeOfficer, feederRef, type BookDeps } from './corpTaxBookStore.js';

const MAX_NOTE = 500;

export const MAX_AS_OF_DAYS_BACK = 30;

export interface SetFeederRateInput extends FeederTargetCall {
  pct: number;
  asOf?: string;
}

export function parseSetFeederRateInput(data: unknown): SetFeederRateInput {
  const target = parseFeederTarget(data);
  const d = record(data);
  const asOf = d.asOf === undefined || d.asOf === null ? undefined : dateString(d.asOf, 'asOf');
  return { ...target, pct: pctField(d.pct, 'pct'), ...(asOf !== undefined ? { asOf } : {}) };
}

export function resolveAsOf(rec: FeederRecord, asOf: string | undefined, now: number): string {
  const today = utcDay(now);
  if (asOf === undefined) return today;
  const limit = shiftDate(today, -MAX_AS_OF_DAYS_BACK);
  const joined = utcDay(rec.joinedAt);
  const earliest = joined > limit ? joined : limit;
  if (asOf > today || asOf < earliest) {
    fail('invalid-argument', 'The as-of date is outside the allowed days', 'as-of-out-of-range');
  }
  return asOf;
}

export interface SetFeederModeInput extends FeederTargetCall {
  mode: FeederRecord['mode'];
  note?: string;
}

export function parseSetFeederModeInput(data: unknown): SetFeederModeInput {
  const target = parseFeederTarget(data);
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

export function appendAgreedRate(
  rec: FeederRecord,
  pct: number,
  now: number,
  asOf: string = utcDay(now)
): OwnerRateEntry[] {
  const history = deriveOwnerRateHistory(rec);
  const standing = latestOwnerRate(history, 'agreed', utcDay(now));
  if (standing?.pct === pct && asOf >= standing.effectiveFrom) return history;
  return [
    ...history,
    {
      kind: 'agreed',
      pct,
      effectiveFrom: asOf,
      recordedAt: new Date(now).toISOString(),
      noBackdate: true,
    },
  ];
}

export function appendModeChange(
  rec: FeederRecord,
  mode: FeederRecord['mode'],
  now: number
): FeederModeChange[] {
  const changes = deriveModeChanges(rec);
  const current = changes.at(-1)?.mode ?? 'normal';
  if (current === mode) return changes;
  return [...changes, { from: utcDay(now), mode }];
}

export const ENDED: readonly FeederRecord['status'][] = ['left', 'removed'];

async function editFeeder(
  deps: BookDeps,
  caller: Caller,
  input: FeederTargetCall,
  edit: (
    rec: FeederRecord,
    now: number
  ) => { update: Record<string, unknown>; action: AuditAction; detail: Record<string, unknown> }
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = feederRef(deps.db, input.corporationId, input.feederCorporationId);
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

export function setFeederRate(
  deps: BookDeps,
  caller: Caller,
  input: SetFeederRateInput
): Promise<{ ok: true }> {
  return editFeeder(deps, caller, input, (rec, now) => {
    const asOf = resolveAsOf(rec, input.asOf, now);
    return {
      update: {
        agreedRatePct: input.pct,
        ownerRateHistory: appendAgreedRate(rec, input.pct, now, asOf),
      },
      action: 'feederRateAgreed',
      detail: { pct: input.pct, asOf },
    };
  });
}

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
    .filter(({ doc }) => !doc.revokedAt && !doc.acceptedAt && !doc.selfInvite)
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

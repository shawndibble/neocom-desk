// A moon owner's payee (issues #4619, #4653, spec #4504): either side's officers name it, the last
// edit wins. The accounting corporation's Accountant or higher (`setBookFeederPayee`) and the moon
// owner's own CEO, Directors and Accountants (`setFeederPayee`), both with a live role check. Every
// change stamps `payeeChangedAt` (engine `withPayee`, which the removal's payee link reads) and
// appends `payeeHistory` (payout matching), records who set it, and names whom the changing
// officer's client mails: the other side. Failures carry a stable `reason`; no player-facing text.

import { HttpsError } from 'firebase-functions/v2/https';
import { record } from './communities.js';
import { parseFeederTarget, type FeederTargetCall } from './corpTaxBook.js';
import type { CorpSyncDeps } from './corpSyncGrant.js';
import type { IdCategoryLookup } from './corpTaxBookEsi.js';
import {
  moonOwnerMailRecipients,
  withPayee,
  withPayeeChange,
  type Payee,
  type PayeeChange,
} from './corpTaxBookEngine.js';
import {
  authorizeFeederCaller,
  parseFeederCall,
  type FeederCall,
} from './corpTaxBookFeederGrant.js';
import { tryRebuildFeederView } from './corpTaxBookFeederView.js';
import { feederBookDeps } from './corpTaxBookFeederViewCalls.js';
import type { FeederRecord, PayeeSetBy } from './corpTaxBookFeeders.js';
import {
  appendAudit,
  authorizeOfficer,
  fail,
  feederRef,
  liveOfficerIds,
  type Actor,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';

function parsePayee(data: unknown): Payee {
  const { kind, id } = record(record(data).payee);
  if (
    (kind !== 'corporation' && kind !== 'character') ||
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    throw new HttpsError('invalid-argument', 'payee must be a corporation or character id');
  }
  return { kind, id };
}

/** The moon owner's own officer names its payee. */
export interface SetFeederPayeeInput extends FeederCall {
  payee: Payee;
}

export function parseSetFeederPayeeInput(data: unknown): SetFeederPayeeInput {
  return { ...parseFeederCall(data), payee: parsePayee(data) };
}

/** The accounting corporation's officer names a moon owner's payee. */
export interface SetBookFeederPayeeInput extends FeederTargetCall {
  payee: Payee;
}

export function parseSetBookFeederPayeeInput(data: unknown): SetBookFeederPayeeInput {
  return { ...parseFeederTarget(data), payee: parsePayee(data) };
}

export interface PayeeSetResult {
  ok: true;
  /** False when the payee named is the one already in force: nothing written, nobody told. */
  changed: boolean;
  /** Character ids the changing officer's client mails: the other side. */
  recipients: number[];
}

type PayeeRecord = FeederRecord & { payeeHistory?: PayeeChange[] };

/**
 * One write for either side: the id is checked against ESI first (#4621), then the payee, its
 * stamp, history and who set it go in one transaction with the audit entry. Returns the payee
 * that was in force before, or null when nothing changed.
 */
async function writePayee(
  deps: BookDeps,
  collector: number,
  feeder: number,
  payee: Payee,
  actor: Actor & { characterId: number },
  side: PayeeSetBy['side'],
  idCategory: IdCategoryLookup
): Promise<{ before: Payee | undefined } | null> {
  // The id must be the kind it claims (#4621): a character stored as a corporation would send
  // payouts and the removal link to the wrong place. ESI down fails the call; nothing is written.
  if ((await idCategory(payee.id)) !== payee.kind) {
    fail(
      'invalid-argument',
      'That id is not a corporation or player of that kind',
      'payee-mismatch'
    );
  }
  const ref = feederRef(deps.db, collector, feeder);
  const out = await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as PayeeRecord | undefined;
    if (!rec) fail('not-found', 'No such moon owner', 'no-feeder');
    if (rec.status !== 'active' && rec.status !== 'pending-removal') {
      fail('failed-precondition', 'This moon owner has left', 'feeder-ended');
    }
    // Unset means the moon owner corporation: naming it (or the standing payee) changes nothing.
    const current = rec.payee ?? { kind: 'corporation', id: feeder };
    if (current.kind === payee.kind && current.id === payee.id) return null;
    const now = deps.now();
    const next = withPayee(rec, payee, now);
    const setBy: PayeeSetBy = { side, characterId: actor.characterId, at: now };
    tx.update(ref, {
      payee,
      ...(next.payeeChangedAt !== undefined ? { payeeChangedAt: next.payeeChangedAt } : {}),
      payeeHistory: withPayeeChange(rec, payee, now),
      payeeSetBy: setBy,
    });
    appendAudit(tx, deps, collector, actor, 'feederPayeeSet', {
      feederCorporationId: feeder,
      payee,
      side,
    });
    return { before: rec.payee };
  });
  if (out) await tryRebuildFeederView(deps, collector, feeder);
  return out;
}

const without = (ids: readonly number[], callerId: number) => ids.filter((id) => id !== callerId);

/**
 * The moon owner's CEO, Directors and Accountants (live role check). The accounting
 * corporation's officers with book access are told.
 */
export async function setFeederPayee(
  deps: CorpSyncDeps,
  caller: Caller,
  input: SetFeederPayeeInput,
  idCategory: IdCategoryLookup
): Promise<PayeeSetResult> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  const book = feederBookDeps(deps);
  const out = await writePayee(
    book,
    ctx.collectorCorporationId,
    input.corporationId,
    input.payee,
    { characterId: ctx.callerId, name: 'Moon owner' },
    'moon-owner',
    idCategory
  ).catch((err: unknown) => {
    // The moon owner's officer only ever hears that it is not handled any more.
    const reason = (err as HttpsError).details as { reason?: string } | undefined;
    if (reason?.reason === 'no-feeder' || reason?.reason === 'feeder-ended') {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    throw err;
  });
  if (!out) return { ok: true, changed: false, recipients: [] };
  const officers = await liveOfficerIds(book, ctx.collectorCorporationId);
  return { ok: true, changed: true, recipients: without(officers, ctx.callerId) };
}

/**
 * The accounting corporation's Accountant or higher (live role check). The moon owner's CEO
 * and both the old and the new payee are told (engine `moonOwnerMailRecipients`).
 */
export async function setBookFeederPayee(
  deps: BookDeps,
  caller: Caller,
  input: SetBookFeederPayeeInput,
  idCategory: IdCategoryLookup
): Promise<PayeeSetResult> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const out = await writePayee(
    deps,
    input.corporationId,
    input.feederCorporationId,
    input.payee,
    { characterId: access.characterId, name: access.characterName },
    'accounting',
    idCategory
  );
  if (!out) return { ok: true, changed: false, recipients: [] };
  const ceoOf = deps.corporationCeo ?? (async () => undefined);
  const ceo = (id: number) => ceoOf(id).catch(() => undefined);
  const ceoId = (await ceo(input.feederCorporationId)) ?? null;
  const toldOf = async (payee: Payee | undefined) =>
    moonOwnerMailRecipients({
      ceoId,
      ...(payee ? { payee } : {}),
      payeeCeoId: payee?.kind === 'corporation' ? ((await ceo(payee.id)) ?? null) : null,
    });
  const ids = [...new Set([...(await toldOf(out.before)), ...(await toldOf(input.payee))])];
  return { ok: true, changed: true, recipients: without(ids, access.characterId) };
}

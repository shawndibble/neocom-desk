import { fail, type Caller } from './actorAuth.js';
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
  feederRef,
  liveOfficerIds,
  type Actor,
  type BookDeps,
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

const parseNotify = (data: unknown): boolean => record(data).notify === true;

export interface SetFeederPayeeInput extends FeederCall {
  payee: Payee;
  notify?: boolean;
}

export function parseSetFeederPayeeInput(data: unknown): SetFeederPayeeInput {
  return { ...parseFeederCall(data), payee: parsePayee(data), notify: parseNotify(data) };
}

export interface SetBookFeederPayeeInput extends FeederTargetCall {
  payee: Payee;
  notify?: boolean;
}

export function parseSetBookFeederPayeeInput(data: unknown): SetBookFeederPayeeInput {
  return { ...parseFeederTarget(data), payee: parsePayee(data), notify: parseNotify(data) };
}

export type PayeeSetResult =
  | { ok: true; changed: false; recipients: [] }
  | {
      ok: true;
      changed: true;
      at: number;
      recipients: number[];
    };

const UNCHANGED: PayeeSetResult = { ok: true, changed: false, recipients: [] };

type PayeeRecord = FeederRecord & { payeeHistory?: PayeeChange[] };

interface PayeeWrite {
  collector: number;
  feeder: number;
  payee: Payee;
  actor: Actor & { characterId: number };
  side: PayeeSetBy['side'];
}

async function writePayee(
  deps: BookDeps,
  w: PayeeWrite,
  idCategory: IdCategoryLookup
): Promise<{ before: Payee | undefined; at: number } | null> {
  if ((await idCategory(w.payee.id)) !== w.payee.kind) {
    fail(
      'invalid-argument',
      'That id is not a corporation or player of that kind',
      'payee-mismatch'
    );
  }
  const ref = feederRef(deps.db, w.collector, w.feeder);
  const out = await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as PayeeRecord | undefined;
    if (!rec) fail('not-found', 'No such moon owner', 'no-feeder');
    if (rec.status !== 'active' && rec.status !== 'pending-removal') {
      fail('failed-precondition', 'This moon owner has left', 'feeder-ended');
    }
    const current = rec.payee ?? { kind: 'corporation', id: w.feeder };
    if (current.kind === w.payee.kind && current.id === w.payee.id) return null;
    const now = deps.now();
    const next = withPayee(rec, w.payee, now);
    const setBy: PayeeSetBy = { side: w.side, characterId: w.actor.characterId, at: now };
    tx.update(ref, {
      payee: w.payee,
      ...(next.payeeChangedAt !== undefined ? { payeeChangedAt: next.payeeChangedAt } : {}),
      payeeHistory: withPayeeChange(rec, w.payee, now),
      payeeSetBy: setBy,
    });
    appendAudit(tx, deps, w.collector, w.actor, 'feederPayeeSet', {
      feederCorporationId: w.feeder,
      payee: w.payee,
      side: w.side,
    });
    return { before: rec.payee, at: now };
  });
  if (out) await tryRebuildFeederView(deps, w.collector, w.feeder);
  return out;
}

const without = (ids: readonly number[], callerId: number) => ids.filter((id) => id !== callerId);

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
  const write: PayeeWrite = {
    collector: ctx.collectorCorporationId,
    feeder: input.corporationId,
    payee: input.payee,
    actor: { characterId: ctx.callerId, name: 'Moon owner' },
    side: 'moon-owner',
  };
  const out = await writePayee(book, write, idCategory).catch((err: unknown) => {
    const reason = err instanceof HttpsError ? (err.details as { reason?: string }) : undefined;
    if (reason?.reason === 'no-feeder' || reason?.reason === 'feeder-ended') {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    throw err;
  });
  if (!out) return UNCHANGED;
  const officers = input.notify ? await liveOfficerIds(book, ctx.collectorCorporationId) : [];
  return { ok: true, changed: true, at: out.at, recipients: without(officers, ctx.callerId) };
}

export async function setBookFeederPayee(
  deps: BookDeps,
  caller: Caller,
  input: SetBookFeederPayeeInput,
  idCategory: IdCategoryLookup
): Promise<PayeeSetResult> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const out = await writePayee(
    deps,
    {
      collector: input.corporationId,
      feeder: input.feederCorporationId,
      payee: input.payee,
      actor: { characterId: access.characterId, name: access.characterName },
      side: 'accounting',
    },
    idCategory
  );
  if (!out) return UNCHANGED;
  if (!input.notify) return { ok: true, changed: true, at: out.at, recipients: [] };
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
  return { ok: true, changed: true, at: out.at, recipients: without(ids, access.characterId) };
}

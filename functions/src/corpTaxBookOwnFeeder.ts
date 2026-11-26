import {
  FEEDER_OF_COLLECTION,
  dateString,
  parseBookCall,
  parseFeederTarget,
  type BookCall,
  type FeederTargetCall,
} from './corpTaxBook.js';
import { boundedString, newInviteCode, record } from './communities.js';
import {
  LEAVABLE,
  RECONNECT_CODE,
  bookDeps,
  endFeeder,
  saveFeederGrant,
  type FeederGrantDeps,
  type SaveFeederGrantResult,
} from './corpTaxBookFeederGrant.js';
import {
  hashInviteCode,
  inviteRef,
  requireActiveBook,
  type FeederInviteDoc,
  type FeederRecord,
} from './corpTaxBookFeeders.js';
import { authorizeOfficer, feederRef } from './corpTaxBookStore.js';
import { fail, type Caller } from './actorAuth.js';
import type { CorpSyncDeps } from './corpSyncGrant.js';

export const OWN_FEEDER_REASONS = ['wrong-corp', 'not-yours'] as const;

export interface AddOwnFeederInput extends BookCall {
  grantAccessToken: string;
  grantRefreshToken: string;
  feederCorporationId: number;
  coverageFrom?: string;
}

export function requireToken(call: BookCall): void {
  if (call.accessToken === undefined) {
    fail('invalid-argument', 'accessToken is required', 'token-required');
  }
}

export function parseAddOwnFeederInput(data: unknown): AddOwnFeederInput {
  const d = record(data);
  const call = parseBookCall(data);
  requireToken(call);
  const out: AddOwnFeederInput = {
    ...call,
    grantAccessToken: boundedString(d.grantAccessToken, 'grantAccessToken', 8192),
    grantRefreshToken: boundedString(d.grantRefreshToken, 'grantRefreshToken', 8192),
    feederCorporationId: parseFeederTarget(data).feederCorporationId,
  };
  if (d.coverageFrom !== undefined && d.coverageFrom !== null) {
    out.coverageFrom = dateString(d.coverageFrom, 'coverageFrom');
  }
  return out;
}

export function parseRemoveOwnFeederInput(data: unknown): FeederTargetCall {
  const target = parseFeederTarget(data);
  requireToken(target);
  return target;
}

export async function addOwnFeeder(
  deps: FeederGrantDeps,
  caller: Caller,
  input: AddOwnFeederInput
): Promise<SaveFeederGrantResult> {
  const book = bookDeps(deps);
  const access = await authorizeOfficer(book, caller, input, 'edit', { live: true });
  await requireActiveBook(book, input.corporationId);
  if (input.feederCorporationId === input.corporationId) {
    fail('failed-precondition', 'A corporation cannot feed its own book', 'own-book-exists');
  }
  if (await isActiveOwnFeeder(deps, input.corporationId, input.feederCorporationId)) {
    return saveFeederGrant(
      deps,
      caller,
      {
        code: RECONNECT_CODE,
        accessToken: input.grantAccessToken,
        refreshToken: input.grantRefreshToken,
      },
      { expectedFeederCorp: input.feederCorporationId, reconnectOwnOf: input.corporationId }
    );
  }
  const code = newInviteCode();
  const id = hashInviteCode(code);
  const doc: FeederInviteDoc = {
    collectorCorporationId: input.corporationId,
    createdBy: access.characterId,
    createdAt: deps.now(),
    sameOwner: true,
    selfInvite: true,
    ...(input.coverageFrom !== undefined ? { coverageFrom: input.coverageFrom } : {}),
  };
  await inviteRef(deps.db, id).create(doc);
  try {
    return await saveFeederGrant(
      deps,
      caller,
      { code, accessToken: input.grantAccessToken, refreshToken: input.grantRefreshToken },
      { expectedFeederCorp: input.feederCorporationId }
    );
  } catch (err) {
    try {
      await inviteRef(deps.db, id).delete();
    } catch (e) {
      deps.log('self-invite not removed', { error: e instanceof Error ? e.message : String(e) });
    }
    throw err;
  }
}

async function isActiveOwnFeeder(
  deps: FeederGrantDeps,
  collector: number,
  feederCorp: number
): Promise<boolean> {
  const [rec, pointer] = await Promise.all([
    feederRef(deps.db, collector, feederCorp).get(),
    deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp)).get(),
  ]);
  const held = rec.data() as FeederRecord | undefined;
  return (
    held?.sameOwner === true &&
    held.status === 'active' &&
    pointer.data()?.collectorCorporationId === collector
  );
}

export async function removeOwnFeeder(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederTargetCall
): Promise<{ removed: true }> {
  const book = bookDeps(deps);
  const access = await authorizeOfficer(book, caller, input, 'edit', { live: true });
  const rec = (
    await feederRef(deps.db, input.corporationId, input.feederCorporationId).get()
  ).data() as FeederRecord | undefined;
  if (!rec || rec.sameOwner !== true) {
    fail('failed-precondition', 'Only your own corporations are removed this way', 'not-yours');
  }
  await endFeeder(deps, {
    collectorCorporationId: input.corporationId,
    feederCorporationId: input.feederCorporationId,
    effectiveAt: deps.now(),
    finalStatus: 'removed',
    actor: { characterId: access.characterId, name: access.characterName },
    action: 'feederRemoved',
    allowed: LEAVABLE,
    guard: (r) => r.sameOwner === true,
  });
  return { removed: true };
}

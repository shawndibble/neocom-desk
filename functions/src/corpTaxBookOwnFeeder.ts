// "Add my other corps" (decision "Own corps join a Collector book without an invite link"): a
// CEO who owns many alt corporations brings each one's moons into the main corporation's Corp
// Tax Book without invite links. Two router actions' logic:
//
//   addOwnFeeder     an editor of the Collector, holding the CEO alt's mining-scope tokens: mint
//                    an internal self-invite and run the ordinary mining-grant save with it
//   removeOwnFeeder  an editor ends a same-owner moon owner at once (no 24 hour notice mail)
//
// The same owner is proven by controlling the CEO alt's refresh token in the same request, not by
// any account link. Failures carry stable `reason` codes; no player-facing text lives here.

import {
  dateString,
  parseBookCall,
  parseFeederTarget,
  type BookCall,
  type FeederTargetCall,
} from './corpTaxBook.js';
import { boundedString, newInviteCode, record } from './communities.js';
import {
  LEAVABLE,
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

/** Refusal reasons this pair of actions adds to the existing grant and invite ones. */
export const OWN_FEEDER_REASONS = ['wrong-corp', 'not-yours'] as const;

export interface AddOwnFeederInput extends BookCall {
  /** The CEO alt's mining-scope tokens (a separate SSO login). */
  grantAccessToken: string;
  grantRefreshToken: string;
  /** The corporation the alt is expected to be in; any other is refused `wrong-corp`. */
  feederCorporationId: number;
  /** First covered day (UTC); clamped server side. Absent: today. */
  coverageFrom?: string;
}

function requireToken(call: BookCall): void {
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
  // The code never leaves this function: the invite exists only for the save below.
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
    // A refused save unwound everything it wrote; the self-invite is no use to anyone.
    try {
      await inviteRef(deps.db, id).delete();
    } catch (e) {
      deps.log('self-invite not removed', { error: e instanceof Error ? e.message : String(e) });
    }
    throw err;
  }
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

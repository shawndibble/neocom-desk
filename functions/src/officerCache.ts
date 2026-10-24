// The held-officer cache (ADR 0023 D7, ADR 0026 D8): the one place that decides whether a
// stored officer record can answer a call, and that writes or revokes it. A store passes the
// record's ref, so its own collection and TTL stay with it; the response shape stays there too.
import type { DocumentReference } from 'firebase-admin/firestore';
import { isCacheFresh, type OfficerAccess } from './corpTaxBook.js';
import type { Caller } from './actorAuth.js';

export interface OfficerCacheRead {
  /** The stored record, usable or not: a denied renewal revokes it. */
  held: OfficerAccess | undefined;
  /** `held` when it is the caller's own owner and corporation, unexpired and checked within the cache window. */
  usable: OfficerAccess | undefined;
}

/** The caller's stored officer record and whether it can answer without a live role check. */
export async function readOfficerCache(
  ref: DocumentReference,
  caller: Caller,
  corporationId: number,
  now: number
): Promise<OfficerCacheRead> {
  const held = (await ref.get()).data() as OfficerAccess | undefined;
  const usable =
    held !== undefined &&
    held.ownerHash === caller.ownerHash &&
    held.corporationId === corporationId &&
    held.expiresAt > now &&
    isCacheFresh(held.checkedAt, now)
      ? held
      : undefined;
  return { held, usable };
}

/** Stores the access the live check just granted. */
export async function cacheOfficer(ref: DocumentReference, access: OfficerAccess): Promise<void> {
  await ref.set(access);
}

/** Deletes the record a failed renewal supersedes; nothing to do when none was held. */
export async function revokeOfficer(
  ref: DocumentReference,
  held: OfficerAccess | undefined
): Promise<void> {
  if (held) await ref.delete();
}

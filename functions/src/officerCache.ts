import type { DocumentReference } from 'firebase-admin/firestore';
import { isCacheFresh, type OfficerAccess } from './corpTaxBook.js';
import type { Caller } from './actorAuth.js';

export interface OfficerCacheRead {
  held: OfficerAccess | undefined;
  usable: OfficerAccess | undefined;
}

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

export async function cacheOfficer(ref: DocumentReference, access: OfficerAccess): Promise<void> {
  await ref.set(access);
}

export async function revokeOfficer(
  ref: DocumentReference,
  held: OfficerAccess | undefined
): Promise<void> {
  if (held) await ref.delete();
}

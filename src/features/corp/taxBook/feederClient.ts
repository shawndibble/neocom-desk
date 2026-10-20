/**
 * The moon owner's side of a Collector book, client side: pasting an invite,
 * reading where the corporation stands, and leaving. The grant itself is
 * `feederGrant.ts`. Player-facing text never says feeder or Collector.
 */
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFunctions } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';

/** The query parameter an invite link carries its code in. */
export const INVITE_PARAM = 'invite';

const CODE = /^[A-Za-z0-9_-]{8,}$/;

/** The code in a pasted invite link, or a bare code; `null` when it is neither. */
export function parseInviteInput(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  try {
    const fromLink = new URL(text).searchParams.get(INVITE_PARAM)?.trim();
    if (fromLink && CODE.test(fromLink)) return fromLink;
    return null;
  } catch {
    return CODE.test(text) ? text : null;
  }
}

/** A link to paste into EVE chat or mail. */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/corp/moons?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}

export interface FeederRefinery {
  structureId: number;
  label: string | null;
  volume: number;
}

export type FeederStatus =
  | { status: 'none' }
  | {
      status: 'feeder';
      collectorCorporationId: number;
      collectorName: string | null;
      feederStatus: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
      lastReadWellAt: number | null;
      lastSyncResult: string | null;
      requestedRatePct: number | null;
      effectiveRatePct: number | null;
      isHolder: boolean;
      refineries: FeederRefinery[];
      owedIsk: number | null;
    };

async function call<In, Out>(characterId: number, name: string, data: In): Promise<Out> {
  await ensureSignedIn(characterId);
  return (await httpsCallable<In, Out>(getSyncFunctions(), name)(data)).data;
}

/** Where this corporation stands as a moon owner. Roles are checked live, so the access token travels. */
export async function getFeederStatus(
  characterId: number,
  corporationId: number
): Promise<FeederStatus> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    return await call<{ corporationId: number; accessToken: string }, FeederStatus>(
      characterId,
      'getCorpTaxBookFeederStatusCallable',
      { corporationId, accessToken }
    );
  } catch (error) {
    // A member who may not see the corporation's standing sees the ordinary choices.
    const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason;
    if (reason === 'not-your-feeder') return { status: 'none' };
    throw error;
  }
}

/** Leave the accounting corporation: revokes the grant at SSO and deletes it. Immediate. */
export async function leaveFeeder(
  characterId: number,
  corporationId: number
): Promise<{ left: true; owedIsk: number | null }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'leaveCorpTaxBookFeederCallable', { corporationId, accessToken });
}

/** A new invite link for a book that collects for others; `offeredOwnerRatePct` is optional. */
export async function createFeederInvite(
  characterId: number,
  corporationId: number,
  offeredOwnerRatePct?: number
): Promise<{ code: string; inviteId: string }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'createCorpTaxBookFeederInviteCallable', {
    corporationId,
    accessToken,
    ...(offeredOwnerRatePct === undefined ? {} : { offeredOwnerRatePct }),
  });
}

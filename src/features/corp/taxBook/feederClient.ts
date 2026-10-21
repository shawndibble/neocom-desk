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

/** An open invite link; only its id is stored, never the code. */
export interface OpenInvite {
  inviteId: string;
  createdBy: number;
  createdAt: number;
  offeredOwnerRatePct?: number;
}

/** Agree a rate with a moon owner; it wins over the rate they asked for, from today. */
export async function setFeederRate(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  pct: number
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'setCorpTaxBookFeederRateCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    pct,
  });
}

/** Settle a moon owner otherwise (or back to normal) from today, with an optional note. */
export async function setFeederMode(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  mode: 'normal' | 'settled-otherwise',
  note?: string
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'setCorpTaxBookFeederModeCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    mode,
    ...(note === undefined || note.trim() === '' ? {} : { note }),
  });
}

/** Revoke an open invite link. */
export async function revokeFeederInvite(
  characterId: number,
  corporationId: number,
  inviteId: string
): Promise<{ revoked: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'revokeCorpTaxBookFeederInviteCallable', {
    corporationId,
    accessToken,
    inviteId,
  });
}

/** The book's open invite links, newest first. Uses the cached officer check: no access token. */
export async function listFeederInvites(
  characterId: number,
  corporationId: number
): Promise<OpenInvite[]> {
  const { invites } = await call<{ corporationId: number }, { invites: OpenInvite[] }>(
    characterId,
    'listCorpTaxBookFeederInvitesCallable',
    { corporationId }
  );
  return invites;
}

/** Removing a moon owner (#4520): the server's answer when a removal starts. */
export interface StartedRemoval {
  startedAt: number;
  /** The code for the "Remove now" link in the mail; never shown elsewhere. */
  code: string;
  /** Character ids the one mail goes to. */
  recipients: number[];
}

/** Start a 24-hour removal. The 24 hours begin when the notice is sent. */
export async function startFeederRemoval(
  characterId: number,
  corporationId: number,
  feederCorporationId: number
): Promise<StartedRemoval> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'startCorpTaxBookFeederRemovalCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
  });
}

/** The notice went out: the removal's 24 hours run from `sentAt`. The first notice wins. */
export async function recordFeederRemovalSent(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  sentAt?: number
): Promise<{ effectiveAt: number | null }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'recordCorpTaxBookFeederRemovalSentCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    ...(sentAt === undefined ? {} : { sentAt }),
  });
}

/** Cancel a pending removal; returns whom the short cancellation mail goes to. */
export async function cancelFeederRemoval(
  characterId: number,
  corporationId: number,
  feederCorporationId: number
): Promise<{ recipients: number[] }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'cancelCorpTaxBookFeederRemovalCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
  });
}

/**
 * The payee's "Remove now" page: one answer for a link that cannot be used, whatever the reason
 * (expired, over, guarded, or the wrong person), with when the removal takes effect, if known.
 */
export type RemovalLinkState =
  | { available: false; effectiveAt: number | null }
  | {
      available: true;
      collectorCorporationId: number;
      feederCorporationId: number;
      effectiveAt: number | null;
    };

export function getRemovalLink(characterId: number, code: string): Promise<RemovalLinkState> {
  return call(characterId, 'getCorpTaxBookRemovalLinkCallable', { code });
}

/** End the removal now, as the payee. `ended: false` is the same neutral answer as an expired link. */
export function forceRemoval(
  characterId: number,
  code: string
): Promise<{ ended: boolean; effectiveAt: number | null }> {
  return call(characterId, 'forceCorpTaxBookRemovalCallable', { code });
}

/** Set a moon owner's payee; stamps when it changed. */
export async function setFeederPayee(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  payee: { kind: 'corporation' | 'character'; id: number }
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'setCorpTaxBookFeederPayeeCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    payee,
  });
}

import { getValidAccessToken } from '@/auth/session';
import type { ArchiveReason } from '@/engine/corpTaxBook/moonOwnerRefineries';
import type { FeederMode } from '@/engine/corpTaxBook/feederAccrual';
import type { OutgoingDonation, Payee } from '@/engine/corpTaxBook/payouts';
import { callableErrorReason } from '@/lib/callableError';
import { callSignedIn } from '@/sync/signedInCallable';
import type { PayeeSetResult } from './feederViewClient';

export const INVITE_PARAM = 'invite';

const CODE = /^[A-Za-z0-9_-]{8,}$/;

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

export function inviteLink(origin: string, code: string): string {
  return `${origin}/corp/moons?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}

export interface FeederRefinery {
  structureId: number;
  label: string | null;
  volume: number;
}

export type FeederSetupStatus =
  | {
      status: 'none';
      ownBookFrom?: string;
      previousCollectorIds?: number[];
    }
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
      previousCollectorIds?: number[];
    };

export async function getFeederStatus(
  characterId: number,
  corporationId: number
): Promise<FeederSetupStatus> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    return await callSignedIn<{ corporationId: number; accessToken: string }, FeederSetupStatus>(
      characterId,
      'getCorpTaxBookFeederStatusCallable',
      { corporationId, accessToken }
    );
  } catch (error) {
    if (callableErrorReason(error) === 'not-your-feeder') return { status: 'none' };
    throw error;
  }
}

export interface FeederInvitePreview {
  collectorCorporationId: number;
  collectorName: string | null;
  offeredOwnerRatePct: number | null;
}

export function previewFeederInvite(
  characterId: number,
  code: string
): Promise<FeederInvitePreview> {
  return callSignedIn(characterId, 'previewCorpTaxBookFeederInviteCallable', { code });
}

export async function leaveFeeder(
  characterId: number,
  corporationId: number
): Promise<{ left: true; owedIsk: number | null }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'leaveCorpTaxBookFeederCallable', {
    corporationId,
    accessToken,
  });
}

export async function createFeederInvite(
  characterId: number,
  corporationId: number,
  offeredOwnerRatePct?: number
): Promise<{ code: string; inviteId: string }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'createCorpTaxBookFeederInviteCallable', {
    corporationId,
    accessToken,
    ...(offeredOwnerRatePct === undefined ? {} : { offeredOwnerRatePct }),
  });
}

export interface OpenInvite {
  inviteId: string;
  createdBy: number;
  createdAt: number;
  offeredOwnerRatePct?: number;
}

export async function setFeederRate(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  pct: number,
  asOf?: string
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookFeederRateCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    pct,
    ...(asOf === undefined ? {} : { asOf }),
  });
}

export async function setBookFeederPayee(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  payee: Payee,
  notify: boolean
): Promise<PayeeSetResult> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookFeederPayeeFromBookCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    payee,
    notify,
  });
}

export async function setRefineryLabel(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  structureId: number,
  label: string | null
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookRefineryLabelCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    structureId,
    label,
  });
}

export async function setRefineryArchive(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  structureId: number,
  archived: boolean,
  reason: ArchiveReason = 'manual'
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookRefineryArchiveCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    structureId,
    archived,
    reason,
  });
}

export async function setFeederMode(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  mode: FeederMode,
  note?: string
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookFeederModeCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    mode,
    ...(note === undefined || note.trim() === '' ? {} : { note }),
  });
}

export async function recordFeederPayout(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  payout: { amount: number; date: string; method: 'donation' | 'contract' | 'other' }
): Promise<{ id: string }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'recordCorpTaxBookFeederPayoutCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    ...payout,
  });
}

export async function markFeederPayout(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  payoutId: string,
  notAPayout: boolean
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'markCorpTaxBookFeederPayoutCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    payoutId,
    notAPayout,
  });
}

export async function reconcileFeederPayouts(
  characterId: number,
  corporationId: number,
  outgoing: readonly OutgoingDonation[]
): Promise<{ attached: number; recorded: number }> {
  return callSignedIn(characterId, 'reconcileCorpTaxBookFeederPayoutsCallable', {
    corporationId,
    accessToken: await getValidAccessToken(characterId),
    outgoing,
  });
}

export async function revokeFeederInvite(
  characterId: number,
  corporationId: number,
  inviteId: string
): Promise<{ revoked: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'revokeCorpTaxBookFeederInviteCallable', {
    corporationId,
    accessToken,
    inviteId,
  });
}

export async function listFeederInvites(
  characterId: number,
  corporationId: number
): Promise<OpenInvite[]> {
  const { invites } = await callSignedIn<{ corporationId: number }, { invites: OpenInvite[] }>(
    characterId,
    'listCorpTaxBookFeederInvitesCallable',
    { corporationId }
  );
  return invites;
}

export interface StartedRemoval {
  startedAt: number;
  code: string;
  recipients: number[];
  ownerRecipients?: number[];
}

export async function startFeederRemoval(
  characterId: number,
  corporationId: number,
  feederCorporationId: number
): Promise<StartedRemoval> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'startCorpTaxBookFeederRemovalCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
  });
}

export async function recordFeederRemovalSent(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  sentAt?: number
): Promise<{ effectiveAt: number | null }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'recordCorpTaxBookFeederRemovalSentCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    ...(sentAt === undefined ? {} : { sentAt }),
  });
}

export async function claimFeederStaleMail(
  characterId: number,
  corporationId: number,
  feederCorporationId: number
): Promise<{ recipients: number[]; ownerRecipients: number[] }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'claimCorpTaxBookFeederStaleMailCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    marksSent: true,
  });
}

export async function markFeederStaleMailSent(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  staleSince: number
): Promise<void> {
  const accessToken = await getValidAccessToken(characterId);
  await callSignedIn(characterId, 'markCorpTaxBookFeederStaleMailSentCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
    staleSince,
  });
}

export async function cancelFeederRemoval(
  characterId: number,
  corporationId: number,
  feederCorporationId: number
): Promise<{ recipients: number[] }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'cancelCorpTaxBookFeederRemovalCallable', {
    corporationId,
    accessToken,
    feederCorporationId,
  });
}

export type RemovalLinkState =
  | { available: false; effectiveAt: number | null }
  | {
      available: true;
      collectorCorporationId: number;
      feederCorporationId: number;
      effectiveAt: number | null;
    };

export function getRemovalLink(characterId: number, code: string): Promise<RemovalLinkState> {
  return callSignedIn(characterId, 'getCorpTaxBookRemovalLinkCallable', { code });
}

export function forceRemoval(
  characterId: number,
  code: string
): Promise<{ ended: boolean; effectiveAt: number | null }> {
  return callSignedIn(characterId, 'forceCorpTaxBookRemovalCallable', { code });
}

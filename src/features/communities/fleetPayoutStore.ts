import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore/lite';
import type { FleetPayout, FleetPayoutDraft, FleetShare } from '@/engine/communities/fleetPayouts';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { callCommunity } from './communityStore';
import { underFirebaseSession } from './pledgeWrites';

function readPayout(id: string, d: Record<string, unknown>): FleetPayout | null {
  if (typeof d.totalIsk !== 'number' || typeof d.ownerUid !== 'string') return null;
  return {
    id,
    ownerUid: d.ownerUid,
    ownerName: String(d.ownerName ?? ''),
    name: String(d.name ?? ''),
    totalIsk: d.totalIsk,
    holdBackPct: Number(d.holdBackPct ?? 0),
    rule: d.rule === 'weighted' ? 'weighted' : 'equal',
    memberUids: Array.isArray(d.memberUids)
      ? d.memberUids.filter((uid): uid is string => typeof uid === 'string')
      : [],
    shareCount: Number(d.shareCount ?? 0),
    paidCount: Number(d.paidCount ?? 0),
    createdAt: Number(d.createdAt ?? 0),
    expiresAt: Number(d.expiresAt ?? 0),
  };
}

function readShare(id: string, d: Record<string, unknown>): FleetShare | null {
  if (typeof d.pilotName !== 'string' || typeof d.isk !== 'number') return null;
  return {
    id,
    pilotName: d.pilotName,
    characterId: typeof d.characterId === 'number' ? d.characterId : null,
    memberUid: typeof d.memberUid === 'string' ? d.memberUid : null,
    weight: Number(d.weight ?? 1),
    isk: d.isk,
    paid: d.paid === true,
    paidAt: Number(d.paidAt ?? 0),
  };
}

export const FLEET_PAYOUTS_CAP = 500;

const byIndex = (a: FleetShare, b: FleetShare) => Number(a.id) - Number(b.id);

export async function loadFleetPayouts(
  characterId: number,
  communityId: string
): Promise<FleetPayout[]> {
  const override = communityBackendOverride();
  const readAll = (list: FleetPayout[]) => [...list].sort((a, b) => b.createdAt - a.createdAt);
  if (override?.loadFleetPayouts) return readAll(override.loadFleetPayouts(communityId));
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      query(
        collection(getSyncFirestore(characterId), 'communities', communityId, 'fleetPayouts'),
        orderBy('createdAt', 'desc'),
        limit(FLEET_PAYOUTS_CAP)
      )
    );
  });
  return readAll(
    snap.docs
      .map((entry) => readPayout(entry.id, entry.data()))
      .filter((payout): payout is FleetPayout => payout !== null)
  );
}

export async function loadFleetShares(
  characterId: number,
  communityId: string,
  payoutId: string
): Promise<FleetShare[]> {
  const override = communityBackendOverride();
  if (override?.loadFleetShares) return override.loadFleetShares(communityId, payoutId);
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      collection(
        getSyncFirestore(characterId),
        'communities',
        communityId,
        'fleetPayouts',
        payoutId,
        'shares'
      )
    );
  });
  return snap.docs
    .map((entry) => readShare(entry.id, entry.data()))
    .filter((share): share is FleetShare => share !== null)
    .sort(byIndex);
}

export async function loadMyFleetShare(
  characterId: number,
  communityId: string,
  payoutId: string
): Promise<FleetShare | null> {
  const myUid = uidForCharacter(characterId);
  const override = communityBackendOverride();
  if (override?.loadFleetShares) {
    return (
      override.loadFleetShares(communityId, payoutId).find((share) => share.memberUid === myUid) ??
      null
    );
  }
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      query(
        collection(
          getSyncFirestore(characterId),
          'communities',
          communityId,
          'fleetPayouts',
          payoutId,
          'shares'
        ),
        where('memberUid', '==', myUid)
      )
    );
  });
  return (
    snap.docs
      .map((entry) => readShare(entry.id, entry.data()))
      .find((share): share is FleetShare => share !== null) ?? null
  );
}

export function createFleetPayout(
  characterId: number,
  communityId: string,
  draft: FleetPayoutDraft
) {
  return callCommunity<FleetPayoutDraft & { communityId: string }, { payoutId: string }>(
    characterId,
    'createCommunityFleetPayoutCallable',
    { communityId, ...draft }
  );
}

export async function setFleetShareDone(
  characterId: number,
  communityId: string,
  payoutId: string,
  shareId: string,
  paid: boolean
): Promise<void> {
  await callCommunity(characterId, 'setCommunityFleetShareDoneCallable', {
    communityId,
    payoutId,
    shareId,
    paid,
  });
}

export async function removeFleetPayout(
  characterId: number,
  communityId: string,
  payoutId: string
): Promise<void> {
  await callCommunity(characterId, 'removeCommunityFleetPayoutCallable', {
    communityId,
    payoutId,
  });
}

/** The member page's reads and writes, with a stand-in for Storybook and tests (never set by the app). */
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { isSyncConfigured } from '@/app/syncStatus';
import { db as localDb } from '@/db';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { previewSrpDoctrineCheck } from '../srpDoctrineClient';
import { fileSrpClaim, getSrpStatus } from '../srpClient';
import type {
  DoctrinePreview,
  FileSrpClaimInput,
  FiledSrpClaim,
  SrpClaimState,
  SrpStatus,
} from '../srpTypes';
import { getKillmail, type Killmail } from '@/esi/endpoints';
import { loadLostLosses } from './lostLosses';
import type { LostLoss, MemberClaim } from './srpMemberModel';

export interface SrpMemberBackend {
  status: (characterId: number, corporationId: number) => Promise<SrpStatus>;
  claims: (characterId: number, corporationId: number) => Promise<MemberClaim[]>;
  file: (
    characterId: number,
    corporationId: number,
    input: FileSrpClaimInput
  ) => Promise<FiledSrpClaim>;
  lostLosses: (characterId: number, corporationId: number) => Promise<LostLoss[]>;
  /** The public ESI killmail a modal shows the facts and fit of. */
  killmail: (killmailId: number, killmailHash: string) => Promise<Killmail | null>;
  /** The doctrine check a filing of this killmail would store; nothing is written. */
  previewDoctrine: (
    characterId: number,
    corporationId: number,
    killmail: string
  ) => Promise<DoctrinePreview>;
}

let override: SrpMemberBackend | null = null;

/** Storybook and tests only. */
export function setSrpMemberBackendOverride(next: SrpMemberBackend | null): void {
  override = next;
}

const STATES: readonly SrpClaimState[] = ['pending', 'approved', 'paid', 'rejected'];
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A claim document as the page shows it; null for one that is not a claim this client knows. */
export function toMemberClaim(data: Record<string, unknown>): MemberClaim | null {
  const state = STATES.find((s) => s === data.state);
  if (
    !state ||
    !num(data.killmailId) ||
    typeof data.killmailHash !== 'string' ||
    !num(data.hullTypeId) ||
    !num(data.solarSystemId) ||
    !num(data.killedAt) ||
    !num(data.filedAt)
  ) {
    return null;
  }
  return {
    killmailId: data.killmailId,
    killmailHash: data.killmailHash,
    hullTypeId: data.hullTypeId,
    classId: num(data.classId) ? data.classId : 0,
    solarSystemId: data.solarSystemId,
    killedAt: data.killedAt,
    filedAt: data.filedAt,
    state,
    amount: num(data.amount) ? data.amount : null,
    basis: (data.basis as MemberClaim['basis']) ?? null,
    rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : null,
    refileCount: num(data.refileCount) ? data.refileCount : 0,
    fleetOrFc: typeof data.fleetOrFc === 'string' ? data.fleetOrFc : null,
    note: typeof data.note === 'string' ? data.note : null,
  };
}

async function readMyClaims(characterId: number, corporationId: number): Promise<MemberClaim[]> {
  const uid = await ensureSignedIn(characterId);
  const ownerHash = (await localDb.characters.get(characterId))?.ownerHash;
  if (ownerHash === undefined || uid !== uidForCharacter(characterId)) return [];
  // Both fields are what the rule checks, so a query without either is refused outright.
  const snap = await getDocs(
    query(
      collection(getSyncFirestore(characterId), 'corps', String(corporationId), 'srpClaims'),
      where('uid', '==', uid),
      where('ownerHash', '==', ownerHash)
    )
  );
  return snap.docs.flatMap((d) => {
    const claim = toMemberClaim(d.data());
    return claim ? [claim] : [];
  });
}

const real: SrpMemberBackend = {
  // SRP lives in the cloud backend; with none configured there is no SRP to find, not a failed load.
  status: async (characterId, corporationId) =>
    isSyncConfigured()
      ? getSrpStatus(characterId, corporationId)
      : { corporationId, enabled: false },
  claims: readMyClaims,
  file: fileSrpClaim,
  lostLosses: loadLostLosses,
  killmail: async (killmailId, killmailHash) => (await getKillmail(killmailId, killmailHash)).data,
  previewDoctrine: previewSrpDoctrineCheck,
};

export const srpMemberBackend = (): SrpMemberBackend => override ?? real;

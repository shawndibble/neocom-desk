import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore/lite';
import { db as localDb, type SkillPlanRecord } from '@/db';
import {
  decodePlanEntries,
  encodePlanEntries,
  parseSharedPlanId,
  planSyncActions,
  sharedPlanId,
  type SharedPlan,
} from '@/engine/communities/sharedPlans';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { listCommunityIds } from './communityStore';
import { markPlansShared } from './shareSelection';

const MAX_NAME_LENGTH = 200;
export const COMMUNITY_PLANS_CAP = 1000;

type PlanToShare = Pick<SkillPlanRecord, 'id' | 'name' | 'entries' | 'updatedAt'>;

function plansOf(characterId: number, communityId: string) {
  return collection(getSyncFirestore(characterId), 'communities', communityId, 'skillPlans');
}

async function toDoc(characterId: number, plan: PlanToShare) {
  const entries = encodePlanEntries(plan.entries);
  const ownerHash = (await localDb.characters.get(characterId))?.ownerHash;
  if (entries === null || !ownerHash) return null;
  return {
    ownerHash,
    ownerUid: uidForCharacter(characterId),
    name: plan.name.trim().slice(0, MAX_NAME_LENGTH) || '-',
    entries,
    sourceUpdatedAt: plan.updatedAt,
    updatedAt: serverTimestamp(),
  };
}

export async function sharePlan(
  characterId: number,
  communityId: string,
  plan: PlanToShare
): Promise<boolean> {
  const data = await toDoc(characterId, plan);
  if (data === null) return false;
  await ensureSignedIn(characterId);
  await setDoc(
    doc(plansOf(characterId, communityId), sharedPlanId(uidForCharacter(characterId), plan.id)),
    data
  );
  await markPlansShared(characterId);
  return true;
}

export async function unsharePlan(
  characterId: number,
  communityId: string,
  planId: string
): Promise<void> {
  await ensureSignedIn(characterId);
  await deleteDoc(
    doc(plansOf(characterId, communityId), sharedPlanId(uidForCharacter(characterId), planId))
  );
}

export async function loadMySharedPlans(
  characterId: number,
  communityId: string
): Promise<Map<string, number>> {
  const standIn = communityBackendOverride()?.loadPlans;
  if (standIn) {
    const me = uidForCharacter(characterId);
    return new Map(
      standIn(communityId)
        .filter((plan) => plan.ownerUid === me)
        .map((plan) => [plan.planId, plan.sourceUpdatedAt])
    );
  }
  const uid = await ensureSignedIn(characterId);
  const mine = await getDocs(
    query(plansOf(characterId, communityId), where('ownerUid', '==', uid))
  );
  const shared = new Map<string, number>();
  for (const entry of mine.docs) {
    const parsed = parseSharedPlanId(entry.id);
    if (parsed) shared.set(parsed.planId, Number(entry.data().sourceUpdatedAt ?? 0));
  }
  return shared;
}

export async function loadCommunityPlans(
  characterId: number,
  communityId: string
): Promise<SharedPlan[]> {
  const standIn = communityBackendOverride()?.loadPlans;
  if (standIn) return standIn(communityId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(query(plansOf(characterId, communityId), limit(COMMUNITY_PLANS_CAP)));
  const plans: SharedPlan[] = [];
  for (const entry of snap.docs) {
    const parsed = parseSharedPlanId(entry.id);
    const data = entry.data();
    const entries = decodePlanEntries(data.entries);
    const updated = data.updatedAt;
    if (!parsed || entries === null || typeof updated?.toMillis !== 'function') continue;
    plans.push({
      communityId,
      id: entry.id,
      ownerUid: parsed.ownerUid,
      planId: parsed.planId,
      name: String(data.name ?? ''),
      entries,
      updatedAt: updated.toMillis(),
      sourceUpdatedAt: Number(data.sourceUpdatedAt ?? 0),
    });
  }
  return plans;
}

export async function syncSharedPlans(characterId: number, communityId: string): Promise<void> {
  if (communityBackendOverride()) return;
  try {
    const shared = await loadMySharedPlans(characterId, communityId);
    if (shared.size === 0) return;
    const local = await localDb.skillPlans.where('characterId').equals(characterId).toArray();
    const { push, remove } = planSyncActions(local, shared);
    const byId = new Map(local.map((plan) => [plan.id, plan]));
    for (const planId of push) {
      try {
        if (!(await sharePlan(characterId, communityId, byId.get(planId)!))) {
          await unsharePlan(characterId, communityId, planId);
        }
      } catch {}
    }
    for (const planId of remove) {
      await unsharePlan(characterId, communityId, planId).catch(() => undefined);
    }
  } catch {}
}

export async function syncAllSharedPlans(characterId: number): Promise<void> {
  const ids = await listCommunityIds(characterId).catch(() => []);
  for (const communityId of ids) await syncSharedPlans(characterId, communityId);
}

export async function unshareAllPlansEverywhere(characterId: number): Promise<void> {
  const ids = await listCommunityIds(characterId).catch(() => []);
  await Promise.allSettled(
    ids.map(async (communityId) => {
      const shared = await loadMySharedPlans(characterId, communityId);
      await Promise.all([...shared.keys()].map((id) => unsharePlan(characterId, communityId, id)));
    })
  );
}

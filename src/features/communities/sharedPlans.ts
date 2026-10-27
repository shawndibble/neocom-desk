/**
 * Shared Skill Plans client: a Member copies one Skill Plan's name and ordered
 * skill targets into a Community, one plan at a time (there is no "share all"),
 * and every Member reads them from that Community's `skillPlans` collection.
 * Rules gate reads by membership and writes by the owning Character
 * (`firestore.rules`); leaving or removal deletes them server-side.
 *
 * Plans have no single save path to hook (the list, the editor, the target
 * picker and sync all write them), so a shared copy is kept current by a sweep
 * (`syncSharedPlans`: at boot, every half hour and when the Skill plans tab
 * opens) that compares each plan's own `updatedAt` with the one its copy was
 * made from. Nothing is ever shared by the sweep; it only refreshes or removes
 * copies the Member already made.
 *
 * Firestore here is the `lite` build (no listeners), so callers refetch.
 */
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
/** Most shared plans one Community read takes. */
export const COMMUNITY_PLANS_CAP = 1000;

type PlanToShare = Pick<SkillPlanRecord, 'id' | 'name' | 'entries' | 'updatedAt'>;

function plansOf(characterId: number, communityId: string) {
  return collection(getSyncFirestore(characterId), 'communities', communityId, 'skillPlans');
}

/** The data a Community stores for a plan; null when it cannot be shared (too many skills, or no owner on this device). */
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

/** Shares (or refreshes) one plan in one Community. False when it can't be shared. */
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

/** The plans this Character has in a Community: plan id to the `updatedAt` its copy was made from. */
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

/** Every plan shared into one Community, by anyone; a doc that does not decode is skipped. */
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

/**
 * Keeps one Community's copies of this Character's plans current: refreshes a
 * shared plan edited since its copy was made, removes the copy of a plan that
 * is gone. Never throws; a failure leaves the copies as they were until the
 * next sweep.
 */
export async function syncSharedPlans(characterId: number, communityId: string): Promise<void> {
  // A stand-in backend (Storybook) has nothing to write to.
  if (communityBackendOverride()) return;
  try {
    const shared = await loadMySharedPlans(characterId, communityId);
    if (shared.size === 0) return;
    const local = await localDb.skillPlans.where('characterId').equals(characterId).toArray();
    const { push, remove } = planSyncActions(local, shared);
    const byId = new Map(local.map((plan) => [plan.id, plan]));
    // One failing action must not stop the rest of the sweep.
    for (const planId of push) {
      try {
        // A plan that can no longer be shared (edited past the cap) must not
        // keep an old copy up: the Community would read it as current.
        if (!(await sharePlan(characterId, communityId, byId.get(planId)!))) {
          await unsharePlan(characterId, communityId, planId);
        }
      } catch {
        // Retried by the next sweep.
      }
    }
    for (const planId of remove) {
      await unsharePlan(characterId, communityId, planId).catch(() => undefined);
    }
  } catch {
    // Best effort.
  }
}

/** The sweep: every Community the Character is in. */
export async function syncAllSharedPlans(characterId: number): Promise<void> {
  const ids = await listCommunityIds(characterId).catch(() => []);
  for (const communityId of ids) await syncSharedPlans(characterId, communityId);
}

/** The logout prompt's "remove what I shared": every Community, best effort per Community. */
export async function unshareAllPlansEverywhere(characterId: number): Promise<void> {
  const ids = await listCommunityIds(characterId).catch(() => []);
  await Promise.allSettled(
    ids.map(async (communityId) => {
      const shared = await loadMySharedPlans(characterId, communityId);
      await Promise.all([...shared.keys()].map((id) => unsharePlan(characterId, communityId, id)));
    })
  );
}

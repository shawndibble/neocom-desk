import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore/lite';
import { db } from '@/db';
import { sharesBlueprint, type BlueprintShare } from '@/engine/communities/shareMode';
import {
  chunkLibrary,
  libraryHash,
  LIBRARY_MAX_CHUNKS,
  planPush,
  splitSharedBlueprints,
  type PushPlan,
  type ResolvedPlace,
} from '@/engine/communities/sharedLibrary';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { loadPlacedBlueprints } from './blueprintPlacement';
import { invalidateCommunityRoster, listCommunityIds } from './communityStore';
import { loadBlueprintShare } from './shareSelection';

export interface PublishResult {
  outcome: PushPlan | 'unavailable';
  skipped: number;
}

const unavailable: PublishResult = { outcome: 'unavailable', skipped: 0 };

const inFlight = new Map<
  string,
  { run: Promise<PublishResult>; next: Promise<PublishResult> | null }
>();

function memberRef(characterId: number, communityId: string, uid: string) {
  return doc(getSyncFirestore(characterId), 'communities', communityId, 'members', uid);
}

async function buildLibrary(characterId: number, share: BlueprintShare) {
  const placed = await loadPlacedBlueprints(characterId);
  if (!placed) return null;
  const { placeIdOf } = placed;
  const owned = placed.blueprints.filter((blueprint) =>
    sharesBlueprint(share, blueprint.type_id, placeIdOf(blueprint))
  );

  const places = new Map<number, ResolvedPlace>();
  await Promise.all(
    [...new Set(owned.map(placeIdOf).filter((id): id is number => id !== null))].map(
      async (locationId) => {
        const location = await loadBlueprintLocation(characterId, locationId);
        const system =
          location.systemId == null ? null : await lookupSolarSystem(location.systemId);
        if (location.name && system) {
          places.set(locationId, { locationName: location.name, systemName: system.name });
        }
      }
    )
  );

  return splitSharedBlueprints(
    owned,
    share,
    placeIdOf,
    (locationId) => places.get(locationId) ?? null
  );
}

async function publish(characterId: number, communityId: string): Promise<PublishResult> {
  const [share, character] = await Promise.all([
    loadBlueprintShare(characterId, communityId),
    db.characters.get(characterId),
  ]);
  if (!character?.ownerHash) return unavailable;
  const uid = await ensureSignedIn(characterId);
  const member = await getDoc(memberRef(characterId, communityId, uid));
  if (!member.exists()) return unavailable;
  const data = member.data();
  const pushedAt = (data.pushedAt as Timestamp | undefined)?.toMillis?.();
  const last =
    typeof data.libraryHash === 'string' && pushedAt !== undefined
      ? { hash: data.libraryHash, pushedAt }
      : null;
  const oldChunkCount = Number(data.chunkCount ?? 0);

  const built = await buildLibrary(characterId, share);
  if (!built) return unavailable;
  const { shared: items, skipped } = built;
  const hash = libraryHash(items);
  const plan = planPush(last, hash, items.length, Date.now());
  if (plan === 'skip') return { outcome: plan, skipped };

  const chunks = chunkLibrary(items);
  if (chunks.length > LIBRARY_MAX_CHUNKS) return { outcome: 'unavailable', skipped };
  if (plan === 'full') {
    await ensureSignedIn(characterId);
    await updateDoc(memberRef(characterId, communityId, uid), {
      pushedAt: serverTimestamp(),
      libraryHash: '',
      chunkCount: oldChunkCount,
    });
    await Promise.all(
      chunks.map((chunk, index) =>
        setDoc(doc(memberRef(characterId, communityId, uid), 'library', String(index)), {
          ownerHash: character.ownerHash,
          items: chunk,
        })
      )
    );
    await Promise.all(
      Array.from({ length: Math.max(0, oldChunkCount - chunks.length) }, (_, i) =>
        deleteDoc(
          doc(memberRef(characterId, communityId, uid), 'library', String(chunks.length + i))
        )
      )
    );
  }
  await ensureSignedIn(characterId);
  await updateDoc(memberRef(characterId, communityId, uid), {
    pushedAt: serverTimestamp(),
    libraryHash: hash,
    chunkCount: chunks.length,
  });
  invalidateCommunityRoster(characterId, communityId);
  return { outcome: plan, skipped };
}

export function publishSharedLibrary(
  characterId: number,
  communityId: string
): Promise<PublishResult> {
  const key = `${characterId}:${communityId}`;
  const start = (): Promise<PublishResult> => {
    const run: Promise<PublishResult> = publish(characterId, communityId)
      .catch((): PublishResult => unavailable)
      .finally(() => {
        if (inFlight.get(key)?.run === run) inFlight.delete(key);
      });
    inFlight.set(key, { run, next: null });
    return run;
  };
  const running = inFlight.get(key);
  if (!running) return start();
  running.next ??= running.run.then(start);
  return running.next;
}

export async function publishAllSharedLibraries(characterId: number): Promise<void> {
  const ids = await listCommunityIds(characterId).catch(() => []);
  for (const communityId of ids) await publishSharedLibrary(characterId, communityId);
}

export async function removeSharedLibraries(characterId: number): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  for (const communityId of await listCommunityIds(characterId)) {
    const member = memberRef(characterId, communityId, uid);
    const chunks = await getDocs(collection(member, 'library'));
    await updateDoc(member, {
      pushedAt: serverTimestamp(),
      libraryHash: '',
      chunkCount: chunks.size,
    });
    await Promise.all(chunks.docs.map((chunk) => deleteDoc(chunk.ref)));
    await updateDoc(member, { pushedAt: serverTimestamp(), libraryHash: '', chunkCount: 0 });
    invalidateCommunityRoster(characterId, communityId);
  }
}

/**
 * Publishes a Character's Shared Blueprints to a Community (issue #3600, ADR
 * 0018). The Member doc holds the hash and time of the last push, so the
 * device rewrites the library only when its list's hash differs from that
 * (`planPush`), and renews just the as-of stamp when the list is unchanged
 * but the stamp is getting old. Writes go straight to Firestore under the
 * membership rules; nothing but a Member's own library and stamp is writable.
 */
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
import {
  chunkLibrary,
  libraryHash,
  LIBRARY_MAX_CHUNKS,
  planPush,
  selectSharedBlueprints,
  type PushPlan,
  type ResolvedPlace,
} from '@/engine/communities/sharedLibrary';
import { loadCharacterAssets } from '@/features/character/assets';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { resolveBlueprintPlacement } from '@/features/industry/ownedBlueprints';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { loadShareSelection } from './shareSelection';

const inFlight = new Map<string, Promise<PushPlan | 'unavailable'>>();

function memberRef(communityId: string, uid: string) {
  return doc(getSyncFirestore(), 'communities', communityId, 'members', uid);
}

/** The Communities a Character belongs to, from its own membership index. */
export async function listCommunityIds(characterId: number): Promise<string[]> {
  const uid = await ensureSignedIn(characterId);
  const index = await getDocs(collection(getSyncFirestore(), 'characters', uid, 'communities'));
  return index.docs.map((entry) => entry.id);
}

/**
 * The selected blueprints with their station or structure and system. Null
 * when the inputs aren't all on hand (no cached blueprints or assets, scope
 * lost): the caller publishes nothing rather than shrinking the library.
 */
async function buildLibrary(characterId: number, selected: ReadonlySet<number>) {
  const [blueprints, assets] = await Promise.all([
    loadCharacterBlueprints(characterId),
    loadCharacterAssets(characterId),
  ]);
  if (!blueprints.cached || !assets.cached) return null;

  const assetsByItemId = new Map(assets.cached.data.map((asset) => [asset.item_id, asset]));
  const owned = blueprints.cached.data.filter((blueprint) => selected.has(blueprint.type_id));
  const placeIds = new Map<number, number>();
  for (const blueprint of owned) {
    const placement = resolveBlueprintPlacement(blueprint, assetsByItemId);
    if (placement.kind === 'place') placeIds.set(blueprint.item_id, placement.locationId);
  }

  const places = new Map<number, ResolvedPlace>();
  let lookupFailed = false;
  await Promise.all(
    [...new Set(placeIds.values())].map(async (locationId) => {
      const location = await loadBlueprintLocation(characterId, locationId);
      const system = location.systemId == null ? null : await lookupSolarSystem(location.systemId);
      if (location.name && system) {
        places.set(locationId, { locationName: location.name, systemName: system.name });
      } else {
        lookupFailed = true;
      }
    })
  );
  // A failed lookup would drop blueprints and shrink the Community's copy;
  // publish nothing and retry next sweep instead.
  if (lookupFailed) return null;

  return selectSharedBlueprints(owned, selected, (blueprint) => {
    const locationId = placeIds.get(blueprint.item_id);
    return locationId === undefined ? null : (places.get(locationId) ?? null);
  });
}

async function publish(
  characterId: number,
  communityId: string
): Promise<PushPlan | 'unavailable'> {
  const [selected, character] = await Promise.all([
    loadShareSelection(characterId, communityId),
    db.characters.get(characterId),
  ]);
  if (!character?.ownerHash) return 'unavailable';
  const uid = await ensureSignedIn(characterId);
  const member = await getDoc(memberRef(communityId, uid));
  if (!member.exists()) return 'unavailable';
  const data = member.data();
  const pushedAt = (data.pushedAt as Timestamp | undefined)?.toMillis?.();
  const last =
    typeof data.libraryHash === 'string' && pushedAt !== undefined
      ? { hash: data.libraryHash, pushedAt }
      : null;
  const oldChunkCount = Number(data.chunkCount ?? 0);

  const items = await buildLibrary(characterId, selected);
  if (!items) return 'unavailable';
  const hash = libraryHash(items);
  const plan = planPush(last, hash, items.length, Date.now());
  if (plan === 'skip') return plan;

  const chunks = chunkLibrary(items);
  if (chunks.length > LIBRARY_MAX_CHUNKS) return 'unavailable';
  if (plan === 'full') {
    // Invalidate the stored hash first: a push cut off before the final stamp
    // must not leave a hash that matches chunks it no longer describes.
    await ensureSignedIn(characterId);
    await updateDoc(memberRef(communityId, uid), {
      pushedAt: serverTimestamp(),
      libraryHash: '',
      chunkCount: oldChunkCount,
    });
    await Promise.all(
      chunks.map((chunk, index) =>
        setDoc(doc(memberRef(communityId, uid), 'library', String(index)), {
          ownerHash: character.ownerHash,
          items: chunk,
        })
      )
    );
    await Promise.all(
      Array.from({ length: Math.max(0, oldChunkCount - chunks.length) }, (_, i) =>
        deleteDoc(doc(memberRef(communityId, uid), 'library', String(chunks.length + i)))
      )
    );
  }
  // The slow build above can outlast another Character's sign-in.
  await ensureSignedIn(characterId);
  await updateDoc(memberRef(communityId, uid), {
    pushedAt: serverTimestamp(),
    libraryHash: hash,
    chunkCount: chunks.length,
  });
  return plan;
}

/**
 * Pushes one Character's selection to one Community if its hash changed.
 * Concurrent calls for the same pair share one run. Never throws: a failed
 * push just leaves the last one in place, and the next sweep retries.
 */
export function publishSharedLibrary(
  characterId: number,
  communityId: string
): Promise<PushPlan | 'unavailable'> {
  const key = `${characterId}:${communityId}`;
  const running = inFlight.get(key);
  if (running) return running;
  const run = publish(characterId, communityId)
    .catch((): 'unavailable' => 'unavailable')
    .finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** Every Community the Character is in: used at boot and on a timer. */
export async function publishAllSharedLibraries(characterId: number): Promise<void> {
  const ids = await listCommunityIds(characterId).catch(() => []);
  for (const communityId of ids) await publishSharedLibrary(characterId, communityId);
}

/**
 * Deletes everything this Character shared, in every Community it is in, and
 * zeroes the stamp. The Member stays a Member. Run before a Character leaves
 * the device, while its sign-in is still available.
 */
export async function removeSharedLibraries(characterId: number): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  for (const communityId of await listCommunityIds(characterId)) {
    const member = memberRef(communityId, uid);
    const chunks = await getDocs(collection(member, 'library'));
    // Hash first, so a removal cut off mid-way can't leave a hash that matches an emptied library.
    await updateDoc(member, {
      pushedAt: serverTimestamp(),
      libraryHash: '',
      chunkCount: chunks.size,
    });
    await Promise.all(chunks.docs.map((chunk) => deleteDoc(chunk.ref)));
    await updateDoc(member, { pushedAt: serverTimestamp(), libraryHash: '', chunkCount: 0 });
  }
}

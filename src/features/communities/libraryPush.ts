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

/**
 * What one publish did. `skipped` counts the selected blueprints left out
 * because their station or structure could not be worked out (inside a
 * container that cannot be traced, or in a structure this Character cannot
 * read), so the Member can be told instead of wondering where they went.
 */
export interface PublishResult {
  outcome: PushPlan | 'unavailable';
  skipped: number;
}

const unavailable: PublishResult = { outcome: 'unavailable', skipped: 0 };

/** The run in flight for a pair, and the one run queued behind it when a call arrived mid-flight. */
const inFlight = new Map<
  string,
  { run: Promise<PublishResult>; next: Promise<PublishResult> | null }
>();

function memberRef(communityId: string, uid: string) {
  return doc(getSyncFirestore(), 'communities', communityId, 'members', uid);
}

/**
 * The shared blueprints with their station or structure and system. Null
 * when the inputs aren't all on hand (no cached blueprints or assets, scope
 * lost): the caller publishes nothing rather than shrinking the library.
 */
async function buildLibrary(characterId: number, share: BlueprintShare) {
  // Every copy's place first (local, no requests): a location rule shares a
  // copy whose type was never picked, so filtering by type first would miss it.
  const placed = await loadPlacedBlueprints(characterId);
  if (!placed) return null;
  const { placeIdOf } = placed;
  const owned = placed.blueprints.filter((blueprint) =>
    sharesBlueprint(share, blueprint.type_id, placeIdOf(blueprint))
  );

  // Only the places of shared copies are named: one request each at most.
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

  // One blueprint in a structure nobody can read must not hold back the rest:
  // it is left out and counted, and the next sweep picks it up if the place
  // resolves by then (the hash changes, so the library is pushed again).
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
  const member = await getDoc(memberRef(communityId, uid));
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
  // The roster read before this push carries the old stamp: this device shows the new library.
  invalidateCommunityRoster(characterId, communityId);
  return { outcome: plan, skipped };
}

/**
 * Pushes one Character's selection to one Community if its hash changed.
 * A call that arrives while a run is in flight waits for it and then runs
 * once more, however many such calls there are: the run in flight may have
 * read the choice before the change that prompted the call. The second run
 * is cheap when nothing changed (the hash matches). Never throws: a failed
 * push just leaves the last one in place, and the next sweep retries.
 */
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
    invalidateCommunityRoster(characterId, communityId);
  }
}

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore/lite';
import { db as localDb } from '@/db';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import {
  fittingChoiceKey,
  followsSave,
  parseSharedFittingId,
  sharedFittingId,
  type SharedFitting,
  type SharedFittingKey,
} from '@/engine/communities/sharedFittings';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { loadTypes } from '@/sde/loadSde';
import { loadFittingsAll, markFittingsShared } from './shareSelection';
import { communityBackendOverride } from './backendOverride';
import { createReadCache } from './readCache';
import {
  loadCommunityMembersCached,
  loadMyCommunities,
  withMyCommunities,
  type CommunitySummary,
} from './communityStore';
import { MINUTE_MS } from '@/lib/age';

const MAX_CODE_LENGTH = 90_000;
const MAX_NAME_LENGTH = 200;
const BATCH_SIZE = 400;

export interface SharedFittingInput extends SharedFittingKey {
  name: string;
  code: string;
}

function fittingsOf(db: Firestore, communityId: string) {
  return collection(db, 'communities', communityId, 'fittings');
}

export async function hullNameForCode(code: string): Promise<string | null> {
  const decoded = await decodeFittingShare(code);
  if (!decoded.ok) return null;
  const types = await loadTypes();
  return types[String(decoded.value.hullTypeId)]?.name ?? `#${decoded.value.hullTypeId}`;
}

async function ownerHashOf(characterId: number): Promise<string | null> {
  return (await localDb.characters.get(characterId))?.ownerHash ?? null;
}

async function toDoc(characterId: number, input: SharedFittingInput) {
  const [ownerHash, hull] = await Promise.all([
    ownerHashOf(characterId),
    hullNameForCode(input.code),
  ]);
  if (ownerHash === null || hull === null) return null;
  if (input.code.length === 0 || input.code.length > MAX_CODE_LENGTH) return null;
  return {
    ownerHash,
    ownerUid: uidForCharacter(characterId),
    source: input.source,
    name: input.name.slice(0, MAX_NAME_LENGTH) || hull,
    hull,
    code: input.code,
    updatedAt: serverTimestamp(),
  };
}

export const SHARED_FITTINGS_TTL_MS = 10 * MINUTE_MS;

const fittingsCache = createReadCache<SharedFitting[]>();
const fittingsKey = (characterId: number, communityId: string) => `${characterId}:${communityId}:`;

async function changingFittings<T>(
  characterId: number,
  communityId: string,
  write: () => Promise<T>
): Promise<T> {
  try {
    return await write();
  } finally {
    fittingsCache.drop(fittingsKey(characterId, communityId));
  }
}

export async function loadCommunityFittings(
  characterId: number,
  communityId: string
): Promise<SharedFitting[]> {
  const standIn = communityBackendOverride()?.loadFittings;
  if (standIn) return standIn(communityId);
  return fittingsCache.set(
    fittingsKey(characterId, communityId),
    Date.now(),
    readCommunityFittings(characterId, communityId)
  );
}

export async function loadCommunityFittingsCached(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<SharedFitting[]> {
  const standIn = communityBackendOverride()?.loadFittings;
  if (standIn) return standIn(communityId);
  const key = fittingsKey(characterId, communityId);
  return (
    fittingsCache.get(key, (at) => now - at < SHARED_FITTINGS_TTL_MS) ??
    fittingsCache.set(key, now, readCommunityFittings(characterId, communityId))
  );
}

async function readCommunityFittings(
  characterId: number,
  communityId: string
): Promise<SharedFitting[]> {
  await ensureSignedIn(characterId);
  const snap = await getDocs(fittingsOf(getSyncFirestore(characterId), communityId));
  const loaded: SharedFitting[] = [];
  for (const entry of snap.docs) {
    const parsed = parseSharedFittingId(entry.id);
    const data = entry.data();
    const updated = data.updatedAt;
    if (!parsed || typeof data.code !== 'string' || typeof updated?.toMillis !== 'function')
      continue;
    loaded.push({
      communityId,
      id: entry.id,
      ownerUid: parsed.ownerUid,
      source: parsed.source,
      name: String(data.name ?? ''),
      hull: String(data.hull ?? ''),
      code: data.code,
      updatedAt: updated.toMillis(),
    });
  }
  return loaded;
}

export async function loadMySharedFittingKeys(
  characterId: number,
  communityId: string
): Promise<Set<string>> {
  const standIn = communityBackendOverride()?.loadFittings;
  if (standIn) {
    const me = uidForCharacter(characterId);
    return new Set(
      standIn(communityId)
        .filter((fitting) => fitting.ownerUid === me)
        .flatMap((fitting) => {
          const parsed = parseSharedFittingId(fitting.id);
          return parsed ? [fittingChoiceKey(parsed)] : [];
        })
    );
  }
  const uid = await ensureSignedIn(characterId);
  const mine = await getDocs(
    query(fittingsOf(getSyncFirestore(characterId), communityId), where('ownerUid', '==', uid))
  );
  const keys = new Set<string>();
  for (const entry of mine.docs) {
    const parsed = parseSharedFittingId(entry.id);
    if (parsed) keys.add(fittingChoiceKey(parsed));
  }
  return keys;
}

export async function loadSharedFittings(characterId: number): Promise<{
  communities: CommunitySummary[];
  fittings: SharedFitting[];
  sharerNames: Map<string, string>;
}> {
  return withMyCommunities(characterId, async (communities) => {
    const [perCommunity, perMembers] = await Promise.all([
      Promise.all(
        communities.map((community) => loadCommunityFittingsCached(characterId, community.id))
      ),
      Promise.all(
        communities.map((community) => loadCommunityMembersCached(characterId, community.id))
      ),
    ]);
    const sharerNames = new Map<string, string>();
    for (const member of perMembers.flat()) sharerNames.set(member.uid, member.characterName);
    return { communities, fittings: perCommunity.flat(), sharerNames };
  });
}

export async function loadShareStatus(
  characterId: number,
  key: SharedFittingKey
): Promise<{ communities: CommunitySummary[]; sharedIn: Set<string> }> {
  const docId = sharedFittingId(uidForCharacter(characterId), key);
  return withMyCommunities(characterId, async (communities) => {
    const held = await Promise.all(
      communities.map(async (community) =>
        (await loadCommunityFittingsCached(characterId, community.id)).some(
          (fitting) => fitting.id === docId
        )
          ? community.id
          : null
      )
    );
    return {
      communities,
      sharedIn: new Set(held.filter((id): id is string => id !== null)),
    };
  });
}

export type ShareOutcome = 'shared' | 'unshared' | 'cannot' | 'failed';

export async function toggleShare(
  characterId: number,
  communityId: string,
  key: SharedFittingKey,
  fitting: { name: string; code: string | null },
  alreadyShared: boolean
): Promise<ShareOutcome> {
  try {
    if (alreadyShared) {
      await unshareFitting(characterId, communityId, key);
      return 'unshared';
    }
    if (fitting.code === null) return 'cannot';
    const ok = await shareFitting(characterId, communityId, {
      ...key,
      name: fitting.name,
      code: fitting.code,
    });
    if (ok) await markFittingsShared(characterId);
    return ok ? 'shared' : 'cannot';
  } catch {
    return 'failed';
  }
}

export async function shareFitting(
  characterId: number,
  communityId: string,
  input: SharedFittingInput
): Promise<boolean> {
  const data = await toDoc(characterId, input);
  if (data === null) return false;
  await ensureSignedIn(characterId);
  await changingFittings(characterId, communityId, () =>
    setDoc(
      doc(
        getSyncFirestore(characterId),
        'communities',
        communityId,
        'fittings',
        sharedFittingId(uidForCharacter(characterId), input)
      ),
      data
    )
  );
  return true;
}

export async function unshareFitting(
  characterId: number,
  communityId: string,
  key: SharedFittingKey
): Promise<void> {
  await ensureSignedIn(characterId);
  await changingFittings(characterId, communityId, () =>
    deleteDoc(
      doc(
        getSyncFirestore(characterId),
        'communities',
        communityId,
        'fittings',
        sharedFittingId(uidForCharacter(characterId), key)
      )
    )
  );
}

export async function shareFittings(
  characterId: number,
  communityId: string,
  inputs: readonly SharedFittingInput[]
): Promise<number> {
  const docs = (
    await Promise.all(
      inputs.map(async (input) => {
        const data = await toDoc(characterId, input);
        return data === null
          ? null
          : { id: sharedFittingId(uidForCharacter(characterId), input), data };
      })
    )
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  await changingFittings(characterId, communityId, async () => {
    for (let start = 0; start < docs.length; start += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const { id, data } of docs.slice(start, start + BATCH_SIZE)) {
        batch.set(doc(fittingsOf(db, communityId), id), data);
      }
      await batch.commit();
    }
  });
  if (docs.length > 0) await markFittingsShared(characterId);
  return docs.length;
}

export async function unshareAllFittings(characterId: number, communityId: string): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const mine = await getDocs(query(fittingsOf(db, communityId), where('ownerUid', '==', uid)));
  await changingFittings(characterId, communityId, async () => {
    for (let start = 0; start < mine.docs.length; start += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const entry of mine.docs.slice(start, start + BATCH_SIZE)) batch.delete(entry.ref);
      await batch.commit();
    }
  });
}

export async function unshareAllFittingsEverywhere(characterId: number): Promise<void> {
  const communities = await loadMyCommunities(characterId);
  await Promise.allSettled(
    communities.map((community) => unshareAllFittings(characterId, community.id))
  );
}

export async function followSavedFitting(
  characterId: number,
  record: { id: string; name: string; code: string }
): Promise<void> {
  try {
    const docId = sharedFittingId(uidForCharacter(characterId), {
      source: 'saved',
      key: record.id,
    });
    await ensureSignedIn(characterId);
    const db = getSyncFirestore(characterId);
    await withMyCommunities(characterId, (communities) =>
      Promise.all(
        communities.map(async (community) => {
          const key = { source: 'saved', key: record.id } as const;
          const [existing, allExcluded] = await Promise.all([
            getDoc(doc(fittingsOf(db, community.id), docId)),
            loadFittingsAll(characterId, community.id),
          ]);
          if (
            followsSave(existing.exists(), allExcluded, key) &&
            (await localDb.fittings.get(record.id))
          ) {
            await shareFitting(characterId, community.id, {
              ...key,
              name: record.name,
              code: record.code,
            });
          }
        })
      )
    );
  } catch {}
}

export async function unshareDeletedFitting(characterId: number, fittingId: string): Promise<void> {
  try {
    const communities = await loadMyCommunities(characterId);
    await Promise.allSettled(
      communities.map((community) =>
        unshareFitting(characterId, community.id, { source: 'saved', key: fittingId })
      )
    );
  } catch {}
}

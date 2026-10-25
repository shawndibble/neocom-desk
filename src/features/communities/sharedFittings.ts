/**
 * Shared Fittings client (issue #3605, ADR 0018): a Member copies a Fitting's
 * Fitting Share Code into a Community, and every Member reads them from that
 * Community's `fittings` collection. Rules gate reads by membership and writes
 * by the owning Character (`firestore.rules`); leaving or removal deletes them
 * server-side. Everything here is best-effort and never throws into the
 * caller's own save or delete — a share that fails to follow a re-save is the
 * one thing worse than a stale copy, and the stale copy is only until the next
 * save.
 *
 * Firestore here is the `lite` build (no listeners), so callers refetch.
 */
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

/** firestore.rules caps; a Fitting past them is left unshared rather than failing the batch. */
const MAX_CODE_LENGTH = 90_000;
const MAX_NAME_LENGTH = 200;
const BATCH_SIZE = 400;

/** What a Member pushes for one Fitting: its row in the library, and the code that opens it. */
export interface SharedFittingInput extends SharedFittingKey {
  name: string;
  code: string;
}

function fittingsOf(db: Firestore, communityId: string) {
  return collection(db, 'communities', communityId, 'fittings');
}

/** The hull's name for a Fitting Share Code; null when the code no longer decodes. */
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

/**
 * How long `loadCommunityFittingsCached` reuses a Community's shared Fittings. This
 * device's own shares and unshares drop it at once; another Member's show within it.
 */
export const SHARED_FITTINGS_TTL_MS = 10 * 60_000;

const fittingsCache = createReadCache<SharedFitting[]>();
const fittingsKey = (characterId: number, communityId: string) => `${characterId}:${communityId}:`;

/**
 * Runs a write to a Community's shared Fittings, then drops that cached list: after the
 * write, so a read that was in flight during it is dropped too, and even when it failed.
 */
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

/** Every Fitting shared into one Community, by anyone, read now (and remembered). */
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

/**
 * As `loadCommunityFittings`, reused for `SHARED_FITTINGS_TTL_MS`: the Fittings start screen
 * and the editor's share status open often and change rarely.
 */
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
  const snap = await getDocs(fittingsOf(getSyncFirestore(), communityId));
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

/** The Fittings (by `fittingChoiceKey`) this Character has shared into one Community. */
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
    query(fittingsOf(getSyncFirestore(), communityId), where('ownerUid', '==', uid))
  );
  const keys = new Set<string>();
  for (const entry of mine.docs) {
    const parsed = parseSharedFittingId(entry.id);
    if (parsed) keys.add(fittingChoiceKey(parsed));
  }
  return keys;
}

/** The Communities this Character is in, every Fitting shared into each, and who (by uid) shared them. */
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

/** The Communities this Character is in, and which of them already hold this one Fitting. */
export async function loadShareStatus(
  characterId: number,
  key: SharedFittingKey
): Promise<{ communities: CommunitySummary[]; sharedIn: Set<string> }> {
  const docId = sharedFittingId(uidForCharacter(characterId), key);
  // From the Community's shared list, which this device's own shares keep current.
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

/** What toggling a Fitting in a Community did, for the notice it leaves. */
export type ShareOutcome = 'shared' | 'unshared' | 'cannot' | 'failed';

/** Shares the Fitting if it is not in the Community yet, unshares it if it is. Never throws. */
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

/** Shares (or replaces) one Fitting in one Community. False when it can't be shared (unreadable or too large). */
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
        getSyncFirestore(),
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
        getSyncFirestore(),
        'communities',
        communityId,
        'fittings',
        sharedFittingId(uidForCharacter(characterId), key)
      )
    )
  );
}

/** Shares many at once ("share all my Fittings"); returns how many went up. */
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
  const db = getSyncFirestore();
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

/** Stops sharing every Fitting this Character put in one Community. */
export async function unshareAllFittings(characterId: number, communityId: string): Promise<void> {
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  const mine = await getDocs(query(fittingsOf(db, communityId), where('ownerUid', '==', uid)));
  await changingFittings(characterId, communityId, async () => {
    for (let start = 0; start < mine.docs.length; start += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const entry of mine.docs.slice(start, start + BATCH_SIZE)) batch.delete(entry.ref);
      await batch.commit();
    }
  });
}

/** The logout prompt's "remove my shared Fittings": every Community, best effort per Community. */
export async function unshareAllFittingsEverywhere(characterId: number): Promise<void> {
  const communities = await loadMyCommunities(characterId);
  await Promise.allSettled(
    communities.map((community) => unshareAllFittings(characterId, community.id))
  );
}

/**
 * A saved Fitting was re-saved: pushes the new code and time to every
 * Community it is already shared to. Never throws; skipped when this device
 * has no sync set up (a Character signed in nowhere shared nothing).
 */
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
    const db = getSyncFirestore();
    // The list may be cached; each copy's existence is read fresh, so one deleted on another
    // device is never brought back.
    await withMyCommunities(characterId, (communities) =>
      Promise.all(
        communities.map(async (community) => {
          const key = { source: 'saved', key: record.id } as const;
          const [existing, allExcluded] = await Promise.all([
            getDoc(doc(fittingsOf(db, community.id), docId)),
            loadFittingsAll(characterId, community.id),
          ]);
          // Deleted since this save began: don't bring it back.
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
  } catch {
    // Best effort: the copy stays as it was until the next save.
  }
}

/** A saved Fitting was deleted: removes its shared copies from every Community. Never throws. */
export async function unshareDeletedFitting(characterId: number, fittingId: string): Promise<void> {
  try {
    const communities = await loadMyCommunities(characterId);
    await Promise.allSettled(
      communities.map((community) =>
        unshareFitting(characterId, community.id, { source: 'saved', key: fittingId })
      )
    );
  } catch {
    // Best effort; the Community's own cleanup on leave still removes it.
  }
}

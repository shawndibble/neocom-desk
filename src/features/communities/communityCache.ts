/**
 * The last Community data read while online, kept on this device so the
 * Communities page can still show it with no connection (read-only, labelled
 * cached). Firestore here is the `lite` build with no offline persistence, so
 * without this an offline visit shows nothing and every Community is out of
 * reach.
 *
 * Stored in `settings` under `communitySnapshot:{characterId}:{kind}[:{communityId}]`,
 * like the other small per-Character Community records (`shareSelection.ts`,
 * `requestBadge.ts`): no new table. A Community and its Members are already
 * visible to this Character, so the snapshot holds nothing it could not read
 * live; the prefix is per Character, so another Character never sees it, and
 * `deleteCommunitySnapshots` runs wherever the Character's rows are removed
 * (`removeCharacter`).
 */
import { db } from '@/db';
import { communityBackendOverride } from './backendOverride';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import { isOfflineFailure } from '@/esi/client';
import { isOnline } from '@/stores/network';

export type SnapshotKind = 'list' | 'members' | 'libraries';

const PREFIX = 'communitySnapshot:';
const keyFor = (characterId: number, kind: SnapshotKind, communityId?: string) =>
  `${PREFIX}${characterId}:${kind}${communityId === undefined ? '' : `:${communityId}`}`;

/** Remember what was just read. A write that fails (quota, private window) is dropped: this is only a fallback. */
export async function saveCommunitySnapshot(
  characterId: number,
  kind: SnapshotKind,
  value: unknown,
  communityId?: string
): Promise<void> {
  // A stand-in backend (Storybook) is not this Character's real Communities.
  if (communityBackendOverride()) return;
  try {
    await db.settings.put({ key: keyFor(characterId, kind, communityId), value });
  } catch (err) {
    console.warn('Community snapshot could not be saved', err);
  }
}

/** The last saved copy, or null when there is none (or it cannot be read). */
export async function loadCommunitySnapshot<T>(
  characterId: number,
  kind: SnapshotKind,
  communityId?: string
): Promise<T | null> {
  try {
    const row = await db.settings.get(keyFor(characterId, kind, communityId));
    return row ? (row.value as T) : null;
  } catch {
    return null;
  }
}

/** Run inside `removeCharacter`'s transaction: a removed Character leaves no Community data behind. */
export async function deleteCommunitySnapshots(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}

/** Run when a Character leaves or deletes a Community: its saved roster and libraries go with it. */
export async function deleteCommunitySnapshot(
  characterId: number,
  communityId: string
): Promise<void> {
  await db.settings.bulkDelete([
    keyFor(characterId, 'members', communityId),
    keyFor(characterId, 'libraries', communityId),
  ]);
}

/**
 * After a live list: forget the snapshots of Communities the Character is no
 * longer in (removed by the admin, or left on another device).
 */
export async function pruneCommunitySnapshots(
  characterId: number,
  keepIds: readonly string[]
): Promise<void> {
  try {
    const keep = new Set(keepIds);
    const prefix = `${PREFIX}${characterId}:`;
    const stale = (await db.settings.where('key').startsWith(prefix).primaryKeys()).filter(
      (key) => {
        const [kind, ...rest] = String(key).slice(prefix.length).split(':');
        return kind !== 'list' && !keep.has(rest.join(':'));
      }
    );
    await db.settings.bulkDelete(stale);
  } catch (err) {
    console.warn('Community snapshots could not be pruned', err);
  }
}

const NETWORK_CODES = new Set([
  'unavailable',
  'functions/unavailable',
  'auth/network-request-failed',
  'deadline-exceeded',
]);

/**
 * The read failed for want of a connection (a fetch error, an ESI-layer
 * offline error, Firestore's `unavailable`), as opposed to being refused: only
 * the former may show the saved copy. A refusal (`permission-denied` after a
 * removal) must surface, not be papered over by stale data.
 */
export function isNetworkFailure(err: unknown): boolean {
  if (isOfflineFailure(err)) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && NETWORK_CODES.has(code);
}

/**
 * Read live, save what came back, and fall back to the saved copy when the
 * read fails for want of a connection. While the browser knows it is offline
 * the saved copy answers at once: a dead uplink can leave a live read pending
 * with no rejection. Nothing saved means the live read is tried anyway.
 */
export async function loadWithSnapshot<T>({
  characterId,
  kind,
  communityId,
  live,
}: {
  characterId: number;
  kind: SnapshotKind;
  communityId?: string;
  live: () => Promise<T>;
}): Promise<{ value: T; cached: boolean }> {
  if (!isOnline()) {
    const saved = await loadCommunitySnapshot<T>(characterId, kind, communityId);
    if (saved !== null) return { value: saved, cached: true };
  }
  try {
    const value = await live();
    void saveCommunitySnapshot(characterId, kind, value, communityId);
    return { value, cached: false };
  } catch (err) {
    if (isNetworkFailure(err) || !isOnline()) {
      const saved = await loadCommunitySnapshot<T>(characterId, kind, communityId);
      if (saved !== null) return { value: saved, cached: true };
    }
    throw err;
  }
}

/** What a library read returns: every Member's items, and which reads failed (those read as empty). */
export interface LibraryRead {
  libraries: MemberLibrary[];
  failedUids: readonly string[];
}

const emptyLibrary = (uid: string): MemberLibrary => ({ uid, items: [] });

/**
 * The Community Library's reads with the saved copy behind them. One Member
 * unreadable while online (just removed, say) reads empty and the rest still
 * show, as before; the snapshot is refreshed from the reads that worked and
 * keeps that Member's old copy. The saved copy is what shows only when the
 * browser is offline, the sign-in failed on the network, or every read failed.
 */
export async function loadLibrariesWithFallback(
  characterId: number,
  communityId: string,
  uids: readonly string[],
  load: () => Promise<LibraryRead>
): Promise<{ libraries: MemberLibrary[]; cached: boolean }> {
  const saved =
    (await loadCommunitySnapshot<MemberLibrary[]>(characterId, 'libraries', communityId)) ?? null;
  const fromSaved = () => ({
    libraries: uids.map(
      (uid) => saved?.find((library) => library.uid === uid) ?? emptyLibrary(uid)
    ),
    cached: true,
  });
  if (!isOnline() && saved) return fromSaved();

  let read: LibraryRead;
  try {
    read = await load();
  } catch (err) {
    if (saved && (isNetworkFailure(err) || !isOnline())) return fromSaved();
    throw err;
  }
  const failed = new Set(read.failedUids);
  if (uids.length > 0 && failed.size >= uids.length) {
    // Nothing could be read at all: a saved copy beats a wall of empty columns.
    if (saved) return fromSaved();
    return { libraries: read.libraries, cached: false };
  }
  const merged = read.libraries.map((library) =>
    failed.has(library.uid) ? (saved?.find((old) => old.uid === library.uid) ?? library) : library
  );
  void saveCommunitySnapshot(characterId, 'libraries', merged, communityId);
  return { libraries: read.libraries, cached: false };
}

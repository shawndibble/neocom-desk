import { db } from '@/db';
import { communityBackendOverride } from './backendOverride';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import { isOfflineFailure } from '@/esi/client';
import { isOnline } from '@/stores/network';

export type SnapshotKind = 'list' | 'members' | 'libraries';

const PREFIX = 'communitySnapshot:';
const keyFor = (characterId: number, kind: SnapshotKind, communityId?: string) =>
  `${PREFIX}${characterId}:${kind}${communityId === undefined ? '' : `:${communityId}`}`;

export async function saveCommunitySnapshot(
  characterId: number,
  kind: SnapshotKind,
  value: unknown,
  communityId?: string
): Promise<void> {
  if (communityBackendOverride()) return;
  try {
    await db.settings.put({ key: keyFor(characterId, kind, communityId), value });
  } catch (err) {
    console.warn('Community snapshot could not be saved', err);
  }
}

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

export async function deleteCommunitySnapshots(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}

export async function deleteCommunitySnapshot(
  characterId: number,
  communityId: string
): Promise<void> {
  await db.settings.bulkDelete([
    keyFor(characterId, 'members', communityId),
    keyFor(characterId, 'libraries', communityId),
  ]);
}

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

export function isNetworkFailure(err: unknown): boolean {
  if (isOfflineFailure(err)) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && NETWORK_CODES.has(code);
}

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

export interface LibraryRead {
  libraries: MemberLibrary[];
  failedUids: readonly string[];
}

const emptyLibrary = (uid: string): MemberLibrary => ({ uid, items: [] });

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
    if (saved) return fromSaved();
    return { libraries: read.libraries, cached: false };
  }
  const merged = read.libraries.map((library) =>
    failed.has(library.uid) ? (saved?.find((old) => old.uid === library.uid) ?? library) : library
  );
  void saveCommunitySnapshot(characterId, 'libraries', merged, communityId);
  return { libraries: read.libraries, cached: false };
}

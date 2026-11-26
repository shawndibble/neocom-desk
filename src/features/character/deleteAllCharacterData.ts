import { db } from '@/db';
import { clearRouteSnapshots } from '@/lib/routeSnapshotCache';
import { haltSync, purgeCharacterRemoteData, signOutOfSync } from '@/sync';
import {
  isCommunityAdmin,
  leaveCommunity,
  loadMyCommunities,
} from '@/features/communities/communityStore';
import { deleteAlertGrantsBestEffort } from '@/features/notifications/alertsGrant';
import { setAppBadgeCount } from '@/features/notifications/badge';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';

export const DATABASE_DELETE_TIMEOUT_MS = 5_000;

const PRECACHE_PREFIX = 'workbox-precache';

export async function purgeAllRemoteCharacterData(): Promise<number[]> {
  await haltSync();
  const characters = await db.characters.orderBy('characterId').toArray();
  const unpurged: number[] = [];
  for (const { characterId } of characters) {
    try {
      await purgeCharacterRemoteData(characterId);
    } catch {
      unpurged.push(characterId);
    }
    await deleteAlertGrantsBestEffort([characterId]);
  }
  return unpurged;
}

export interface CharacterCommunity {
  characterId: number;
  communityId: string;
  name: string;
  administered: boolean;
}

export async function loadAllCommunities(): Promise<CharacterCommunity[]> {
  const characters = await db.characters.orderBy('characterId').toArray();
  const found: CharacterCommunity[] = [];
  for (const { characterId } of characters) {
    try {
      for (const community of await loadMyCommunities(characterId)) {
        found.push({
          characterId,
          communityId: community.id,
          name: community.name,
          administered: isCommunityAdmin(community, characterId),
        });
      }
    } catch {}
  }
  return found;
}

export async function leaveAllCommunities(
  communities: readonly CharacterCommunity[]
): Promise<number[]> {
  const failed: number[] = [];
  for (const { characterId, communityId, administered } of communities) {
    if (administered) continue;
    try {
      await leaveCommunity(characterId, communityId);
    } catch {
      if (!failed.includes(characterId)) failed.push(characterId);
    }
  }
  return failed;
}

function withTimeout(work: Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), DATABASE_DELETE_TIMEOUT_MS);
  });
  return Promise.race([work.then(() => true), timeout]).finally(() => clearTimeout(timer));
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function deleteOtherDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  const databases = await indexedDB.databases().catch(() => []);
  await Promise.all(
    databases
      .map((info) => info.name)
      .filter((name): name is string => !!name && name !== db.name)
      .map((name) => withTimeout(deleteDatabase(name)))
  );
}

function clearWebStorage(): void {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      storage().clear();
    } catch {}
  }
}

async function clearRuntimeCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys().catch(() => []);
  await Promise.all(
    names
      .filter((name) => !name.startsWith(PRECACHE_PREFIX))
      .map((name) => caches.delete(name).catch(() => false))
  );
}

export async function deleteAllLocalData(syncConfigured: boolean): Promise<void> {
  const ids = (await db.characters.toArray()).map((character) => character.characterId);
  await db.tokens.clear();

  scheduleProjectionRebuild.cancel();
  await unregisterProjectionRegistration();
  if (syncConfigured) {
    await haltSync();
    await signOutOfSync(ids).catch(() => {});
  }
  await Promise.all([setAppBadgeCount(0), deleteOtherDatabases(), clearRuntimeCaches()]);
  clearWebStorage();

  await clearRouteSnapshots();
  if (!(await withTimeout(db.delete()))) {
    throw new Error('The app database delete is blocked by another tab');
  }
  await db.open();
}

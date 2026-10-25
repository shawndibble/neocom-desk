// Removing a Character from the app (parity plan §5.7 item 3): local Dexie
// rows for it are deleted (per each synced collection's `onRemoval` rule in
// sync/syncedCollections.ts). Its remote Editable Data (GLOSSARY.md) is left
// alone: the `purgeStaleAccounts` Cloud Function deletes it once no device
// has synced the Character for 90 days. Adding the Character back before then
// pulls it all again — the pull cursors go with the local rows.
//
// Unlike a sold Character (detected via a changed ownerHash, handled by
// sync/planSync.handleOwnerHashChange), this is the user *choosing* to drop
// a Character they still hold — there is no signal to detect it from, so it
// needs its own explicit entry point.

import { clearWalletArchive } from '@/features/character/walletArchive';
import { deleteCommunitySnapshots } from '@/features/communities/communityCache';
import { deleteShareSelections } from '@/features/communities/shareSelection';
import { db } from '@/db';
import { purgeCharacterCacheOrSuppress, purgeSharedStructureCache } from '@/esi/cachePurge';
import { isSyncConfigured } from '@/app/syncStatus';
import { clearCharacterSyncBookkeeping, removeCharacterSession, triggerSync } from '@/sync';
import { EDITABLE_COLLECTIONS } from '@/sync/syncedCollections';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import { deleteFeedForCharacter } from '@/features/notifications/feed';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  deleteAlertGrantsBestEffort,
  forgetAlertsGrants,
} from '@/features/notifications/alertsGrant';

/**
 * How long the last pushes may take, all together, before removal goes ahead
 * without them — a hung push (offline, stalled chunk load) must not block it.
 * One that outlives this is abandoned, not cancelled: it may still write a
 * stale local copy for a Character already gone, never a login.
 */
export const SYNC_FLUSH_TIMEOUT_MS = 8_000;

/**
 * Best-effort push of each Character's unsynced edits before its local rows
 * and tombstones go; a failure here only means those edits are lost.
 */
export async function flushSync(characterIds: readonly number[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SYNC_FLUSH_TIMEOUT_MS);
  });
  const pushes = Promise.allSettled(characterIds.map((id) => triggerSync(id)));
  try {
    await Promise.race([pushes, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort deletion of what these Characters shared with their Communities
 * (issue #3600), bounded like {@link flushSync}: it needs each Character's
 * sign-in, so it runs before the local removal, and a hung or failed delete
 * must not keep the Character on the device. Whatever is left is removed by
 * `purgeStaleAccounts` once no device syncs the Character.
 */
export async function removeSharedBlueprints(characterIds: readonly number[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SYNC_FLUSH_TIMEOUT_MS);
  });
  const removals = (async () => {
    const { removeSharedLibraries } = await import('@/features/communities/libraryPush');
    const { unshareAllFittingsEverywhere } = await import('@/features/communities/sharedFittings');
    const { unshareAllPlansEverywhere } = await import('@/features/communities/sharedPlans');
    // One Character at a time.
    for (const id of characterIds) {
      await removeSharedLibraries(id).catch(() => undefined);
      await unshareAllFittingsEverywhere(id).catch(() => undefined);
      await unshareAllPlansEverywhere(id).catch(() => undefined);
    }
  })().catch(() => undefined);
  try {
    await Promise.race([removals, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Removing one Character from the Characters page: a last push when sync is
 * set up (gate on `isSyncConfigured()` at the call site), then local removal.
 */
export async function removeCharacterAfterSync(
  characterId: number,
  syncConfigured: boolean,
  removeShared = false
): Promise<void> {
  if (removeShared) await removeSharedBlueprints([characterId]);
  // Before the local removal: deleting a grant needs this Character's sign-in.
  if (syncConfigured) await deleteAlertGrantsBestEffort([characterId]);
  if (syncConfigured) await flushSync([characterId]);
  await removeCharacter(characterId);
}

/**
 * @param syncPush Whether to bring this device's Scheduled Push registration in
 *   line with the remaining roster. `logoutAllCharacters` turns it off and
 *   unregisters once itself, rather than once per Character.
 */
export async function removeCharacter(characterId: number, syncPush = true): Promise<void> {
  // One transaction for every Dexie-only step: all-or-nothing, so a failure
  // cannot leave a half-removed Character behind, and live queries wake once
  // at commit rather than once per table. Nothing non-Dexie may be awaited in
  // here (IndexedDB would auto-commit early) — the badge, Cache API purge and
  // push registration all run after it.
  const deletedTables = EDITABLE_COLLECTIONS.filter(
    (collection) => collection.onRemoval === 'delete'
  ).map((collection) => collection.table);
  await db.transaction(
    'rw',
    [
      db.characters,
      db.tokens,
      ...deletedTables.map((table) => db.table(table)),
      db.orderProblemSamples,
      db.mailDrafts,
      db.miningLedgerHistory,
      db.industryJobHistory,
      db.walletJournalArchive,
      db.walletTransactionArchive,
      db.walletArchiveCoverage,
      db.corpMailQueue,
      db.notificationFeed,
      db.settings,
    ],
    async () => {
      await db.characters.delete(characterId);
      await db.tokens.delete(characterId);
      for (const table of deletedTables) {
        await db.table(table).where('characterId').equals(characterId).delete();
      }
      await db.orderProblemSamples.where('characterId').equals(characterId).delete();
      await db.mailDrafts.where('characterId').equals(characterId).delete();
      await db.miningLedgerHistory.delete(characterId);
      await db.industryJobHistory.delete(characterId);
      // Mail queued from this Character can no longer be sent.
      await db.corpMailQueue.where('senderCharacterId').equals(characterId).delete();
      await clearWalletArchive(characterId);
      // Orphaned feed rows are invisible in the UI (both the bell panel and the
      // other-character counts skip ids with no Character) but `refreshAppBadge`
      // counts the whole table — leaving an app-icon count nothing can dismiss.
      await deleteFeedForCharacter(characterId);
      await clearCharacterSyncBookkeeping(characterId);
      await deleteShareSelections(characterId);
      await deleteCommunitySnapshots(characterId);
    }
  );
  await forgetAlertsGrants([characterId]);
  // Its own Firebase app and persisted session go with it (issue #5074).
  if (isSyncConfigured()) await removeCharacterSession(characterId).catch(() => {});
  await refreshAppBadge();
  await purgeCharacterCacheOrSuppress(characterId);
  // Not part of that purge: the shared rows aren't this Character's own —
  // they survive as long as the roster does, and only stop being that
  // roster's own knowledge once nobody in it is left (esi/cachePurge.ts).
  const remaining = await db.characters.count();
  if (remaining === 0) {
    await purgeSharedStructureCache();
  }
  // This device's own push registration follows its roster: gone with the
  // last Character, re-uploaded without this one otherwise. The removed
  // Character's stored Projection is left alone (other devices keep it).
  if (syncPush) {
    if (remaining === 0) {
      scheduleProjectionRebuild.cancel();
      await unregisterProjectionRegistration();
    } else {
      scheduleProjectionRebuild(Promise.resolve());
    }
  }

  const { activeCharacterId, setActiveCharacter, clearActiveCharacter } =
    useActiveCharacter.getState();
  if (activeCharacterId === characterId) {
    const next = await db.characters.orderBy('characterId').first();
    if (next) await setActiveCharacter(next.characterId);
    else await clearActiveCharacter();
  }
}

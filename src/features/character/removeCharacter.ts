import { dropCharacterHubEntry } from '@/features/market/tradeHubActions';
import { clearBookCache } from '@/features/corp/taxBook/bookCache';
import { clearVettingSession } from '@/features/corp/vetting/vettingSession';
import { clearObservedCopies } from '@/features/corp/taxBook/observedStore';
import { clearWalletArchive } from '@/features/character/walletArchive';
import { clearContractArchive } from '@/features/character/contractArchive';
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

export const SYNC_FLUSH_TIMEOUT_MS = 8_000;

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

export async function removeSharedBlueprints(characterIds: readonly number[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SYNC_FLUSH_TIMEOUT_MS);
  });
  const removals = (async () => {
    const { removeSharedLibraries } = await import('@/features/communities/libraryPush');
    const { unshareAllFittingsEverywhere } = await import('@/features/communities/sharedFittings');
    const { unshareAllPlansEverywhere } = await import('@/features/communities/sharedPlans');
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

export async function removeCharacterAfterSync(
  characterId: number,
  syncConfigured: boolean,
  removeShared = false
): Promise<void> {
  if (removeShared) await removeSharedBlueprints([characterId]);
  if (syncConfigured) await deleteAlertGrantsBestEffort([characterId]);
  if (syncConfigured) await flushSync([characterId]);
  await removeCharacter(characterId);
}

export async function removeCharacter(characterId: number, syncPush = true): Promise<void> {
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
      db.contractArchive,
      db.contractItemArchive,
      db.corpMailQueue,
      db.corpBookObserved,
      db.corpBookObservedMeta,
      db.corpBookParts,
      db.routeSnapshots,
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
      await db.corpMailQueue.where('senderCharacterId').equals(characterId).delete();
      await clearWalletArchive(characterId);
      await clearContractArchive(characterId);
      await clearObservedCopies(characterId);
      clearBookCache();
      clearVettingSession();
      await deleteFeedForCharacter(characterId);
      await clearCharacterSyncBookkeeping(characterId);
      await deleteShareSelections(characterId);
      await deleteCommunitySnapshots(characterId);
      await db.routeSnapshots.where('characterId').equals(characterId).delete();
    }
  );
  await dropCharacterHubEntry(characterId).catch(() => {});
  await forgetAlertsGrants([characterId]);
  if (isSyncConfigured()) await removeCharacterSession(characterId).catch(() => {});
  await refreshAppBadge();
  await purgeCharacterCacheOrSuppress(characterId);
  const remaining = await db.characters.count();
  if (remaining === 0) {
    await purgeSharedStructureCache();
  }
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

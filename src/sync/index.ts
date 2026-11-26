import { setStatus } from './status';
import { isOnline } from '@/stores/network';
import { redactSecrets } from '@/observability/scrub';
import { reportFailure } from '@/observability/reportFailure';
import type { ScheduleSyncOptions } from './syncScheduler';

export { getSyncStatus, subscribeSyncStatus, type SyncState, type SyncStatus } from './status';
export type { ScheduleSyncOptions } from './syncScheduler';
export type { SyncedCollectionName } from './syncedCollections';
export { uidForCharacter } from './uid';
export { TOMBSTONE_TTL_MS } from './merge';
export { clearCharacterSyncBookkeeping } from './localBookkeeping';
export { backfillAccountWideData } from './accountWideBackfill';

export async function triggerSync(characterId: number): Promise<void> {
  const { triggerSync } = await import('./planSync');
  return triggerSync(characterId);
}

export async function signOutOfSync(characterIds: readonly number[] = []): Promise<void> {
  const { signOutOfSync } = await import('./syncAuth');
  return signOutOfSync(characterIds);
}

export async function removeCharacterSession(characterId: number): Promise<void> {
  const { removeCharacterSession } = await import('./syncAuth');
  return removeCharacterSession(characterId);
}

export async function haltSync(): Promise<void> {
  const { haltSync } = await import('./planSync');
  return haltSync();
}

export function scheduleSync(characterId: number, options?: number | ScheduleSyncOptions): void {
  void import('./planSync')
    .then((m) => m.scheduleSync(characterId, options))
    .catch((error: unknown) => {
      reportFailure('sync', error);
      setStatus(characterId, {
        state: 'error',
        error: redactSecrets(error instanceof Error ? error.message : String(error)),
        offline: !isOnline(),
      });
    });
}

export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  const { markPlanDeleted } = await import('./planSync');
  return markPlanDeleted(characterId, planId);
}

export async function markBuildPlanDeleted(characterId: number, planId: string): Promise<void> {
  const { markBuildPlanDeleted } = await import('./planSync');
  return markBuildPlanDeleted(characterId, planId);
}

export async function markBuildPlansDeleted(characterId: number, planIds: string[]): Promise<void> {
  const { markBuildPlansDeleted } = await import('./planSync');
  return markBuildPlansDeleted(characterId, planIds);
}

export async function markFittingDeleted(characterId: number, fittingId: string): Promise<void> {
  const { markFittingDeleted } = await import('./planSync');
  return markFittingDeleted(characterId, fittingId);
}

export async function setCharacterStationPin(
  characterId: number,
  locationId: number
): Promise<void> {
  const { setCharacterStationPin } = await import('./planSync');
  return setCharacterStationPin(characterId, locationId);
}

export async function setAccountStationPin(locationId: number): Promise<void> {
  const { setAccountStationPin } = await import('./planSync');
  return setAccountStationPin(locationId);
}

export async function clearStationPin(locationId: number): Promise<void> {
  const { clearStationPin } = await import('./planSync');
  return clearStationPin(locationId);
}

export async function setPlanetRichness(planetId: number, order: number[]): Promise<void> {
  const { setPlanetRichness } = await import('./planSync');
  return setPlanetRichness(planetId, order);
}

export async function clearPlanetRichness(planetId: number): Promise<void> {
  const { clearPlanetRichness } = await import('./planSync');
  return clearPlanetRichness(planetId);
}

export async function markProductionRunDeleted(characterId: number, runId: string): Promise<void> {
  const { markProductionRunDeleted } = await import('./planSync');
  return markProductionRunDeleted(characterId, runId);
}

export async function removeProductionSaleLink(characterId: number, linkId: string): Promise<void> {
  const { removeProductionSaleLink } = await import('./planSync');
  return removeProductionSaleLink(characterId, linkId);
}

export async function removeProductionLoss(characterId: number, lossId: string): Promise<void> {
  const { removeProductionLoss } = await import('./planSync');
  return removeProductionLoss(characterId, lossId);
}

export async function removeProductionOrderWatch(
  characterId: number,
  watchId: string
): Promise<void> {
  const { removeProductionOrderWatch } = await import('./planSync');
  return removeProductionOrderWatch(characterId, watchId);
}

export async function setSyncedSetting(key: string, value: unknown): Promise<void> {
  const { setSyncedSetting } = await import('./planSync');
  return setSyncedSetting(key, value);
}

export async function deleteSyncedSetting(key: string): Promise<void> {
  const { deleteSyncedSetting } = await import('./planSync');
  return deleteSyncedSetting(key);
}

export async function ensureSignedIn(characterId: number): Promise<string> {
  const { ensureSignedIn } = await import('./syncAuth');
  return ensureSignedIn(characterId);
}

export async function purgeCharacterRemoteData(characterId: number): Promise<void> {
  const { purgeCharacterRemoteData } = await import('./remotePurge');
  return purgeCharacterRemoteData(characterId);
}

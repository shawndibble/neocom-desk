import { db } from '@/db';
import { signOutOfSync } from '@/sync';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';
import { deleteAlertGrantsBestEffort } from '@/features/notifications/alertsGrant';
import { flushSync, removeCharacter, removeSharedBlueprints } from './removeCharacter';

export async function logoutAllCharacters(
  syncConfigured: boolean,
  removeShared = false
): Promise<number> {
  const characters = await db.characters.toArray();
  const ids = characters.map((character) => character.characterId);
  if (removeShared) await removeSharedBlueprints(ids);
  if (syncConfigured) await deleteAlertGrantsBestEffort(ids);
  if (syncConfigured) await flushSync(ids);
  for (const id of ids) {
    await removeCharacter(id, false);
  }
  await db.tokens.clear();
  scheduleProjectionRebuild.cancel();
  await unregisterProjectionRegistration();
  if (syncConfigured) {
    await signOutOfSync(ids).catch(() => {});
  }
  return ids.length;
}

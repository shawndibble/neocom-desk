import { db } from '@/db';

/**
 * Reload this tab when another one deletes the app database ("Delete all
 * data", features/character/deleteAllCharacterData.ts). Dexie's own handler
 * only closes the connection with auto-open still on, so this tab's next query
 * would recreate an empty database and keep writing to it behind a UI still
 * showing the old roster. Returns an unsubscribe.
 *
 * Wired from the shell, not `src/db`: that module also ships in the service
 * worker, which has no page to reload.
 */
export function reloadOnDatabaseWipe(reload: () => void = () => window.location.reload()) {
  const onVersionChange = (event: IDBVersionChangeEvent) => {
    // A null (or 0) new version is a delete; an upgrade has its own handling.
    if (!event.newVersion) reload();
  };
  db.on('versionchange', onVersionChange);
  return () => db.on('versionchange').unsubscribe(onVersionChange);
}

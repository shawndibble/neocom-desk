import { db } from '@/db';

export function reloadOnDatabaseWipe(reload: () => void = () => window.location.reload()) {
  const onVersionChange = (event: IDBVersionChangeEvent) => {
    if (!event.newVersion) reload();
  };
  db.on('versionchange', onVersionChange);
  return () => db.on('versionchange').unsubscribe(onVersionChange);
}

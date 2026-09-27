import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { reloadOnDatabaseWipe } from './databaseWipe';

let unsubscribe: (() => void) | undefined;

afterEach(async () => {
  unsubscribe?.();
  if (!db.isOpen()) await db.open();
});

function deleteFromAnotherTab(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(db.name);
    request.onsuccess = () => resolve();
  });
}

describe('reloadOnDatabaseWipe', () => {
  it('reloads this tab when another one deletes the database', async () => {
    await db.open();
    const reload = vi.fn();
    unsubscribe = reloadOnDatabaseWipe(reload);

    await deleteFromAnotherTab();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('stays put once unsubscribed', async () => {
    await db.open();
    const reload = vi.fn();
    reloadOnDatabaseWipe(reload)();

    await deleteFromAnotherTab();

    expect(reload).not.toHaveBeenCalled();
  });
});

/**
 * True once an absent layout (the Overview's, or the board `layoutKey` names) means "none": the
 * settings store has hydrated, the first sync pull has landed (or cannot), and
 * Dexie itself holds no layout row. See `firstRun.ts` for why.
 *
 * The store re-reads asynchronously after a pull, so right after the sync
 * status flips there is a window where the store still reads null while the
 * row is already on disk. The Dexie check closes it: a row present means a
 * layout is about to arrive, so the chooser (and the migration) stay quiet.
 */
import { useEffect, useState } from 'react';
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { subscribeSyncStatus, type SyncStatus } from '@/sync/status';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { FIRST_PULL_WAIT_MS, syncSettled } from './firstRun';
import { OVERVIEW_LAYOUT_KEY, parseLayout } from './layoutStore';

const INITIAL: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };

/** `layoutKey`: which board's layout row to look for (the Overview's by default). */
export function useFirstRunReady(hydrated: boolean, layoutKey = OVERVIEW_LAYOUT_KEY): boolean {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const syncConfigured = isSyncConfigured();
  const [status, setStatus] = useState<SyncStatus>(INITIAL);
  const online = useOnline();
  const [waitedOut, setWaitedOut] = useState(false);
  const [rowChecked, setRowChecked] = useState<'pending' | 'absent' | 'present'>('pending');

  useEffect(() => {
    if (!syncConfigured) return;
    return subscribeSyncStatus((next) => {
      if (next.characterId === undefined || next.characterId === activeCharacterId) {
        setStatus(next);
      }
    });
  }, [syncConfigured, activeCharacterId]);

  useEffect(() => {
    if (!syncConfigured) return;
    const timer = setTimeout(() => setWaitedOut(true), FIRST_PULL_WAIT_MS);
    return () => clearTimeout(timer);
  }, [syncConfigured]);

  const settled = syncSettled({
    syncConfigured,
    state: status.state,
    lastSyncedAt: status.lastSyncedAt,
    online,
    waitedOut,
  });

  useEffect(() => {
    if (!hydrated || !settled) return;
    let cancelled = false;
    void db.settings
      .get(layoutKey)
      .then((row) => {
        if (cancelled) return;
        setRowChecked(row !== undefined && parseLayout(row.value) !== null ? 'present' : 'absent');
      })
      .catch(() => {
        if (!cancelled) setRowChecked('absent');
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, settled, layoutKey]);

  return hydrated && settled && rowChecked === 'absent';
}

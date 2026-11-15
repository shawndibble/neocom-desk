import type {
  CorpTaxBookSyncStoppedFire,
  SyncStoppedAlertSnapshot,
} from '@/engine/corpTaxBook/syncStoppedAlert';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { defineDomain } from './defineDomain';

/* Corp Tax Book: the scheduled sync stopped ------------------------------------ */

/**
 * `corpTaxBookSyncStopped` is raised by the backend when the scheduled sync stops a book's
 * Automatic sync, and reaches a device as a push (ADR 0027). The open app shows a stopped
 * schedule on the book itself and reads nothing for it in the background, so this domain always
 * skips its poll (`null`) and never fires. It exists because every Notification Event names the
 * domain that could fire it.
 */
export const corpTaxBookSyncDomain = defineDomain<
  never,
  SyncStoppedAlertSnapshot,
  CorpTaxBookSyncStoppedFire
>({
  source: SNAPSHOT_SOURCES.corpTaxBookSync,
  stateKey: 'notifications.pollerState.corpTaxBookSync',
  entriesKey: 'entries',
  isEntry: () => false,
  load: async () => null,
  toSnapshot: (_entries, nowMs) => ({ entries: [], nowMs }),
});

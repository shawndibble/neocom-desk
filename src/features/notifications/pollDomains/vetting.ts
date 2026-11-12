import type { VettingAlertSnapshot, VettingSharedFire } from '@/engine/vettingAlert';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { defineDomain } from './defineDomain';

/* Vetting: a new report to review ------------------------------------------- */

/**
 * `vettingShared` is raised by the backend when it writes a shared report and reaches a device
 * as a push (ADR 0027). The open app does not read the queue in the background, since every
 * read is a signed-in callable, so this domain always skips its poll (`null`) and never fires.
 * It exists because every Notification Event names the domain that could fire it.
 */
export const vettingDomain = defineDomain<never, VettingAlertSnapshot, VettingSharedFire>({
  source: SNAPSHOT_SOURCES.vetting,
  stateKey: 'notifications.pollerState.vetting',
  entriesKey: 'entries',
  isEntry: () => false,
  load: async () => null,
  toSnapshot: (_entries, nowMs) => ({ entries: [], nowMs }),
});

import { db } from '@/db';
import { isAcceleratorLive } from '@/engine/accelerator';
import type {
  AcceleratorEndedFire,
  AcceleratorPresenceEntry,
  AcceleratorPresenceSnapshot,
} from '@/engine/notificationDiffs';
import { acceleratorId } from '@/features/accelerator/characterAccelerators';
import { detectAcceleratorBonus } from '@/features/accelerator/useAccelerators';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

/* Whether a cerebral accelerator is running --------------------------------- */

const isPresenceEntry = shapeGuard<AcceleratorPresenceEntry>({
  kind: is.oneOf(['typed', 'detected'] as const),
  bonus: is.number,
  expiresAtMs: is.number,
});

/**
 * What the app knows of the Character's accelerator right now: the typed-in
 * one while it runs, and the one the cached attribute sheet implies. Both are
 * local reads (Dexie and the ESI cache), so no scope and no fetch, and it only
 * runs while the app is open. A typed one that has run out is simply absent,
 * so the diff sees it go.
 */
export const acceleratorEndedDomain = defineDomain<
  AcceleratorPresenceEntry,
  AcceleratorPresenceSnapshot,
  AcceleratorEndedFire
>({
  source: SNAPSHOT_SOURCES.acceleratorPresence,
  stateKey: 'notifications.pollerState.acceleratorPresence',
  entriesKey: 'entries',
  isEntry: isPresenceEntry,
  load: async (characterId) => {
    const entries: AcceleratorPresenceEntry[] = [];
    const record = await db.characterAccelerators.get(acceleratorId(characterId));
    if (record && isAcceleratorLive(record, Date.now())) {
      entries.push({ kind: 'typed', bonus: record.bonus, expiresAtMs: record.expiresAt });
    }
    const detected = await detectAcceleratorBonus(characterId);
    if (detected !== null) entries.push({ kind: 'detected', bonus: detected, expiresAtMs: 0 });
    return entries;
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async () => ({}),
});

import { db } from '@/db';
import { isAcceleratorLive } from '@/engine/accelerator';
import type {
  AcceleratorEndedFire,
  AcceleratorPresenceEntry,
  AcceleratorPresenceSnapshot,
} from '@/engine/notificationDiffs';
import { acceleratorId } from '@/features/accelerator/characterAccelerators';
import { readDetectedAccelerator } from '@/features/accelerator/useAccelerators';
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
    const detected = await readDetectedAccelerator(characterId);
    // Cannot tell (nothing cached yet, or the read failed): skip the tick and keep the baseline,
    // so an emptied cache never reads as a removed accelerator.
    if (detected === null) return null;
    if (detected.bonus !== null) {
      entries.push({ kind: 'detected', bonus: detected.bonus, expiresAtMs: 0 });
    }
    return entries;
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async () => ({}),
});

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

const isPresenceEntry = shapeGuard<AcceleratorPresenceEntry>({
  kind: is.oneOf(['typed', 'detected'] as const),
  bonus: is.number,
  expiresAtMs: is.number,
});

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
    if (detected === null) return null;
    if (detected.bonus !== null) {
      entries.push({ kind: 'detected', bonus: detected.bonus, expiresAtMs: 0 });
    }
    return entries;
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async () => ({}),
});

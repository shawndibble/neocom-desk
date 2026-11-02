import { db } from '@/db';
import { isAcceleratorLive } from '@/engine/accelerator';
import { projectAccelerators } from '@/engine/projection';
import type {
  AcceleratorEntrySnapshot,
  AcceleratorExpiringFire,
  AcceleratorSnapshot,
} from '@/engine/notificationDiffs';
import { acceleratorId } from '@/features/accelerator/characterAccelerators';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds } from './shared';

/* Typed-in cerebral accelerator ----------------------------------------------- */

const isAcceleratorEntrySnapshot = shapeGuard<AcceleratorEntrySnapshot>({
  expiresAtMs: is.number,
  bonus: is.number,
  leadMs: is.number,
});

/**
 * The Character's typed-in accelerator, if one is still running. Local data
 * only (no ESI, no scope): a Character with none, or whose accelerator has
 * run out, has no entry, so nothing fires for it.
 */
export const acceleratorDomain = defineDomain<
  AcceleratorEntrySnapshot,
  AcceleratorSnapshot,
  AcceleratorExpiringFire
>({
  source: SNAPSHOT_SOURCES.accelerator,
  stateKey: 'notifications.pollerState.accelerator',
  entriesKey: 'entries',
  isEntry: isAcceleratorEntrySnapshot,
  load: async (characterId) => {
    const record = await db.characterAccelerators.get(acceleratorId(characterId));
    if (!record || !isAcceleratorLive(record, Date.now())) return [];
    const leadMs = (await currentThresholds(characterId)).acceleratorExpiringLeadHours * HOUR_MS;
    return [{ expiresAtMs: record.expiresAt, bonus: record.bonus, leadMs }];
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // As in the other lead-time domains: the baseline keeps the lead time the
  // diff needs; the Projection reads the current one.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const leadMs = (await currentThresholds(characterId)).acceleratorExpiringLeadHours * HOUR_MS;
    return projectAccelerators(
      characterId,
      characterName,
      snapshot.entries.map((entry) => ({ ...entry, leadMs })),
      NOTIFICATION_EVENT_ENTRIES.acceleratorExpiring.projection.push,
      nowMs
    );
  },
  names: async () => ({}),
});

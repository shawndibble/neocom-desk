import { loadCharacterSkillsWithStatus } from '@/features/skills/data';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import type {
  SpExtractionEntrySnapshot,
  SpExtractionFire,
  SpExtractionSnapshot,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

/* SP extraction (grilling session, 2026-09-09) ------------------------------- */

const isSpExtractionEntrySnapshot = shapeGuard<SpExtractionEntrySnapshot>({
  totalSp: is.number,
  thresholdSp: is.number,
});

/** Re-read every poll, same reasoning as `currentThresholds` in `shared.ts`: AC4's "without a reload" needs the live value, not a value captured at store-creation time. */
async function currentSpExtractionEnabled(): Promise<boolean> {
  await useSpExtractionMonitoringEnabled.getState().hydrate();
  return useSpExtractionMonitoringEnabled.getState().value;
}

async function currentSpExtractionThresholdSp(): Promise<number> {
  await useSpExtractionThresholdSp.getState().hydrate();
  return useSpExtractionThresholdSp.getState().value;
}

export const spExtractionDomain = defineDomain<
  SpExtractionEntrySnapshot,
  SpExtractionSnapshot,
  SpExtractionFire
>({
  source: SNAPSHOT_SOURCES.spExtraction,
  stateKey: 'notifications.pollerState.spExtraction',
  entriesKey: 'entries',
  isEntry: isSpExtractionEntrySnapshot,
  load: async (characterId) => {
    // The opt-in gate: skipped entirely (no ESI call at all) unless the
    // pilot has turned monitoring on, matching `corpContextFor`'s "err
    // toward not calling the endpoint" precedent above.
    if (!(await currentSpExtractionEnabled())) return null;
    const result = await loadCharacterSkillsWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const thresholdSp = await currentSpExtractionThresholdSp();
    // Exactly one entry — see SpExtractionSnapshot's doc comment for why it's
    // an array at all.
    return [{ totalSp: result.cached.data.total_sp, thresholdSp }];
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});

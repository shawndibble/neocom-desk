import { loadCharacterDenStates } from '@/features/character/mercenaryDens';
import { loadPlanetName } from '@/features/pi/names';
import { projectMercenaryDens } from '@/engine/projection';
import type {
  DenEntrySnapshot,
  DenSnapshot,
  MercenaryDenAnarchyFire,
  MercenaryDenReinforcedFire,
} from '@/engine/notificationDiffs';
import type { PlanetNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds, resolveProjectionNames } from './shared';

/* Mercenary Dens ------------------------------------------------------------- */

const isDenEntrySnapshot = shapeGuard<DenEntrySnapshot>({
  denId: is.number,
  planetId: is.number,
  reinforcedUntilMs: is.nullable(is.number),
  anarchyAmount: is.nullable(is.number),
  anarchyLevel: is.nullable(is.number),
  leadMs: is.number,
  anarchyPct: is.number,
});

/**
 * A Character's dens through the Overview widget's own cached reads, so the
 * poll adds no request beyond that read's cache window. A Character the
 * server cannot read (reauth or failure) skips the poll (`null`) instead of
 * writing an empty baseline that would announce every den as new.
 */
export const mercenaryDensDomain = defineDomain<
  DenEntrySnapshot,
  DenSnapshot,
  MercenaryDenReinforcedFire | MercenaryDenAnarchyFire,
  PlanetNames
>({
  source: SNAPSHOT_SOURCES.mercenaryDens,
  stateKey: 'notifications.pollerState.mercenaryDens',
  entriesKey: 'entries',
  isEntry: isDenEntrySnapshot,
  load: async (characterId) => {
    const read = await loadCharacterDenStates(characterId);
    if (read.status !== 'read') return null;
    const thresholds = await currentThresholds(characterId);
    return read.dens.map((den) => ({
      ...den,
      leadMs: thresholds.mercenaryDenReinforcedLeadHours * HOUR_MS,
      anarchyPct: thresholds.mercenaryDenAnarchyPercent,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // As in the colony domain: the baseline keeps the lead time the diff needs,
  // while the Projection reads the current one so a Settings change rebuilt
  // from that baseline projects the new warning time.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const leadMs = (await currentThresholds(characterId)).mercenaryDenReinforcedLeadHours * HOUR_MS;
    const entries = snapshot.entries.map((entry) => ({ ...entry, leadMs }));
    const planetNames = await resolveProjectionNames(
      entries.filter((entry) => entry.reinforcedUntilMs !== null).map((entry) => entry.planetId),
      loadPlanetName
    );
    return projectMercenaryDens(
      characterId,
      characterName,
      entries,
      planetNames,
      NOTIFICATION_EVENT_ENTRIES.mercenaryDenReinforced.projection.push,
      nowMs
    );
  },
  names: async (fire) => ({ planet: (await loadPlanetName(fire.planetId)) ?? undefined }),
});

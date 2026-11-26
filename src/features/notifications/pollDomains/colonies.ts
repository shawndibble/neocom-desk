import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { loadPlanetName } from '@/features/pi/names';
import { extractorProgramsFromPins } from '@/engine/pi/colonyPins';
import { projectColonies } from '@/engine/projection';
import {
  disprovenExtractorOccurrences,
  type ColonyExtractorSnapshot,
  type ColonySnapshotEntry,
  type ExtractorExpiringFire,
  type PlanetaryNotificationFire,
  type PlanetarySnapshot,
} from '@/engine/notificationDiffs';
import type { PlanetNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds, resolveProjectionNames } from './shared';

const isExtractorSnapshot = shapeGuard<ColonyExtractorSnapshot>({
  pinId: is.number,
  expiryTimeMs: is.number,
  thresholdMs: is.number,
  installTimeMs: is.optional(is.number),
});

const isColonySnapshotEntry = shapeGuard<ColonySnapshotEntry>({
  planetId: is.number,
  extractors: is.arrayOf(isExtractorSnapshot),
});

export const colonyDomain = defineDomain<
  ColonySnapshotEntry,
  PlanetarySnapshot,
  PlanetaryNotificationFire | ExtractorExpiringFire,
  PlanetNames
>({
  source: SNAPSHOT_SOURCES.colonies,
  stateKey: 'notifications.pollerState.colonies',
  entriesKey: 'colonies',
  isEntry: isColonySnapshotEntry,
  load: async (characterId) => {
    const planetsResult = await loadCharacterPlanets(characterId);
    if (planetsResult.needsReauth || planetsResult.cached === null) return null;
    const planets = planetsResult.cached.data;
    const details = await loadAllColonyDetails(
      characterId,
      planets.map((p) => p.planet_id)
    );
    const thresholds = await currentThresholds(characterId);
    const thresholdMs = thresholds.extractorExpiringLeadHours * HOUR_MS;
    const colonies: ColonySnapshotEntry[] = [];
    for (const planet of planets) {
      const detail = details.get(planet.planet_id);
      if (!detail || detail.needsReauth || detail.cached === null) continue;
      const programs = extractorProgramsFromPins(detail.cached.data.pins);
      colonies.push({
        planetId: planet.planet_id,
        extractors: programs.map((p) => ({
          pinId: p.pinId,
          expiryTimeMs: p.expiryTimeMs,
          thresholdMs,
          ...(p.installTimeMs !== undefined ? { installTimeMs: p.installTimeMs } : {}),
        })),
      });
    }
    return colonies;
  },
  toSnapshot: (colonies, nowMs) => ({ colonies: [...colonies], nowMs }),
  disproven: disprovenExtractorOccurrences,
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const thresholdMs = (await currentThresholds(characterId)).extractorExpiringLeadHours * HOUR_MS;
    const colonies = snapshot.colonies.map((colony) => ({
      ...colony,
      extractors: colony.extractors.map((extractor) => ({ ...extractor, thresholdMs })),
    }));
    const planetNames = await resolveProjectionNames(
      colonies.map((colony) => colony.planetId),
      loadPlanetName
    );
    return projectColonies(
      characterId,
      characterName,
      colonies,
      planetNames,
      (fire, character, names) =>
        fire.eventId === 'planetaryExtractionDone'
          ? NOTIFICATION_EVENT_ENTRIES.planetaryExtractionDone.projection.push(
              fire,
              character,
              names
            )
          : NOTIFICATION_EVENT_ENTRIES.planetaryExtractorExpiring.projection.push(
              fire,
              character,
              names
            ),
      nowMs
    );
  },
  names: async (fire) => ({ planet: (await loadPlanetName(fire.planetId)) ?? undefined }),
});

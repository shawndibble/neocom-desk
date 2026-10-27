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

/* Planetary colonies --------------------------------------------------------- */

const isExtractorSnapshot = shapeGuard<ColonyExtractorSnapshot>({
  pinId: is.number,
  expiryTimeMs: is.number,
  thresholdMs: is.number,
  // Optional in storage as well as on the wire: every snapshot written before
  // `disprovenExtractorOccurrences` needed `install_time` lacks the field,
  // and those must stay readable rather than being discarded as a stale shape
  // on the first poll after an update.
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
          // Carried only for `disprovenExtractorOccurrences`; no warning
          // reads it (ADR 0005). Omitted rather than defaulted when ESI left
          // it out, since a default would be evidence this does not have.
        })),
      });
    }
    return colonies;
  },
  toSnapshot: (colonies, nowMs) => ({ colonies: [...colonies], nowMs }),
  disproven: disprovenExtractorOccurrences,
  // The baseline's baked-in `thresholdMs` stays as the diff needs it (the
  // setting in force at load time); the Projection instead uses the current
  // lead time, so a Settings change rebuilt from that baseline (issue #1248,
  // `projectionRebuild.ts`) projects the new warning time, not the old one.
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

import { colonyStatus } from '../pi/colonyStatus';

export interface ColonyExtractorSnapshot {
  pinId: number;
  expiryTimeMs: number;
  thresholdMs: number;
  installTimeMs?: number;
}

export interface ColonySnapshotEntry {
  planetId: number;
  extractors: readonly ColonyExtractorSnapshot[];
}

export interface PlanetarySnapshot {
  colonies: readonly ColonySnapshotEntry[];
  nowMs: number;
}

export interface PlanetaryNotificationFire {
  eventId: 'planetaryExtractionDone';
  characterId: number;
  planetId: number;
  expiryTimeMs: number;
}

function colonyIdle(entry: ColonySnapshotEntry, nowMs: number): boolean {
  return colonyStatus(
    entry.extractors.map((e) => ({ pinId: e.pinId, expiryTimeMs: e.expiryTimeMs })),
    nowMs
  ).idle;
}

export function diffPlanetaryExtractionDone(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): PlanetaryNotificationFire[] {
  const prevByPlanet = new Map((prev?.colonies ?? []).map((c) => [c.planetId, c]));
  const fires: PlanetaryNotificationFire[] = [];
  for (const colony of next.colonies) {
    if (!colonyIdle(colony, next.nowMs)) continue;
    const prevColony = prevByPlanet.get(colony.planetId);
    if (prev && prevColony && colonyIdle(prevColony, prev.nowMs)) continue;
    fires.push({
      eventId: 'planetaryExtractionDone',
      characterId,
      planetId: colony.planetId,
      expiryTimeMs: Math.min(...colony.extractors.map((e) => e.expiryTimeMs)),
    });
  }
  return fires;
}

function extractorExpiringFire(
  characterId: number,
  planetId: number,
  pinId: number,
  thresholdMs: number,
  expiryTimeMs: number
): ExtractorExpiringFire {
  return {
    eventId: 'planetaryExtractorExpiring',
    characterId,
    planetId,
    pinId,
    thresholdMs,
    expiryTimeMs,
  };
}

export interface ExtractorExpiringFire {
  eventId: 'planetaryExtractorExpiring';
  characterId: number;
  planetId: number;
  pinId: number;
  thresholdMs: number;
  expiryTimeMs: number;
}

export function diffPlanetaryExtractorExpiring(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): ExtractorExpiringFire[] {
  if (!prev) return [];
  const prevByPlanet = new Map(prev.colonies.map((c) => [c.planetId, c]));
  const fires: ExtractorExpiringFire[] = [];
  for (const colony of next.colonies) {
    const prevColony = prevByPlanet.get(colony.planetId);
    const prevByPin = new Map((prevColony?.extractors ?? []).map((e) => [e.pinId, e]));
    for (const extractor of colony.extractors) {
      if (extractor.expiryTimeMs <= next.nowMs) continue;
      if (extractor.expiryTimeMs - next.nowMs > extractor.thresholdMs) continue;
      const prevExtractor = prevByPin.get(extractor.pinId);
      const observedBefore =
        prevExtractor !== undefined && prevExtractor.expiryTimeMs === extractor.expiryTimeMs;
      if (observedBefore && extractor.expiryTimeMs - prev.nowMs <= prevExtractor.thresholdMs) {
        continue;
      }
      fires.push(
        extractorExpiringFire(
          characterId,
          colony.planetId,
          extractor.pinId,
          extractor.thresholdMs,
          extractor.expiryTimeMs
        )
      );
    }
  }
  return fires;
}

export function disprovenExtractorOccurrences(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): (ExtractorExpiringFire | PlanetaryNotificationFire)[] {
  if (!prev) return [];
  const nextByPlanet = new Map(next.colonies.map((c) => [c.planetId, c]));
  const fires: (ExtractorExpiringFire | PlanetaryNotificationFire)[] = [];

  for (const prevColony of prev.colonies) {
    if (prevColony.extractors.length === 0) continue;
    const nextColony = nextByPlanet.get(prevColony.planetId);
    if (!nextColony) continue;
    const nextByPin = new Map(nextColony.extractors.map((e) => [e.pinId, e]));

    const replacedBefore = (program: ColonyExtractorSnapshot, firedAtMs: number): boolean => {
      const replacement = nextByPin.get(program.pinId);
      if (!replacement || replacement.installTimeMs === undefined) return false;
      if (replacement.expiryTimeMs === program.expiryTimeMs) return false;
      return replacement.installTimeMs < firedAtMs;
    };

    for (const program of prevColony.extractors) {
      if (!replacedBefore(program, program.expiryTimeMs - program.thresholdMs)) continue;
      fires.push(
        extractorExpiringFire(
          characterId,
          prevColony.planetId,
          program.pinId,
          program.thresholdMs,
          program.expiryTimeMs
        )
      );
    }

    const soonestExpiryMs = Math.min(...prevColony.extractors.map((e) => e.expiryTimeMs));
    const atSoonest = prevColony.extractors.filter((e) => e.expiryTimeMs === soonestExpiryMs);
    if (atSoonest.every((program) => replacedBefore(program, soonestExpiryMs))) {
      fires.push({
        eventId: 'planetaryExtractionDone',
        characterId,
        planetId: prevColony.planetId,
        expiryTimeMs: soonestExpiryMs,
      });
    }
  }
  return fires;
}

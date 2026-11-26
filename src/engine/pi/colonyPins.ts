import type { PlanetPin } from '@/esi/endpoints';
import type { ColonyStatus, ExtractorProgram, PinCounts, PinLoad } from '@/engine/pi/types';
import type { PiData, PiPinKind } from '@/sde/types';
import { colonyStatus } from '@/engine/pi/colonyStatus';
import { pinsLoad } from '@/engine/pi/pinBudget';
import { linksLoad, newLinkLoad, type LinkGeometry } from '@/engine/pi/linkCost';
import type { PlanetLink } from '@/esi/endpoints';
import { parseInstant } from '../esiInstant';

export type PinRole = 'extractor' | 'factory' | 'other';

export function pinRole(pin: PlanetPin): PinRole {
  if (pin.extractor_details) return 'extractor';
  if (pin.factory_details || pin.schematic_id !== undefined) return 'factory';
  return 'other';
}

export function factorySchematicId(pin: PlanetPin): number | undefined {
  return pin.factory_details?.schematic_id ?? pin.schematic_id;
}

export function extractorExpiryMs(pin: PlanetPin): number | null {
  if (!pin.extractor_details || !pin.expiry_time) return null;
  return parseInstant(pin.expiry_time);
}

export function extractorInstallMs(pin: PlanetPin): number | null {
  if (!pin.install_time) return null;
  return parseInstant(pin.install_time);
}

export function extractorProgramsFromPins(pins: readonly PlanetPin[]): ExtractorProgram[] {
  const programs: ExtractorProgram[] = [];
  for (const pin of pins) {
    const expiryTimeMs = extractorExpiryMs(pin);
    if (expiryTimeMs === null) continue;
    const installTimeMs = extractorInstallMs(pin);
    const details = pin.extractor_details;
    programs.push({
      pinId: pin.pin_id,
      expiryTimeMs,
      ...(installTimeMs !== null ? { installTimeMs } : {}),
      ...(details?.qty_per_cycle !== undefined ? { qtyPerCycle: details.qty_per_cycle } : {}),
      ...(details?.cycle_time !== undefined ? { cycleTimeMs: details.cycle_time * 1000 } : {}),
    });
  }
  return programs;
}

export interface FactoryPinGroup {
  schematicId: number | undefined;
  count: number;
}

export function groupFactoryPins(pins: readonly PlanetPin[]): FactoryPinGroup[] {
  const order: (number | undefined)[] = [];
  const counts = new Map<number | undefined, number>();
  for (const pin of pins) {
    if (pinRole(pin) !== 'factory') continue;
    const schematicId = factorySchematicId(pin);
    if (!counts.has(schematicId)) order.push(schematicId);
    counts.set(schematicId, (counts.get(schematicId) ?? 0) + 1);
  }
  return order.map((schematicId) => ({ schematicId, count: counts.get(schematicId) ?? 0 }));
}

export function hasUnverifiedExtractors(pins: readonly PlanetPin[]): boolean {
  return pins.some((pin) => pinRole(pin) === 'extractor' && extractorExpiryMs(pin) === null);
}

export interface ColonyPinLoad {
  counts: PinCounts;
  extractorHeads: number;
  load: PinLoad;
  linkLoad: PinLoad | null;
  newLinkLoad: PinLoad | null;
  linkCount: number;
  unknownTypeIds: number[];
}

export function colonyPinLoad(
  pins: readonly PlanetPin[],
  pi: PiData,
  links: readonly PlanetLink[] = [],
  planetRadiusKm: number | null = null
): ColonyPinLoad {
  const counts: Partial<Record<PiPinKind, number>> = {};
  const unknownTypeIds: number[] = [];
  const commandCenters = new Set(pi.infrastructure.commandCenterTypeIds);
  let extractorHeads = 0;

  for (const pin of pins) {
    const kind = pi.infrastructure.pinKindByTypeId[String(pin.type_id)];
    if (!kind) {
      if (!commandCenters.has(pin.type_id) && !unknownTypeIds.includes(pin.type_id)) {
        unknownTypeIds.push(pin.type_id);
      }
      continue;
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (kind === 'extractorControlUnit') {
      extractorHeads += pin.extractor_details?.heads.length ?? 0;
    }
  }

  const pinLoad = pinsLoad(counts, pi.infrastructure, { extractorHeads });

  const pinById = new Map(pins.map((pin) => [pin.pin_id, pin]));
  const geometry: LinkGeometry[] = [];
  for (const link of links) {
    const a = pinById.get(link.source_pin_id);
    const b = pinById.get(link.destination_pin_id);
    if (!a || !b) continue;
    geometry.push({
      a: { latitude: a.latitude, longitude: a.longitude },
      b: { latitude: b.latitude, longitude: b.longitude },
      level: link.link_level,
    });
  }

  const linkLoad =
    planetRadiusKm !== null && planetRadiusKm > 0
      ? linksLoad(geometry, planetRadiusKm, pi.infrastructure.link)
      : null;

  const newLink =
    planetRadiusKm !== null ? newLinkLoad(geometry, planetRadiusKm, pi.infrastructure.link) : null;

  return {
    counts,
    extractorHeads,
    load: linkLoad
      ? { cpu: pinLoad.cpu + linkLoad.cpu, powergrid: pinLoad.powergrid + linkLoad.powergrid }
      : pinLoad,
    linkLoad,
    newLinkLoad: newLink,
    linkCount: links.length,
    unknownTypeIds,
  };
}

export function colonyStatusFromPins(pins: readonly PlanetPin[], nowMs: number): ColonyStatus {
  return colonyStatus(extractorProgramsFromPins(pins), nowMs);
}

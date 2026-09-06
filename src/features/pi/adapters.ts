/**
 * ESI `pins[]` -> engine `ExtractorProgram[]`. Impure-adjacent glue kept out
 * of `engine/pi` (docs/ARCHITECTURE.md's engine/feature split): a pin missing
 * a trustworthy `expiry_time`, or without `extractor_details` at all, is
 * excluded from the colony-health math rather than given a substitute value
 * — the route still lists it in the pin table with an "unavailable" state.
 */
import type { PlanetPin } from '@/esi/endpoints';
import type { ExtractorProgram, PinCounts, PinLoad } from '@/engine/pi/types';
import type { PiData, PiPinKind } from '@/sde/types';
import { pinsLoad } from '@/engine/pi/pinBudget';
import { linksLoad, newLinkLoad, type LinkGeometry } from '@/engine/pi/linkCost';
import type { PlanetLink } from '@/esi/endpoints';

export type PinRole = 'extractor' | 'factory' | 'other';

export function pinRole(pin: PlanetPin): PinRole {
  if (pin.extractor_details) return 'extractor';
  if (pin.factory_details || pin.schematic_id !== undefined) return 'factory';
  return 'other';
}

/**
 * A factory pin's assigned schematic, wherever ESI put it: nested under
 * `factory_details.schematic_id` (the documented shape) or on the pin's own
 * top-level `schematic_id` (what live ESI actually sends — observed on a
 * mid-cycle Industry Facility with no `factory_details` object at all).
 * Undefined for anything that isn't a factory pin.
 */
export function factorySchematicId(pin: PlanetPin): number | undefined {
  return pin.factory_details?.schematic_id ?? pin.schematic_id;
}

/**
 * Parsed `expiry_time` in ms for an extractor pin, or null when the pin
 * isn't an extractor or its `expiry_time` is missing/unparseable (both
 * spec-legal — see the module header). The one place this parse happens;
 * every caller that needs an extractor's expiry goes through this.
 */
export function extractorExpiryMs(pin: PlanetPin): number | null {
  if (!pin.extractor_details || !pin.expiry_time) return null;
  const ms = Date.parse(pin.expiry_time);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Parsed `install_time` in ms, or null when it is missing or unparseable —
 * same guard as `extractorExpiryMs`, since ESI marks `install_time` optional
 * too.
 */
export function extractorInstallMs(pin: PlanetPin): number | null {
  if (!pin.install_time) return null;
  const ms = Date.parse(pin.install_time);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Extractor pins with a parseable expiry_time; everything else is dropped.
 *
 * The yield baseline (`qtyPerCycle`, `cycleTimeMs`, `installTimeMs`, fed to
 * `engine/pi/extraction.ts`) is filled in when ESI supplied it and left
 * undefined otherwise — those three fields are all spec-optional, so requiring
 * them would start dropping pins this function used to keep and silently
 * shrink the colony-health input. `hasYieldBaseline` is how a caller checks
 * whether a program can be projected.
 */
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
  /** `undefined` groups every factory pin whose schematic couldn't be resolved. */
  schematicId: number | undefined;
  count: number;
}

/**
 * Factory pins collapsed to one entry per distinct schematic, in the order
 * each schematic first appears, for the production card's "N facilities
 * running" rows. Filters on `pinRole` rather than `factorySchematicId`
 * alone, so a pin `pinRole` calls an extractor (it has `extractor_details`)
 * never turns up here even if it also carries a stray top-level
 * `schematic_id` — the two functions must agree on what counts as a factory.
 */
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

/**
 * True when the colony has an extractor pin whose program data is
 * incomplete (missing/unparseable `expiry_time`) — `extractorProgramsFromPins`
 * silently drops that pin, so a colony health status computed from its
 * output alone could read "healthy" while an unverifiable extractor sits on
 * the ground. Callers use this to fall back to an "unknown" status instead
 * of a confident one, matching the ticket's "never show a confident wrong
 * number" rule.
 */
export function hasUnverifiedExtractors(pins: readonly PlanetPin[]): boolean {
  return pins.some((pin) => pinRole(pin) === 'extractor' && extractorExpiryMs(pin) === null);
}

export interface ColonyPinLoad {
  /** Pins by kind, ready for `engine/pi/pinBudget`. */
  counts: PinCounts;
  /** Extractor heads across the whole colony, counted one by one. */
  extractorHeads: number;
  /**
   * What the colony draws right now. Understated by whatever
   * `unknownTypeIds` holds, so a caller showing it as a measured figure must
   * check that list is empty first.
   */
  load: PinLoad;
  /**
   * What this colony's links draw, or null when the planet's radius did not
   * resolve — a link's cost is distance-based, and there is no honest figure
   * without it. Null means the totals below are incomplete, and a caller
   * showing headroom must say so rather than treat links as free (#440).
   */
  linkLoad: PinLoad | null;
  /**
   * What a link this colony has **not built yet** would cost: its own longest
   * existing hop, priced at link level 0. See `engine/pi/linkCost.ts`'s
   * `newLinkLoad` for why the longest rather than the average, and why level 0.
   *
   * A pin that does not exist has no place on the planet, so the distance term
   * cannot be computed for it; but it will need a link all the same, and
   * quoting it at its unlinked price promises room that is not there. A
   * planet's links are the one cost that varies by two orders of magnitude
   * between colonies, so a shared constant would be worse than useless.
   *
   * Null on a colony with no priceable link, which is not the same as a colony
   * whose links are free: there is simply nothing to measure, and a caller
   * must say "unpriced" rather than charge zero.
   */
  newLinkLoad: PinLoad | null;
  /** How many links the colony has, whether or not they could be costed. */
  linkCount: number;
  /**
   * Pin typeIDs the payload names no kind for, in the order seen, deduped.
   * Command Centers are excluded — every colony has one, it supplies the
   * budget and draws nothing from it, so listing it here would fire "the
   * meter understates this colony" on every colony and bury the real signal.
   * Anything that does land here means the snapshot is behind the game and
   * the meter is missing a real cost.
   */
  unknownTypeIds: number[];
}

/**
 * A live colony's own CPU/Powergrid draw, read off the pins ESI reports.
 *
 * This is the measured path, and it deliberately does not go anywhere near
 * `chainBlockPins`: that function derives an extractor count from a chain's
 * demand and one assumed yield rate, which is the right answer for a colony
 * that does not exist yet and the wrong one for a colony you can just read.
 * Here the pins are a fact, and so is each extractor's own head count —
 * `extractor_details.heads` is per-pin, so a colony with a ten-head and a
 * three-head extractor is charged for thirteen heads rather than for some
 * average of them.
 */
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

  // Links are priced from the geometry ESI already reports — each pin's own
  // latitude/longitude — against the planet's radius. A link whose endpoints
  // are not both in the pin list is skipped rather than guessed at.
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

  // Over the links that could actually be priced, never over `links.length`: a
  // link whose far end is not in the pin list has no geometry, so it is not a
  // hop this colony can be measured by.
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

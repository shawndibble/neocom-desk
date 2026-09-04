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
   * Pin typeIDs the payload names no kind for, in the order seen. A Command
   * Center is always here and is not a problem — it supplies the budget and
   * draws nothing from it. Anything else means the snapshot is behind the
   * game and the meter is missing a real cost.
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
export function colonyPinLoad(pins: readonly PlanetPin[], pi: PiData): ColonyPinLoad {
  const counts: Partial<Record<PiPinKind, number>> = {};
  const unknownTypeIds: number[] = [];
  let extractorHeads = 0;

  for (const pin of pins) {
    const kind = pi.infrastructure.pinKindByTypeId[String(pin.type_id)];
    if (!kind) {
      if (!unknownTypeIds.includes(pin.type_id)) unknownTypeIds.push(pin.type_id);
      continue;
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (kind === 'extractorControlUnit') {
      extractorHeads += pin.extractor_details?.heads.length ?? 0;
    }
  }

  return {
    counts,
    extractorHeads,
    load: pinsLoad(counts, pi.infrastructure, { extractorHeads }),
    unknownTypeIds,
  };
}

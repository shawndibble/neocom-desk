/**
 * ESI `pins[]` -> engine `ExtractorProgram[]`. Impure-adjacent glue kept out
 * of `engine/pi` (docs/ARCHITECTURE.md's engine/feature split): a pin missing
 * a trustworthy `expiry_time`, or without `extractor_details` at all, is
 * excluded from the colony-health math rather than given a substitute value
 * — the route still lists it in the pin table with an "unavailable" state.
 */
import type { PlanetPin } from '@/esi/endpoints';
import type { ExtractorProgram } from '@/engine/pi/types';

export type PinRole = 'extractor' | 'factory' | 'other';

export function pinRole(pin: PlanetPin): PinRole {
  if (pin.extractor_details) return 'extractor';
  if (pin.factory_details) return 'factory';
  return 'other';
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

/** Extractor pins with a parseable expiry_time; everything else is dropped. */
export function extractorProgramsFromPins(pins: readonly PlanetPin[]): ExtractorProgram[] {
  const programs: ExtractorProgram[] = [];
  for (const pin of pins) {
    const expiryTimeMs = extractorExpiryMs(pin);
    if (expiryTimeMs !== null) programs.push({ pinId: pin.pin_id, expiryTimeMs });
  }
  return programs;
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

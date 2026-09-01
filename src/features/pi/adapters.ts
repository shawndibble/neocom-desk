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

/** Extractor pins with a parseable expiry_time; everything else is dropped. */
export function extractorProgramsFromPins(pins: readonly PlanetPin[]): ExtractorProgram[] {
  const programs: ExtractorProgram[] = [];
  for (const pin of pins) {
    if (!pin.extractor_details || !pin.expiry_time) continue;
    const expiryTimeMs = Date.parse(pin.expiry_time);
    if (Number.isNaN(expiryTimeMs)) continue;
    programs.push({ pinId: pin.pin_id, expiryTimeMs });
  }
  return programs;
}

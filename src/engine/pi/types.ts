/**
 * Engine-native PI shapes. Only the fields the colony-health calculation
 * needs: an extractor program's expiry, the one field ESI keeps current
 * without the colony being opened in the client
 * (https://developers.eveonline.com/docs/guides/pi/). Adapted from the ESI
 * `pins[]` shape at the feature boundary (`features/pi/adapters.ts`), same
 * convention as `engine/industry/types.ts`.
 */

export interface ExtractorProgram {
  pinId: number;
  expiryTimeMs: number;
}

export type ExtractorState = 'active' | 'expiring-soon' | 'expired';

export interface ColonyStatus {
  /** True when any extractor program has already expired. */
  idle: boolean;
  /** Soonest expiry across the colony's extractor programs; null when it has none. */
  soonestExpiryMs: number | null;
}

export type ColonyAttention = 'idle' | 'expiring-soon' | 'healthy';

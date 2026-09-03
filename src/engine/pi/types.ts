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
  /**
   * Install-time baseline for the yield curve (`engine/pi/extraction.ts`).
   * Optional because ESI marks every one of `qty_per_cycle`, `cycle_time` and
   * `install_time` optional — a pin with a trustworthy `expiry_time` but no
   * quantity still counts for colony health, it just can't be projected.
   * `hasYieldBaseline` narrows a program to `ExtractorYieldProgram` when all
   * three are present and usable.
   */
  qtyPerCycle?: number;
  cycleTimeMs?: number;
  installTimeMs?: number;
}

/** An `ExtractorProgram` whose install-time baseline is complete enough to project. */
export interface ExtractorYieldProgram extends ExtractorProgram {
  qtyPerCycle: number;
  cycleTimeMs: number;
  installTimeMs: number;
}

export type ExtractorState = 'active' | 'expiring-soon' | 'expired';

export interface ColonyStatus {
  /** True when any extractor program has already expired. */
  idle: boolean;
  /** Soonest expiry across the colony's extractor programs; null when it has none. */
  soonestExpiryMs: number | null;
  /**
   * True when every projectable program is past `EFFICIENT_WINDOW_FRACTION` of
   * its own peak. Absent — not `false` — when no program carries a yield
   * baseline: decay is then unknowable rather than absent, the same
   * distinction the optional baseline fields above draw. `colonyAttention`
   * reads `decayed === true`, so an absent flag stays `healthy` instead of
   * inventing a confident answer.
   */
  decayed?: boolean;
}

export type ColonyAttention = 'idle' | 'expiring-soon' | 'decayed' | 'healthy';

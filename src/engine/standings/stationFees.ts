/**
 * What standing buys at an NPC station: a cheaper reprocessing tax and a
 * cheaper broker fee. Sources:
 * docs/design/mockups/npc-standings/research-reprocessing-tax.md.
 */
import { brokerFeePct } from '@/engine/industry/fees';

/**
 * The station take (percent of the refined value) at 5,091 of the 5,210 NPC
 * stations; 119 take 2.5. For a station whose own take the app does not hold.
 */
export const DEFAULT_STATION_TAKE_PCT = 5;

/** Each point of standing takes this share off the take. Linear is inferred, not CCP-published (MEDIUM). */
const TAKE_REDUCTION_PER_STANDING = 0.15;

/** The standing at which the tax reaches zero (6.67). */
export const ZERO_REPROCESSING_TAX_STANDING = 1 / TAKE_REDUCTION_PER_STANDING;

/**
 * Reprocessing tax, percent: `take * max(0, 1 - standing / 6.6667)`. `standing`
 * is the station-owner corporation's effective standing. A negative standing
 * pays the plain take: no surcharge is documented, so none is invented.
 */
export function reprocessingTaxPct(stationTakePct: number, standing: number): number {
  const share = 1 - TAKE_REDUCTION_PER_STANDING * Math.max(0, standing);
  return stationTakePct * Math.max(0, share);
}

export interface BrokerFeeComparison {
  atZeroPct: number;
  atYoursPct: number;
  /** `atZeroPct - atYoursPct`: percentage points saved, negative when standing makes it dearer. */
  savingPct: number;
}

/** The broker fee at zero standing against at yours; both are BASE standings, never lifted by skills. */
export function brokerFeeComparison(
  brokerRelationsLevel: number,
  baseFactionStanding: number,
  baseCorpStanding: number
): BrokerFeeComparison {
  const atZeroPct = brokerFeePct(brokerRelationsLevel, 0, 0);
  const atYoursPct = brokerFeePct(brokerRelationsLevel, baseFactionStanding, baseCorpStanding);
  return { atZeroPct, atYoursPct, savingPct: atZeroPct - atYoursPct };
}

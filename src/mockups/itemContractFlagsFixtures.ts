/**
 * Sample rows for the Items board flags mockup (issue #4773). A mockup draws,
 * it does not fetch: the rows, hub prices and places below are read directly.
 */
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';

export const DAMAGE_CONTROL_II = 2048;
export const DAMAGE_CONTROL_II_BLUEPRINT = 2049;

/** Jita best sell, the searched line's hub price. */
export const HUB_SELL: Readonly<Record<number, number>> = { [DAMAGE_CONTROL_II]: 412_000 };

/** What the original (BPO) of the searched blueprint trades for at the hub. */
export const ORIGINAL_HUB_PRICE = 6_800_000;

/** The pilot's Market hub, named in the flag sentences. */
export const HUB_NAME = 'Jita';

/** Market Browser's `SELL_OUTLIER_FACTOR`, and the proposed default. */
export const DEFAULT_MULTIPLE = 10;

export const TYPE_NAMES: ReadonlyMap<number, string> = new Map([
  [DAMAGE_CONTROL_II, 'Damage Control II'],
  [DAMAGE_CONTROL_II_BLUEPRINT, 'Damage Control II Blueprint'],
]);

export const REGION_NAMES: ReadonlyMap<number, string> = new Map([
  [10000002, 'The Forge'],
  [10000043, 'Domain'],
  [10000032, 'Sinq Laison'],
  [10000030, 'Heimatar'],
  [10000042, 'Metropolis'],
]);

const STATIONS = {
  jita: 60003760,
  amarr: 60008494,
  dodixie: 60011866,
  rens: 60004588,
  hek: 60005686,
} as const;

export const OFFER_LOCATIONS: ReadonlyMap<number, OfferLocation> = new Map([
  [STATIONS.jita, { systemId: 30000142, systemName: 'Jita', security: 0.95 }],
  [STATIONS.amarr, { systemId: 30002187, systemName: 'Amarr', security: 1 }],
  [STATIONS.dodixie, { systemId: 30002659, systemName: 'Dodixie', security: 0.87 }],
  [STATIONS.rens, { systemId: 30002510, systemName: 'Rens', security: 0.9 }],
  [STATIONS.hek, { systemId: 30002053, systemName: 'Hek', security: 0.5 }],
]);

export const JUMPS_FROM_PILOT: ReadonlyMap<number, number> = new Map([
  [30000142, 1],
  [30002187, 12],
  [30002659, 16],
  [30002510, 20],
  [30002053, 16],
]);

const DAY_MS = 86_400_000;
const NOW = Date.now();

function offer(
  contractId: number,
  typeId: number,
  price: number,
  quantity: number,
  where: keyof typeof STATIONS,
  regionId: number,
  days: number,
  extra: Partial<PublicContractOfferRow> = {}
): PublicContractOfferRow {
  return {
    contractId,
    regionId,
    locationId: STATIONS[where],
    typeId,
    price,
    isAuction: false,
    quantity,
    dateExpired: NOW + days * DAY_MS,
    ...extra,
  };
}

/** The Items board searched for Damage Control II. */
export const ITEM_ROWS: readonly PublicContractOfferRow[] = [
  offer(191_000_001, DAMAGE_CONTROL_II, 389_000, 1, 'jita', 10000002, 6),
  offer(191_000_002, DAMAGE_CONTROL_II, 455_000, 1, 'jita', 10000002, 12),
  offer(191_000_003, DAMAGE_CONTROL_II, 6_200_000, 1, 'amarr', 10000043, 3),
  offer(191_000_004, DAMAGE_CONTROL_II, 1_290_000, 3, 'dodixie', 10000032, 9),
  offer(191_000_005, DAMAGE_CONTROL_II, 4_900_000, 1, 'rens', 10000030, 14),
  // The padded bundle: one Damage Control II among nine lines, the price pays for all of them.
  offer(191_000_006, DAMAGE_CONTROL_II, 4_100_000, 1, 'hek', 10000042, 5),
  offer(191_000_007, DAMAGE_CONTROL_II, 4_350_000, 10, 'jita', 10000002, 21),
];

/** The Items board searched for Damage Control II Blueprint: copies and an original. */
export const BLUEPRINT_ROWS: readonly PublicContractOfferRow[] = [
  offer(192_000_001, DAMAGE_CONTROL_II_BLUEPRINT, 1_150_000, 1, 'jita', 10000002, 8, {
    isBlueprintCopy: true,
    me: 10,
    te: 20,
    runs: 10,
  }),
  offer(192_000_002, DAMAGE_CONTROL_II_BLUEPRINT, 9_400_000, 1, 'amarr', 10000043, 4, {
    isBlueprintCopy: true,
    me: 2,
    te: 4,
    runs: 5,
  }),
  offer(192_000_003, DAMAGE_CONTROL_II_BLUEPRINT, 520_000, 1, 'dodixie', 10000032, 11, {
    isBlueprintCopy: true,
    me: 0,
    te: 0,
    runs: 2,
  }),
  offer(192_000_004, DAMAGE_CONTROL_II_BLUEPRINT, 6_450_000, 1, 'jita', 10000002, 17),
  offer(192_000_005, DAMAGE_CONTROL_II_BLUEPRINT, 12_900_000, 1, 'rens', 10000030, 7, {
    isBlueprintCopy: true,
    me: 8,
    te: 16,
    runs: 20,
  }),
];

/**
 * Lines per contract, as the snapshot's own rows tally them (one row per
 * contract and type: `distinctTypeCountByContract`). Absent means one line.
 */
export const LINE_COUNT: ReadonlyMap<number, number> = new Map([[191_000_006, 9]]);

/** What the other eight lines of the padded bundle come to at the hub, for its modal. */
export const BUNDLE_OTHER_VALUE = 46_200_000;

export type RowFlag =
  | { kind: 'overpriced'; multiple: number }
  | { kind: 'copy-above-original'; original: number }
  | null;

/**
 * Signals 1 and 2. A blueprint copy is held against the original's hub price,
 * anything else against the hub sell of every unit the contract carries. A
 * contract with other lines is never flagged on its row: its one price pays
 * for all of them, so the row alone cannot call it overpriced.
 */
export function flagFor(row: PublicContractOfferRow, threshold: number): RowFlag {
  if ((LINE_COUNT.get(row.contractId) ?? 1) > 1) return null;
  if (row.isBlueprintCopy) {
    return row.price > ORIGINAL_HUB_PRICE
      ? { kind: 'copy-above-original', original: ORIGINAL_HUB_PRICE }
      : null;
  }
  const hubSell = HUB_SELL[row.typeId];
  if (hubSell === undefined) return null;
  const multiple = row.price / (hubSell * row.quantity);
  return multiple >= threshold ? { kind: 'overpriced', multiple } : null;
}

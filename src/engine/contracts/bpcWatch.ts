/**
 * BPC Sourcing watches (issue #926): a pilot saves a search's filter and gets
 * told about a genuinely new or cheaper matching offer, independent of any
 * Character's own ESI state — unlike every entry in the fixed Notification
 * Event catalog (`features/notifications/events.ts`), which is always scoped
 * to one Character. This is deliberately its own standalone diff, not a
 * registry entry: `SKILL_QUEUE_NOTIFICATION_DIFFS`-style events all assume a
 * per-Character snapshot, and a saved search over the shared Public Contract
 * Offers snapshot has no Character to scope to.
 *
 * A BPC offer row has no identity of its own within one contract listing
 * several copies (`20260908-212747-a-bpc-offer-row-has-no-identity-of.md`),
 * but `contractId` alone is still the right re-fire key here: several rows
 * sharing one contract are the same real listing a buyer would act on once,
 * not several distinct offers.
 */
import {
  effectivePrice,
  filterBpcContracts,
  type BpcContractRow,
  type BpcSearchFilter,
} from './bpcSearch';

/** One watch's persisted baseline — what this watch has already told the pilot about. */
export interface BpcWatchState {
  /** Matching contract ids as of the last poll. Replaced wholesale each poll, not accumulated forever — a contract that rolls off and a different one later reusing the range is not this diff's problem to distinguish. */
  seenContractIds: readonly number[];
  /** The cheapest effective price ever observed matching this watch, or `null` if nothing has matched yet. */
  minPriceSeen: number | null;
}

export const EMPTY_BPC_WATCH_STATE: BpcWatchState = { seenContractIds: [], minPriceSeen: null };

export interface BpcWatchFire {
  contractId: number;
  typeId: number;
  /** Effective price (buyout for an auction, `effectivePrice`) — the number the notification quotes. */
  price: number;
  /** A contract not in the previous poll's baseline, vs. an already-seen one whose price beat the all-time low. */
  reason: 'new' | 'cheaper';
}

export interface BpcWatchDiffResult {
  /** At most one per poll — a burst of new/cheaper matches reports the single best one, not one row per match. */
  fire: BpcWatchFire | null;
  nextState: BpcWatchState;
}

/** The cheapest row of a non-empty set, as a fire's `contractId`/`typeId`/`price` fields — shared by both `diffBpcWatchMatches` branches below, which differ only in which row set and `reason` they report. */
function cheapestFire(rows: readonly BpcContractRow[]): Omit<BpcWatchFire, 'reason'> {
  const cheapest = rows.reduce((best, row) =>
    effectivePrice(row) < effectivePrice(best) ? row : best
  );
  return {
    contractId: cheapest.contractId,
    typeId: cheapest.typeId,
    price: effectivePrice(cheapest),
  };
}

/**
 * `prev === undefined` fires nothing, this codebase's rule throughout
 * (`engine/notificationDiffs.ts`) — a watch's first poll establishes a
 * baseline rather than flooding with every contract already on the market.
 */
export function diffBpcWatchMatches(
  filter: BpcSearchFilter,
  prev: BpcWatchState | undefined,
  rows: readonly BpcContractRow[]
): BpcWatchDiffResult {
  const matches = filterBpcContracts(rows, filter);
  const currentIds = matches.map((row) => row.contractId);
  const currentMin = matches.reduce<number | null>((min, row) => {
    const price = effectivePrice(row);
    return min === null || price < min ? price : min;
  }, null);

  if (!prev) {
    return { fire: null, nextState: { seenContractIds: currentIds, minPriceSeen: currentMin } };
  }

  const prevSeen = new Set(prev.seenContractIds);
  const newMatches = matches.filter((row) => !prevSeen.has(row.contractId));

  let fire: BpcWatchFire | null = null;
  if (newMatches.length > 0) {
    fire = { ...cheapestFire(newMatches), reason: 'new' };
  } else if (
    currentMin !== null &&
    (prev.minPriceSeen === null || currentMin < prev.minPriceSeen)
  ) {
    fire = { ...cheapestFire(matches), reason: 'cheaper' };
  }

  const minPriceSeen =
    currentMin === null ? prev.minPriceSeen : Math.min(prev.minPriceSeen ?? currentMin, currentMin);

  return { fire, nextState: { seenContractIds: currentIds, minPriceSeen } };
}

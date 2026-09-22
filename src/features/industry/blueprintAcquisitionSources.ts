/**
 * Every way to get one blueprint, shaped into the Blueprint Acquisition
 * modal's sections (issue #1240): Owned tiers, public Contracts (copies and
 * originals), Market sell orders, LP Store offers. Pure — the modal fetches,
 * this shapes, sorts cheapest first, and says what a pick writes.
 *
 * `contractOfferRows` and `marketSellRows` are deliberately modal-agnostic:
 * BPC Sourcing can list contract originals and market BPOs off the same two
 * functions.
 */
import {
  effectivePrice,
  filterBpcContracts,
  iskPerRun,
  type BpcContractRow,
} from '@/engine/contracts/bpcSearch';
import type { MaterialSourcing } from '@/engine/industry/types';
import type { RegionOrder } from '@/esi/endpoints';
import type { LpOfferMatch } from '@/features/market/appraisalLpAcquisition';

/** One public-contract listing of this blueprint — a copy or an original. */
export interface ContractOfferRow {
  kind: 'contract';
  contractId: number;
  regionId: number;
  locationId: number;
  me: number;
  te: number;
  /** A copy's runs per copy; `null` for an original (unlimited). */
  runs: number | null;
  /** Copies (or originals) the one listing bundles at its one price. */
  quantity: number;
  /** What a buyer pays: buyout for an auction that has one, else the ask. */
  price: number;
  /** An auction with no buyout: `price` is only its starting bid. */
  isStartingBid: boolean;
  isMultiType: boolean;
  /** Copies only; `null` for an original or an unknowable rate. */
  iskPerRun: number | null;
  /**
   * False for a multi-type bundle (price is the whole contract's) or a
   * zero-price barter (no price at all) — shown, never used to reseed a plan
   * (docs/context/decisions 20260915-093419, 20260915-102046).
   */
  pickable: boolean;
}

export interface ContractOfferRowsInput {
  copies: readonly BpcContractRow[];
  /** Originals, `runs: -1` (`bpoRowsFromContractOffers`). */
  originals: readonly BpcContractRow[];
  blueprintTypeID: number;
  /** `null` = every region. */
  regionId: number | null;
}

/** Any row a section lists. `pickable` false = shown, never picked. */
interface SectionRow {
  pickable: boolean;
  price: number;
}

/** Pickable first, then priced-but-unpickable, then no price at all; cheapest first within each. */
function sortRank(row: SectionRow): number {
  if (row.pickable) return 0;
  return row.price > 0 ? 1 : 2;
}

function byCheapest<T extends SectionRow>(rows: T[]): T[] {
  return rows.sort((a, b) => sortRank(a) - sortRank(b) || a.price - b.price);
}

/** The section's cheapest row a pilot can actually pick, or `null`. Rows must already be sorted by a builder here. */
export function cheapestRow<T extends SectionRow>(rows: readonly T[]): T | null {
  return rows.find((row) => row.pickable) ?? null;
}

/** This blueprint's public-contract listings in `regionId` (or everywhere), cheapest first. */
export function contractOfferRows(input: ContractOfferRowsInput): ContractOfferRow[] {
  const filter = { typeIds: new Set([input.blueprintTypeID]), regionId: input.regionId };
  const listed = [
    ...filterBpcContracts(input.copies, filter),
    ...filterBpcContracts(input.originals, filter),
  ];
  return byCheapest(
    listed.map((row): ContractOfferRow => {
      const price = effectivePrice(row);
      const isOriginal = row.runs === -1;
      return {
        kind: 'contract',
        contractId: row.contractId,
        regionId: row.regionId,
        locationId: row.locationId,
        me: row.me,
        te: row.te,
        runs: isOriginal ? null : row.runs,
        quantity: row.quantity,
        price,
        isStartingBid: row.isAuction && row.buyout === undefined,
        isMultiType: row.isMultiType,
        iskPerRun: isOriginal ? null : iskPerRun(price, row.runs, row.quantity, row.isMultiType),
        pickable: !row.isMultiType && price > 0,
      };
    })
  );
}

/**
 * One market sell order for this blueprint. Only a blueprint *original* is
 * ever a market item, and it always sells unresearched — hence the fixed
 * ME0/TE0. ESI does not say who the seller is, so an NPC-seeded order is not
 * told apart from a player's: this states price and station only.
 */
export interface MarketSellRow {
  kind: 'market';
  orderId: number;
  locationId: number;
  price: number;
  volumeRemain: number;
  /** At the Trade Hub's own station, rather than elsewhere in its region. */
  atHub: boolean;
  me: 0;
  te: 0;
  pickable: true;
}

/** Every sell order in one Order Book view (`loadOrderBookView`), cheapest first. */
export function marketSellRows(
  orders: readonly RegionOrder[],
  hubStationId: number
): MarketSellRow[] {
  return byCheapest(
    orders
      .filter((o) => !o.is_buy_order)
      .map((o): MarketSellRow => ({
        kind: 'market',
        orderId: o.order_id,
        locationId: o.location_id,
        price: o.price,
        volumeRemain: o.volume_remain,
        atHub: o.location_id === hubStationId,
        me: 0,
        te: 0,
        pickable: true,
      }))
  );
}

/**
 * Identical rows folded into one: `row` is the first member (so a builder's
 * cheapest-first order holds), `count` how many rows it stands for. Picking
 * the group is picking `row` — every member writes the same patch.
 */
export interface OfferGroup<T> {
  row: T;
  count: number;
}

/** Folds rows sharing `keyOf` into their first member, order kept; `merge` folds a later member in. */
function groupBy<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  merge: (into: T, next: T) => T = (into) => into
): OfferGroup<T>[] {
  const groups = new Map<string, OfferGroup<T>>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) {
      group.row = merge(group.row, row);
      group.count += 1;
    } else groups.set(key, { row, count: 1 });
  }
  return [...groups.values()];
}

/**
 * Contract listings that display and pick identically, one group each:
 * same kind and runs, tier, price, region and station, copies per listing, bid
 * state and bundle flag. A bundle never merges with a plain listing.
 */
export function groupContractOffers(
  rows: readonly ContractOfferRow[]
): OfferGroup<ContractOfferRow>[] {
  return groupBy(rows, (r) =>
    [
      r.runs ?? 'bpo',
      r.me,
      r.te,
      r.price,
      r.regionId,
      r.locationId,
      r.quantity,
      r.isStartingBid,
      r.isMultiType,
    ].join(':')
  );
}

/** Sell orders at one price and station, one group each; `volumeRemain` summed across them. */
export function groupMarketSells(rows: readonly MarketSellRow[]): OfferGroup<MarketSellRow>[] {
  return groupBy(
    rows,
    (r) => `${r.price}:${r.locationId}`,
    (into, next) => ({ ...into, volumeRemain: into.volumeRemain + next.volumeRemain })
  );
}

/** Most rows one modal section lists; BPC Sourcing (the Contracts link) shows the rest. */
export const SECTION_ROW_LIMIT = 10;

/**
 * What one modal section lists: unpickable rows (a bundle, a barter) are
 * dropped unless nothing in the section can be picked — then they are its
 * only rows. Then the first `limit`, so pass rows already grouped and sorted.
 * `total` is the count before the cap, for a "Showing 10 of N" note.
 */
export function sectionRows<T>(
  rows: readonly T[],
  isPickable: (row: T) => boolean,
  limit: number = SECTION_ROW_LIMIT
): { shown: T[]; total: number } {
  const pickable = rows.filter(isPickable);
  const listed = pickable.length > 0 ? pickable : [...rows];
  return { shown: listed.slice(0, limit), total: listed.length };
}

/**
 * What one LP Store redemption costs in ISK: its ISK cost plus its LP cost at
 * the pilot's own **LP Value** (ISK per LP). A zero rate — the default —
 * prices the ISK side alone. A negative or non-finite rate is treated as zero
 * rather than discounting the offer.
 */
export function lpPickPrice(iskCost: number, lpCost: number, iskPerLp: number): number {
  return iskCost + lpCost * usableRate(iskPerLp);
}

function usableRate(iskPerLp: number): number {
  return Number.isFinite(iskPerLp) && iskPerLp > 0 ? iskPerLp : 0;
}

/**
 * One LP Store offer that hands out this blueprint. ESI's offer carries no
 * ME/TE, and an LP Store copy is issued unresearched, so it is ME0/TE0.
 */
export interface LpOfferRow {
  kind: 'lp';
  corporationId: number;
  offerId: number;
  corpName: string;
  iskCost: number;
  lpCost: number;
  /** Copies one redemption hands over. */
  quantity: number;
  /** Turn-in items the offer also demands — not priced here. */
  requiredItemCount: number;
  /** `lpPickPrice` at the pilot's rate. */
  price: number;
  /** False when the rate is zero: `price` is the ISK cost only. */
  lpPriced: boolean;
  me: 0;
  te: 0;
  pickable: true;
}

export function lpOfferRows(matches: readonly LpOfferMatch[], iskPerLp: number): LpOfferRow[] {
  return byCheapest(
    matches.map((m): LpOfferRow => ({
      kind: 'lp',
      corporationId: m.corporationId,
      offerId: m.offer.offer_id,
      corpName: m.corpName,
      iskCost: m.offer.isk_cost,
      lpCost: m.offer.lp_cost,
      quantity: m.offer.quantity,
      requiredItemCount: m.offer.required_items.length,
      price: lpPickPrice(m.offer.isk_cost, m.offer.lp_cost, iskPerLp),
      lpPriced: usableRate(iskPerLp) > 0 && m.offer.lp_cost > 0,
      me: 0,
      te: 0,
      pickable: true,
    }))
  );
}

/** One owned copy, personal or corp — same shape `ownedCopiesFor` (recipes.ts) adapts to. */
export interface AcquisitionOwnedCopy {
  me: number;
  te: number;
  /** -1 = an original (BPO): unlimited runs. */
  runs: number;
}

/** One owned ME/TE tier — no price: owned stock is costed by the engine itself. */
export interface OwnedTierRow {
  kind: 'owned';
  me: number;
  te: number;
  /** Summed runs across every owned copy at this tier; `null` for a BPO (unlimited). */
  runs: number | null;
}

/** Groups owned copies into one row per distinct ME/TE tier, best tier first — display only, no cost math. */
export function ownedTierRows(copies: readonly AcquisitionOwnedCopy[]): OwnedTierRow[] {
  const byTier = new Map<string, OwnedTierRow>();
  for (const copy of copies) {
    const key = `${copy.me}:${copy.te}`;
    const existing = byTier.get(key);
    if (!existing) {
      byTier.set(key, {
        kind: 'owned',
        me: copy.me,
        te: copy.te,
        runs: copy.runs === -1 ? null : copy.runs,
      });
      continue;
    }
    if (existing.runs !== null && copy.runs !== -1) existing.runs += copy.runs;
    else existing.runs = null;
  }
  return [...byTier.values()].sort((a, b) => b.me - a.me || b.te - a.te);
}

/** Any row the modal can offer as "Use this blueprint". */
export type AcquisitionSourceRow = OwnedTierRow | ContractOfferRow | MarketSellRow | LpOfferRow;

/**
 * The `MaterialSourcing` patch picking `row` writes, keyed by the blueprint's
 * own typeID via the caller's `onSourcingChange`.
 *
 * An owned tier sets no price: `acquisitionForLookup` (recipes.ts) finds that
 * tier among its own `tierOptions` and costs any shortfall itself.
 *
 * Every other row forces its tier *and* its price, since the engine cannot
 * reproduce either — it only ever considers the single cheapest contract
 * listing at the plan's own hub, and a hub BPO sell price, never a specific
 * listing, another region's order, or an LP offer.
 *
 * Unit: `overridePrice` on a Blueprint Acquisition line is the ISK for the
 * whole line — `acquisitionMaterialFor` (materialResolution.ts) books it as
 * one unit, quantity 1 — and one override applies at every node resolving
 * this blueprint. So it is set to one purchase of the row: a contract
 * listing's whole ask (every copy it bundles), one market order's price, one
 * LP redemption. Exact for an original. For a copy it is *not* scaled to the
 * runs a node needs: a listing whose runs × quantity fall short of the need
 * is underpriced, unlike automatic selection's `shortfallCost`. The modal
 * shows runs and ISK/run beside the price so the pilot can judge that, and
 * Manual entry covers a multi-listing buy.
 */
export function overridePatchFor(row: AcquisitionSourceRow): MaterialSourcing {
  return {
    acquisitionTierOverride: { me: row.me, te: row.te },
    overridePrice: row.kind === 'owned' ? undefined : row.price,
  };
}

/**
 * Whether `sourcing` is exactly what picking `row` wrote. Tier alone is not
 * enough — an owned ME0 original, a market BPO and an LP copy all share
 * ME0/TE0 — so a priced row also matches on price, and an owned row only
 * when no price was forced alongside the tier.
 */
export function isCurrentPick(
  row: AcquisitionSourceRow,
  sourcing: MaterialSourcing | undefined
): boolean {
  const override = sourcing?.acquisitionTierOverride;
  if (!override || override.me !== row.me || override.te !== row.te) return false;
  return sourcing.overridePrice === overridePatchFor(row).overridePrice;
}

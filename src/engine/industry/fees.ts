/**
 * Market fees for listing a sell order at an NPC trade hub.
 * Source: EVE University wiki "Trading" (verified 2026-08):
 *   sales tax % = 7.5% * (1 - 11% * Accounting level)      -> 3.375% at V
 *   broker fee % = 3% - 0.3%*BrokerRelations
 *                     - 0.03%*factionStanding - 0.02%*corpStanding
 *   minimum broker fee 100 ISK per order.
 * Relisting (editing an already-listed order's price) charges a different
 * schedule. Source: in-repo `public/data/skills.json`, "Advanced Broker
 * Relations" (typeID 16597):
 *   - the full broker fee rate applies to the INCREASE increment when the
 *     new price is higher than the old one; zero when it is not.
 *   - a Relist Discount (50% + 6%/level Advanced Broker Relations, 80% at V)
 *     is applied to the broker fee rate, and that discounted rate applies to
 *     the full new total. The two amounts add together.
 */

const SALES_TAX_BASE_PCT = 7.5;
const ACCOUNTING_REDUCTION_PER_LEVEL = 0.11;
const BROKER_FEE_BASE_PCT = 3;
const BROKER_RELATIONS_PCT_PER_LEVEL = 0.3;
const FACTION_STANDING_PCT_PER_POINT = 0.03;
const CORP_STANDING_PCT_PER_POINT = 0.02;
const MIN_BROKER_FEE_ISK = 100;
const RELIST_DISCOUNT_BASE_PCT = 50;
const RELIST_DISCOUNT_PCT_PER_LEVEL = 6;

function assertLevel(name: string, level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`${name} level must be an integer 0..5, got ${level}`);
  }
}

/** Sales (transaction) tax rate, percent. */
export function salesTaxPct(accountingLevel: number): number {
  assertLevel('Accounting', accountingLevel);
  return SALES_TAX_BASE_PCT * (1 - ACCOUNTING_REDUCTION_PER_LEVEL * accountingLevel);
}

/** NPC-station broker fee rate, percent. Standings are unmodified -10..10. */
export function brokerFeePct(
  brokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0
): number {
  assertLevel('Broker Relations', brokerRelationsLevel);
  const pct =
    BROKER_FEE_BASE_PCT -
    BROKER_RELATIONS_PCT_PER_LEVEL * brokerRelationsLevel -
    FACTION_STANDING_PCT_PER_POINT * factionStanding -
    CORP_STANDING_PCT_PER_POINT * corpStanding;
  return Math.max(0, pct);
}

/** Sales tax in ISK on a filled order of `value` ISK. */
export function salesTax(value: number, accountingLevel: number): number {
  return (value * salesTaxPct(accountingLevel)) / 100;
}

/** Broker fee in ISK for listing an order of `value` ISK (100 ISK minimum). */
export function brokerFee(
  value: number,
  brokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0
): number {
  if (value <= 0) return 0;
  const fee = (value * brokerFeePct(brokerRelationsLevel, factionStanding, corpStanding)) / 100;
  return Math.max(MIN_BROKER_FEE_ISK, fee);
}

/**
 * Relist Discount rate, percent, applied to the broker fee rate when
 * relisting (Advanced Broker Relations): 50% base, +6 points per level,
 * 80% at level V.
 */
export function relistDiscountPct(advancedBrokerRelationsLevel: number): number {
  assertLevel('Advanced Broker Relations', advancedBrokerRelationsLevel);
  return RELIST_DISCOUNT_BASE_PCT + RELIST_DISCOUNT_PCT_PER_LEVEL * advancedBrokerRelationsLevel;
}

/**
 * Broker fee rate, percent, after the Relist Discount — what relisting to a
 * LOWER price charges on the full new total (the increase-increment
 * component of the relist fee is zero for a decrease, so this rate alone
 * covers that case).
 */
export function relistBrokerFeePct(
  brokerRelationsLevel: number,
  advancedBrokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0
): number {
  const brokerPct = brokerFeePct(brokerRelationsLevel, factionStanding, corpStanding);
  const discountPct = relistDiscountPct(advancedBrokerRelationsLevel);
  return (brokerPct * (100 - discountPct)) / 100;
}

/**
 * Broker fee in ISK for relisting (editing an existing order's price) from
 * `oldPrice` to `newPrice` a unit, across `quantity` units. Full broker rate
 * on the increase increment (zero when `newPrice` is not higher), plus the
 * Relist-Discounted rate on the full new total; the two sum, then the 100
 * ISK per-order minimum applies once. See the module doc for the source.
 */
export function relistFee(
  oldPrice: number,
  newPrice: number,
  quantity: number,
  brokerRelationsLevel: number,
  advancedBrokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0
): number {
  if (quantity <= 0 || newPrice <= 0) return 0;

  const brokerPct = brokerFeePct(brokerRelationsLevel, factionStanding, corpStanding);
  const discountedPct = relistBrokerFeePct(
    brokerRelationsLevel,
    advancedBrokerRelationsLevel,
    factionStanding,
    corpStanding
  );

  const increaseIncrement = Math.max(0, newPrice - oldPrice) * quantity;
  const increaseFee = (increaseIncrement * brokerPct) / 100;
  const discountedFee = (newPrice * quantity * discountedPct) / 100;
  const fee = increaseFee + discountedFee;

  return fee > 0 ? Math.max(MIN_BROKER_FEE_ISK, fee) : 0;
}

function breakEvenPriceAtRate(
  totalCost: number,
  quantity: number,
  taxPct: number,
  brokerPct: number
): number | null {
  if (quantity <= 0) return null;

  const revenueNoFloor = totalCost / (1 - (taxPct + brokerPct) / 100);
  const impliedBrokerFee = (revenueNoFloor * brokerPct) / 100;

  const revenue =
    revenueNoFloor <= 0 || impliedBrokerFee >= MIN_BROKER_FEE_ISK
      ? revenueNoFloor
      : (totalCost + MIN_BROKER_FEE_ISK) / (1 - taxPct / 100);

  return revenue / quantity;
}

/**
 * Net sell price per unit at which selling `quantity` units exactly covers
 * `totalCost` (profit = 0), after sales tax and broker fee. Solved directly
 * from the rate functions rather than back-solved from a `BuildResult`'s ISK
 * totals, which divides by revenue and breaks at zero revenue. Re-solves
 * against the 100 ISK broker-fee minimum when the percentage fee would land
 * below it. Returns `null` for a non-positive quantity.
 */
export function breakEvenPrice(
  totalCost: number,
  quantity: number,
  accountingLevel: number,
  brokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0
): number | null {
  const taxPct = salesTaxPct(accountingLevel);
  const brokerPct = brokerFeePct(brokerRelationsLevel, factionStanding, corpStanding);
  return breakEvenPriceAtRate(totalCost, quantity, taxPct, brokerPct);
}

/**
 * Like `breakEvenPrice`, but for RELISTING (editing an order's price) rather
 * than listing fresh: the broker fee rate is discounted by the Relist
 * Discount instead of charged in full. Assumes the relist is a price
 * DECREASE — the only direction a "floor" (how low can this safely go) is
 * meaningful for, since raising a price only ever improves margin.
 */
export function relistBreakEvenPrice(
  totalCost: number,
  quantity: number,
  accountingLevel: number,
  brokerRelationsLevel: number,
  advancedBrokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0
): number | null {
  const taxPct = salesTaxPct(accountingLevel);
  const brokerPct = relistBrokerFeePct(
    brokerRelationsLevel,
    advancedBrokerRelationsLevel,
    factionStanding,
    corpStanding
  );
  return breakEvenPriceAtRate(totalCost, quantity, taxPct, brokerPct);
}

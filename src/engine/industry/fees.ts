/**
 * Market fees for listing a sell order at an NPC trade hub.
 * Source: EVE University wiki "Trading" (verified 2026-08):
 *   sales tax % = 7.5% * (1 - 11% * Accounting level)      -> 3.375% at V
 *   broker fee % = 3% - 0.3%*BrokerRelations
 *                     - 0.03%*factionStanding - 0.02%*corpStanding
 *   minimum broker fee 100 ISK per order.
 */

const SALES_TAX_BASE_PCT = 7.5;
const ACCOUNTING_REDUCTION_PER_LEVEL = 0.11;
const BROKER_FEE_BASE_PCT = 3;
const BROKER_RELATIONS_PCT_PER_LEVEL = 0.3;
const FACTION_STANDING_PCT_PER_POINT = 0.03;
const CORP_STANDING_PCT_PER_POINT = 0.02;
const MIN_BROKER_FEE_ISK = 100;

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

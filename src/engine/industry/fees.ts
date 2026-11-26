const SALES_TAX_BASE_PCT = 7.5;
const ACCOUNTING_REDUCTION_PER_LEVEL = 0.11;
const BROKER_FEE_BASE_PCT = 3;
const BROKER_RELATIONS_PCT_PER_LEVEL = 0.3;
const FACTION_STANDING_PCT_PER_POINT = 0.03;
const CORP_STANDING_PCT_PER_POINT = 0.02;
export const MIN_BROKER_FEE_ISK = 100;
const RELIST_DISCOUNT_BASE_PCT = 50;
const RELIST_DISCOUNT_PCT_PER_LEVEL = 6;

function assertLevel(name: string, level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`${name} level must be an integer 0..5, got ${level}`);
  }
}

export function salesTaxPct(accountingLevel: number, discountFactor = 1): number {
  assertLevel('Accounting', accountingLevel);
  return (
    SALES_TAX_BASE_PCT * (1 - ACCOUNTING_REDUCTION_PER_LEVEL * accountingLevel) * discountFactor
  );
}

export function brokerFeePct(
  brokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0,
  safetyTaxPct = 0,
  discountFactor = 1
): number {
  assertLevel('Broker Relations', brokerRelationsLevel);
  const pct =
    BROKER_FEE_BASE_PCT -
    BROKER_RELATIONS_PCT_PER_LEVEL * brokerRelationsLevel -
    FACTION_STANDING_PCT_PER_POINT * factionStanding -
    CORP_STANDING_PCT_PER_POINT * corpStanding;
  return Math.max(0, pct) * discountFactor + safetyTaxPct;
}

export function salesTax(value: number, accountingLevel: number, discountFactor = 1): number {
  return (value * salesTaxPct(accountingLevel, discountFactor)) / 100;
}

export function brokerFee(
  value: number,
  brokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0,
  safetyTaxPct = 0,
  discountFactor = 1
): number {
  if (value <= 0) return 0;
  const skillFee =
    (value * brokerFeePct(brokerRelationsLevel, factionStanding, corpStanding, 0, discountFactor)) /
    100;
  return Math.max(MIN_BROKER_FEE_ISK, skillFee) + (value * safetyTaxPct) / 100;
}

export function relistDiscountPct(advancedBrokerRelationsLevel: number): number {
  assertLevel('Advanced Broker Relations', advancedBrokerRelationsLevel);
  return RELIST_DISCOUNT_BASE_PCT + RELIST_DISCOUNT_PCT_PER_LEVEL * advancedBrokerRelationsLevel;
}

export function relistBrokerFeePct(
  brokerRelationsLevel: number,
  advancedBrokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0,
  discountFactor = 1
): number {
  const brokerPct = brokerFeePct(
    brokerRelationsLevel,
    factionStanding,
    corpStanding,
    0,
    discountFactor
  );
  const discountPct = relistDiscountPct(advancedBrokerRelationsLevel);
  return (brokerPct * (100 - discountPct)) / 100;
}

export function relistFee(
  oldPrice: number,
  newPrice: number,
  quantity: number,
  brokerRelationsLevel: number,
  advancedBrokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0,
  discountFactor = 1
): number {
  if (quantity <= 0 || newPrice <= 0) return 0;

  const increaseIncrement = Math.max(0, newPrice - oldPrice) * quantity;
  const brokerPct = brokerFeePct(
    brokerRelationsLevel,
    factionStanding,
    corpStanding,
    0,
    discountFactor
  );
  const discountedPct = relistBrokerFeePct(
    brokerRelationsLevel,
    advancedBrokerRelationsLevel,
    factionStanding,
    corpStanding,
    discountFactor
  );
  const fee = (increaseIncrement * brokerPct + newPrice * quantity * discountedPct) / 100;

  return fee > 0 ? Math.max(MIN_BROKER_FEE_ISK, fee) : 0;
}

function breakEvenPriceAtRate(
  totalCost: number,
  quantity: number,
  taxPct: number,
  brokerPct: number,
  safetyTaxPct = 0
): number | null {
  if (quantity <= 0) return null;

  const revenueNoFloor = totalCost / (1 - (taxPct + brokerPct + safetyTaxPct) / 100);
  const impliedBrokerFee = (revenueNoFloor * brokerPct) / 100;

  const revenue =
    revenueNoFloor <= 0 || impliedBrokerFee >= MIN_BROKER_FEE_ISK
      ? revenueNoFloor
      : (totalCost + MIN_BROKER_FEE_ISK) / (1 - (taxPct + safetyTaxPct) / 100);

  return revenue / quantity;
}

export function breakEvenPrice(
  totalCost: number,
  quantity: number,
  accountingLevel: number,
  brokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0,
  safetyTaxPct = 0,
  discountFactor = 1
): number | null {
  const taxPct = salesTaxPct(accountingLevel, discountFactor);
  const brokerPct = brokerFeePct(
    brokerRelationsLevel,
    factionStanding,
    corpStanding,
    0,
    discountFactor
  );
  return breakEvenPriceAtRate(totalCost, quantity, taxPct, brokerPct, safetyTaxPct);
}

export function relistBreakEvenPrice(
  totalCost: number,
  quantity: number,
  accountingLevel: number,
  brokerRelationsLevel: number,
  advancedBrokerRelationsLevel: number,
  factionStanding = 0,
  corpStanding = 0,
  discountFactor = 1
): number | null {
  const taxPct = salesTaxPct(accountingLevel, discountFactor);
  const brokerPct = relistBrokerFeePct(
    brokerRelationsLevel,
    advancedBrokerRelationsLevel,
    factionStanding,
    corpStanding,
    discountFactor
  );
  return breakEvenPriceAtRate(totalCost, quantity, taxPct, brokerPct);
}

export function relistBreakEvenPriceAtBrokerPct(
  totalCost: number,
  quantity: number,
  accountingLevel: number,
  brokerPct: number,
  advancedBrokerRelationsLevel: number
): number | null {
  const discountPct = relistDiscountPct(advancedBrokerRelationsLevel);
  return breakEvenPriceAtRate(
    totalCost,
    quantity,
    salesTaxPct(accountingLevel),
    (brokerPct * (100 - discountPct)) / 100
  );
}

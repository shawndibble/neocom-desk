export const PAYMENT_REF_TYPES: ReadonlySet<string> = new Set([
  'player_donation',
  'contract_price',
  'contract_price_payment_corp',
  'contract_deposit',
]);

export function amountSlack(amount: number): number {
  return Math.max(1, amount * 0.005);
}

export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= amountSlack(b);
}

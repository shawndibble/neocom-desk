import { marketIskTone, signedMarketIsk } from './signedIsk';

/** Money, not status: the ISK delta tokens, with the sign (DESIGN.md §1). */
export function IskDelta({ amount }: { amount: number }) {
  return <span className={marketIskTone(amount)}>{signedMarketIsk(amount)}</span>;
}

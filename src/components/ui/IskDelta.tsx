import { marketIskDecimals } from '@/lib/isk';
import { iskTone, signedIsk } from '@/lib/signedIsk';

interface IskDeltaProps {
  amount: number;
  decimals?: number;
  className?: string;
}

/**
 * @summary A signed ISK change with its "+" and the isk-pos / isk-neg tone.
 */
export function IskDelta({ amount, decimals, className }: IskDeltaProps) {
  const places = decimals ?? marketIskDecimals(amount);
  const classes = [className, iskTone(amount, places)].filter(Boolean).join(' ');
  return <span className={classes || undefined}>{signedIsk(amount, places)}</span>;
}

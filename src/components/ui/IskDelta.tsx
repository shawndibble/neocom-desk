import { iskGains, marketIskTone, signedIsk, signedMarketIsk } from '@/lib/signedIsk';

interface IskDeltaProps {
  /** The signed amount: positive earns `isk-pos` and a "+", negative `isk-neg` and its minus, zero neither. */
  amount: number;
  /** Fixed precision (0 for whole-ISK surfaces). Omit for Market precision, which keeps cheap goods readable. */
  decimals?: number;
  /** Layout and type only (weight, size, alignment). The tone is the primitive's. */
  className?: string;
}

/**
 * A signed ISK change: gain or loss, as money rather than status. The sign is
 * printed ("+1.2M", "-340K") and the tone repeats it, so colour never carries
 * it alone (DESIGN.md §1, ISK deltas). A figure that rounds to zero at the
 * shown precision is plain, neither sign nor tone.
 *
 * Prints the figure as text; wrap it in `IskAmount` where the exact value must
 * be one gesture away.
 *
 * @summary A signed ISK change with its "+" and the isk-pos / isk-neg tone.
 */
export function IskDelta({ amount, decimals, className }: IskDeltaProps) {
  const text = decimals === undefined ? signedMarketIsk(amount) : signedIsk(amount, decimals);
  const tone =
    decimals === undefined
      ? marketIskTone(amount)
      : iskGains(amount, decimals)
        ? 'text-isk-pos'
        : iskGains(-amount, decimals)
          ? 'text-isk-neg'
          : undefined;
  const classes = [className, tone].filter(Boolean).join(' ');
  return <span className={classes || undefined}>{text}</span>;
}

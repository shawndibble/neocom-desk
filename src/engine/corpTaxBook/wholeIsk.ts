/**
 * Display rule for Corp Tax Book figures (#5247): whole ISK, and anything under
 * 1 ISK (a fractional tax line's remainder, a sub-ISK credit) is nothing.
 * Display only: stored amounts and the billing engine keep their fractions.
 */
export function wholeIsk(amount: number): number {
  return Math.abs(amount) < 1 ? 0 : Math.round(amount);
}

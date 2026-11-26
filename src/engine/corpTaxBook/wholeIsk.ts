export function wholeIsk(amount: number): number {
  return Math.abs(amount) < 1 ? 0 : Math.round(amount);
}

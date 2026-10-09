/** Pure helpers for the Clones page: what a set of implants is worth, and how far the jump cooldown has run. */

export interface ImplantValue {
  /** ISK of the priced implants. */
  total: number;
  /** Implants with no price: the total is a floor, never silently complete. */
  unpriced: number;
}

export function sumImplantValue(
  typeIds: readonly number[],
  prices: ReadonlyMap<number, number | null>
): ImplantValue {
  let total = 0;
  let unpriced = 0;
  for (const id of typeIds) {
    const price = prices.get(id);
    if (price === null || price === undefined) unpriced += 1;
    else total += price;
  }
  return { total, unpriced };
}

/** Share (0..1) of the cooldown already elapsed; 1 when there is nothing to wait for. */
export function cooldownProgress(
  lastCloneJumpDate: string | null | undefined,
  cooldownHours: number,
  now: Date
): number {
  if (!lastCloneJumpDate || cooldownHours <= 0) return 1;
  const last = Date.parse(lastCloneJumpDate);
  if (Number.isNaN(last)) return 1;
  const elapsed = (now.getTime() - last) / (cooldownHours * 3_600_000);
  return Math.min(1, Math.max(0, elapsed));
}

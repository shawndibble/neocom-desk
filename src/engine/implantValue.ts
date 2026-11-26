import { parseInstant } from './esiInstant';
import { HOUR_MS } from '@/lib/age';

export interface ImplantValue {
  total: number;
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

export function cooldownProgress(
  lastCloneJumpDate: string | null | undefined,
  cooldownHours: number,
  now: Date
): number {
  if (!lastCloneJumpDate || cooldownHours <= 0) return 1;
  const last = parseInstant(lastCloneJumpDate);
  if (last === null) return 1;
  const elapsed = (now.getTime() - last) / (cooldownHours * HOUR_MS);
  return Math.min(1, Math.max(0, elapsed));
}

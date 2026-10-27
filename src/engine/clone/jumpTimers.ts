/**
 * The Overview's Jump timers: when each timer clears and how long is left.
 * Pure — `now` is a parameter. The clone jump cooldown itself is
 * `cloneJump.ts`'s; this only reads times off ESI's jump fatigue and compares.
 */
import { parseInstant } from '../esiInstant';

/** When jump fatigue expires, ms since the epoch; null when ESI gave no (valid) date. */
export function fatigueEndsAt(expireDate: string | null | undefined): number | null {
  if (!expireDate) return null;
  return parseInstant(expireDate);
}

/** Whole seconds until `endsAt`; 0 when there is no timer or it has passed. */
export function secondsLeft(endsAt: number | null, now: number): number {
  if (endsAt === null || endsAt <= now) return 0;
  return Math.floor((endsAt - now) / 1000);
}

/** The longest time left across timers: "everything clears in this long". 0 when none runs. */
export function longestRemainingSeconds(endsAts: readonly (number | null)[], now: number): number {
  return Math.max(0, ...endsAts.map((at) => secondsLeft(at, now)));
}

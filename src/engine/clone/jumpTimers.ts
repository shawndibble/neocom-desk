import { parseInstant } from '../esiInstant';

export function fatigueEndsAt(expireDate: string | null | undefined): number | null {
  if (!expireDate) return null;
  return parseInstant(expireDate);
}

export function secondsLeft(endsAt: number | null, now: number): number {
  if (endsAt === null || endsAt <= now) return 0;
  return Math.floor((endsAt - now) / 1000);
}

export function longestRemainingSeconds(endsAts: readonly (number | null)[], now: number): number {
  return Math.max(0, ...endsAts.map((at) => secondsLeft(at, now)));
}

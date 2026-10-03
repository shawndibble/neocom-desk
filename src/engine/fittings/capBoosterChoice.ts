/**
 * The Charge Picker's arithmetic for a cap booster group: which of the
 * twenty-odd Cap Booster charges holds this Fitting's capacitor, how much
 * each injects, and what a GJ of it costs.
 *
 * Pure: the figures on each choice's `cap` come from the dogma engine with
 * the whole Fitting loaded (`stats.ts`'s `extractCapBoosterFigures`), the
 * price from the hub's order book.
 */
import type { ChargeChoice } from './chargeChoice';
import type { CapacitorStatus } from './types';

export interface CapBoosterFigures {
  /** GJ one charge injects. */
  injection: number;
  /** The whole group's injection, GJ/s averaged over its reloads. */
  gjPerSecond: number;
  /** Charges one module holds: boosts before it reloads. */
  boostsPerLoad: number;
  /** The Fitting's capacitor with this charge in every booster of the group. */
  capacitor: CapacitorStatus;
}

export interface CapQuickPicks {
  /** The least injection that still holds the capacitor; null when none does. */
  smallestStable: ChargeChoice | null;
  mostGjPerSecond: ChargeChoice;
  /** The cheapest GJ among the charges that hold the capacitor, or of all when none does. */
  bestValue: ChargeChoice | null;
}

/** Above 0 when `a` leaves the capacitor better off: stable beats running dry, then level or time. */
export function compareCapacitor(a: CapacitorStatus, b: CapacitorStatus): number {
  if (a.stable !== b.stable) return a.stable ? 1 : -1;
  if (a.stable && b.stable) return a.stablePercentage - b.stablePercentage;
  if (!a.stable && !b.stable) return a.depletesInSeconds - b.depletesInSeconds;
  return 0;
}

/** ISK per GJ injected at the hub's price; null with no price or no cap figures. */
export function iskPerGj(choice: ChargeChoice): number | null {
  if (choice.price === null || !choice.cap || choice.cap.injection <= 0) return null;
  return choice.price / choice.cap.injection;
}

/** Smallest charge to biggest, Tech I before its Navy version, then by name. */
export function sortCapChoices(choices: readonly ChargeChoice[]): ChargeChoice[] {
  const tierRank = (c: ChargeChoice) => (c.tier === 'tech1' ? 0 : 1);
  return [...choices].sort(
    (a, b) =>
      (a.cap?.injection ?? 0) - (b.cap?.injection ?? 0) ||
      tierRank(a) - tierRank(b) ||
      a.name.localeCompare(b.name)
  );
}

/**
 * A usable, cheaper charge that injects at least as many GJ/s and leaves the
 * capacitor at least as well off — so `choice` has no reason to be picked;
 * of several, one that isn't itself beaten.
 * Null when there is none, or when `choice` has no price to compare.
 */
export function capStrictlyWorseThan(
  choice: ChargeChoice,
  all: readonly ChargeChoice[]
): ChargeChoice | null {
  const cap = choice.cap;
  if (choice.price === null || !cap) return null;
  const price = choice.price;
  const beaters = all.filter(
    (other) =>
      other.typeId !== choice.typeId &&
      !other.skillMissing &&
      other.cap !== undefined &&
      other.price !== null &&
      other.price < price &&
      other.cap.gjPerSecond >= cap.gjPerSecond &&
      compareCapacitor(other.cap.capacitor, cap.capacitor) >= 0
  );
  // Name one nothing beats in turn (there always is one: each beater is cheaper).
  return beaters.find((other) => capStrictlyWorseThan(other, all) === null) ?? beaters[0] ?? null;
}

export function capQuickPicks(choices: readonly ChargeChoice[]): CapQuickPicks | null {
  const usable = choices.filter((c) => !c.skillMissing && c.cap !== undefined);
  if (usable.length === 0) return null;
  const cheaper = (a: ChargeChoice, b: ChargeChoice) =>
    a.price !== null && (b.price === null || a.price < b.price);
  const injection = (c: ChargeChoice) => c.cap!.injection;
  const gjPerSecond = (c: ChargeChoice) => c.cap!.gjPerSecond;

  const stable = usable.filter((c) => c.cap!.capacitor.stable);
  const smallestStable = stable.length
    ? stable.reduce((best, c) =>
        injection(c) < injection(best) || (injection(c) === injection(best) && cheaper(c, best))
          ? c
          : best
      )
    : null;
  const mostGjPerSecond = usable.reduce((best, c) =>
    gjPerSecond(c) > gjPerSecond(best) || (gjPerSecond(c) === gjPerSecond(best) && cheaper(c, best))
      ? c
      : best
  );
  const priced = (stable.length ? stable : usable).filter((c) => iskPerGj(c) !== null);
  const bestValue = priced.length
    ? priced.reduce((best, c) => (iskPerGj(c)! < iskPerGj(best)! ? c : best))
    : null;
  return { smallestStable, mostGjPerSecond, bestValue };
}

import type { ChargeChoice } from './chargeChoice';
import type { CapacitorStatus } from './types';

export interface CapBoosterFigures {
  injection: number;
  gjPerSecond: number;
  boostsPerLoad: number;
  capacitor: CapacitorStatus;
}

export interface CapQuickPicks {
  smallestStable: ChargeChoice | null;
  mostGjPerSecond: ChargeChoice;
  bestValue: ChargeChoice | null;
}

export function compareCapacitor(a: CapacitorStatus, b: CapacitorStatus): number {
  if (a.stable !== b.stable) return a.stable ? 1 : -1;
  if (a.stable && b.stable) return a.stablePercentage - b.stablePercentage;
  if (!a.stable && !b.stable) return a.depletesInSeconds - b.depletesInSeconds;
  return 0;
}

export function iskPerGj(choice: ChargeChoice): number | null {
  if (choice.price === null || !choice.cap || choice.cap.injection <= 0) return null;
  return choice.price / choice.cap.injection;
}

export function sortCapChoices(choices: readonly ChargeChoice[]): ChargeChoice[] {
  const tierRank = (c: ChargeChoice) => (c.tier === 'tech1' ? 0 : 1);
  return [...choices].sort(
    (a, b) =>
      (a.cap?.injection ?? 0) - (b.cap?.injection ?? 0) ||
      tierRank(a) - tierRank(b) ||
      a.name.localeCompare(b.name)
  );
}

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

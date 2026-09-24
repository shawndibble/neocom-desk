/**
 * View model for the Skill Plan editor's "Skill injectors" panel: what
 * covering the plan's remaining SP with Large Skill Injectors would take and
 * cost, "if injected now". Pure — no fetch/DOM/Dexie — so the bracket walk
 * and price wiring are each testable on their own.
 */
import { injectorsToCover } from '@/engine/skillInjectors';

/** The subset of `HubAggregate` this view model prices against. */
export interface InjectorPriceSource {
  sellMin: number | null;
}

export interface InjectorFacts {
  /** Sum of the plan's remaining scheduled steps' SP (part-trained levels already credited). */
  spToTrain: number;
  /** ESI's unallocated_sp, or null while unknown. */
  unallocatedSp: number | null;
  /** `spToTrain - unallocatedSp`, floored at 0; null while `totalSp` is unknown. */
  gapSp: number | null;
  /** True when unallocated SP alone already covers the plan — no injectors needed. */
  none: boolean;
  /** True when `totalSp` hasn't loaded — every other figure but `spToTrain` is unavailable. */
  spUnknown: boolean;
  /** Large Skill Injectors needed to close the gap. */
  count: number;
  /** SP the last injector delivers past the gap. */
  surplusSp: number;
  /** Hub sell price for one injector; null means no sell orders, never 0 ISK. */
  pricePerInjector: number | null;
  /** `pricePerInjector * count`; null under the same "no sell orders" rule. */
  priceTotal: number | null;
}

export function buildInjectorFacts(
  scheduled: readonly { sp: number }[],
  totalSp: number | null,
  unallocatedSp: number | null,
  priceSource: InjectorPriceSource | null
): InjectorFacts {
  const spToTrain = scheduled.reduce((sum, step) => sum + step.sp, 0);
  const pricePerInjector = priceSource?.sellMin ?? null;
  // Shared by both "nothing to compute" branches below: no injectors, so no
  // priced total either — never a stray `pricePerInjector * 0`.
  const nothingToCover = { count: 0, surplusSp: 0, pricePerInjector, priceTotal: null };

  if (totalSp === null) {
    return {
      spToTrain,
      unallocatedSp,
      gapSp: null,
      none: false,
      spUnknown: true,
      ...nothingToCover,
    };
  }

  const unallocated = unallocatedSp ?? 0;
  const gapSp = Math.max(0, spToTrain - unallocated);
  if (gapSp === 0) {
    return { spToTrain, unallocatedSp, gapSp, none: true, spUnknown: false, ...nothingToCover };
  }

  // ESI's /characters/{id}/skills/ describes total_sp as "the total Skill
  // Points spent on skills" and unallocated_sp as "the amount of unallocated
  // Skill Points" (esi.evetech.net/meta/openapi.json) — separate figures, so
  // the in-game bracket (which keys off every SP point the character holds,
  // spent or not) needs the two added back together.
  const bracketSp = totalSp + unallocated;
  const { count, surplusSp } = injectorsToCover(gapSp, bracketSp);

  return {
    spToTrain,
    unallocatedSp,
    gapSp,
    none: false,
    spUnknown: false,
    count,
    surplusSp,
    pricePerInjector,
    priceTotal: pricePerInjector === null ? null : pricePerInjector * count,
  };
}

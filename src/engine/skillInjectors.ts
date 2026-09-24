/**
 * Large Skill Injector math (support.eveonline.com/hc/en-us/articles/207605005;
 * EVE University "Skill trading"): yield per injector drops in brackets as the
 * character's total SP rises, so covering a large gap walks several brackets
 * within a single count.
 *
 * Pure: no fetch/DOM/Dexie — `src/engine` stays a pure calc layer.
 */

/** Injector yield brackets, in ascending SP order. `belowSp: Infinity` is the final (lowest-yield) bracket. */
const LARGE_INJECTOR_BRACKETS: readonly { belowSp: number; yieldSp: number }[] = [
  { belowSp: 5_000_000, yieldSp: 500_000 },
  { belowSp: 50_000_000, yieldSp: 400_000 },
  { belowSp: 80_000_000, yieldSp: 300_000 },
  { belowSp: Infinity, yieldSp: 150_000 },
];

/** SP one Large Skill Injector delivers, keyed by total SP *at the moment of injection*. */
export function largeInjectorYield(totalSp: number): number {
  const bracket = LARGE_INJECTOR_BRACKETS.find((b) => totalSp < b.belowSp);
  return (bracket ?? LARGE_INJECTOR_BRACKETS[LARGE_INJECTOR_BRACKETS.length - 1]).yieldSp;
}

export interface InjectorsToCoverResult {
  /** Large Skill Injectors needed to close the gap. */
  count: number;
  /** Total SP those injectors deliver. */
  deliveredSp: number;
  /** SP the last injector delivers past the gap — never negative. */
  surplusSp: number;
}

/**
 * How many Large Skill Injectors it takes to cover `gapSp`, injected one at a
 * time from `startingTotalSp` — each injection raises total SP, which can
 * push the next injector into a lower-yield bracket.
 */
export function injectorsToCover(gapSp: number, startingTotalSp: number): InjectorsToCoverResult {
  if (gapSp <= 0) return { count: 0, deliveredSp: 0, surplusSp: 0 };

  let deliveredSp = 0;
  let totalSp = startingTotalSp;
  let count = 0;
  while (deliveredSp < gapSp) {
    const yieldSp = largeInjectorYield(totalSp);
    deliveredSp += yieldSp;
    totalSp += yieldSp;
    count++;
  }
  return { count, deliveredSp, surplusSp: deliveredSp - gapSp };
}

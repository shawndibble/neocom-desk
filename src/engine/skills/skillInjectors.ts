const LARGE_INJECTOR_BRACKETS: readonly { belowSp: number; yieldSp: number }[] = [
  { belowSp: 5_000_000, yieldSp: 500_000 },
  { belowSp: 50_000_000, yieldSp: 400_000 },
  { belowSp: 80_000_000, yieldSp: 300_000 },
  { belowSp: Infinity, yieldSp: 150_000 },
];

export const ALPHA_SP_CAP = 20_000_000;

export function largeInjectorYield(totalSp: number): number {
  const bracket = LARGE_INJECTOR_BRACKETS.find((b) => totalSp < b.belowSp);
  return (bracket ?? LARGE_INJECTOR_BRACKETS[LARGE_INJECTOR_BRACKETS.length - 1]).yieldSp;
}

export interface InjectorsToCoverResult {
  count: number;
  deliveredSp: number;
  surplusSp: number;
}

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

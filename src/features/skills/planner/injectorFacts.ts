import { ALPHA_SP_CAP, injectorsToCover } from '@/engine/skills/skillInjectors';
import type { CloneState } from '@/engine/types';

export interface InjectorPriceSource {
  sellMin: number | null;
}

export interface InjectorFacts {
  spToTrain: number;
  unallocatedSp: number | null;
  gapSp: number | null;
  none: boolean;
  spUnknown: boolean;
  alphaShortfallSp: number;
  count: number;
  surplusSp: number;
  pricePerInjector: number | null;
  priceTotal: number | null;
}

export function buildInjectorFacts(
  scheduled: readonly { sp: number }[],
  totalSp: number | null,
  unallocatedSp: number | null,
  priceSource: InjectorPriceSource | null,
  cloneState: CloneState = 'omega'
): InjectorFacts {
  const spToTrain = scheduled.reduce((sum, step) => sum + step.sp, 0);
  const pricePerInjector = priceSource?.sellMin ?? null;
  const nothingToCover = {
    alphaShortfallSp: 0,
    count: 0,
    surplusSp: 0,
    pricePerInjector,
    priceTotal: null,
  };

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

  const bracketSp = totalSp + unallocated;
  const headroom = cloneState === 'alpha' ? Math.max(0, ALPHA_SP_CAP - bracketSp) : gapSp;
  const coverableGap = Math.min(gapSp, headroom);
  const alphaShortfallSp = gapSp - coverableGap;
  const { count, surplusSp } = injectorsToCover(coverableGap, bracketSp);

  return {
    spToTrain,
    unallocatedSp,
    gapSp,
    none: false,
    spUnknown: false,
    alphaShortfallSp,
    count,
    surplusSp,
    pricePerInjector,
    priceTotal: pricePerInjector === null || count === 0 ? null : pricePerInjector * count,
  };
}

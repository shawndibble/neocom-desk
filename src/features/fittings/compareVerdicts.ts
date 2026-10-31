import { firstResourceOverage } from '@/engine/fittings/skillGaps';
import type { FittingStats } from '@/engine/fittings/types';
import { fixed0 } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';

/**
 * The words under a compared Fitting's name: does it fit (or by how much it is over a budget),
 * and can the pilot fly it. One place, so the column header and the Stats export never differ.
 */
export function fitVerdict(
  t: Translate,
  stats: FittingStats | null | undefined
): { text: string; overBudget: boolean } | null {
  if (!stats) return null;
  const overage = firstResourceOverage(stats);
  return overage
    ? {
        overBudget: true,
        text: t('fittings.compare.overBy', {
          resource: t(`fittings.list.${overage.resource}`),
          amount: fixed0(overage.amount),
        }),
      }
    : { overBudget: false, text: t('fittings.compare.fitsYes') };
}

/** Can-fly in words; `unknown` once the skills check failed and nothing else is known. */
export function canFlyVerdict(
  t: Translate,
  flies: boolean | null | undefined,
  failed: boolean
): { text: string; tone: 'good' | 'bad' | 'unknown' } | null {
  if (flies !== null && flies !== undefined) {
    return flies
      ? { text: t('fittings.compare.canFlyYes'), tone: 'good' }
      : { text: t('fittings.compare.canFlyNo'), tone: 'bad' };
  }
  return failed ? { text: t('fittings.compare.canFlyUnknown'), tone: 'unknown' } : null;
}

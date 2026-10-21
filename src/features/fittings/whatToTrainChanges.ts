import { createNumberFormat } from '@/lib/numberLocale';
import type { TFunction } from 'i18next';
import type { LevelGain } from '@/engine/fittings/skillGains';
import { changeLabel } from './fittingVariationsCsv';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });

/** Every change a suggestion makes to the fit, worded: the Variations deltas, then the role stats. */
export function gainChangeLabels(
  gain: Pick<LevelGain, 'delta' | 'roleChanges'>,
  t: TFunction
): string[] {
  return [
    ...gain.delta.changes.map((change) => changeLabel(change, t)),
    ...gain.roleChanges.map((change) =>
      t(`fittings.whatToTrain.role.${change.key}`, {
        before: formatDecimal(change.before),
        after: formatDecimal(change.after),
      })
    ),
  ];
}

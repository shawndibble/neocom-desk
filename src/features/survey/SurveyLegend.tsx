/**
 * What the chart's colours and lines mean: a swatch per ore layer (the same
 * tones the layers are drawn in) and the mining-rate bars. The chart itself
 * carries no labels for these.
 */
import { useTranslation } from 'react-i18next';
import type { SurveySummary } from '@/engine/survey/series';
import { oreTone } from './surveyTones';

export function SurveyLegend({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
      {summary.oreNames.map((ore, i) => (
        <li key={ore} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-xs"
            style={{ background: oreTone(i) }}
          />
          {ore}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-xs bg-accent-dim" />
        {t('survey.legendRate')}
      </li>
    </ul>
  );
}

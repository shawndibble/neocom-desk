import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { SurveyChartView } from '@/engine/survey/chartViews';

const VIEW_LABEL: Record<SurveyChartView, string> = {
  ore: 'survey.viewOre',
  depletion: 'survey.viewDepletion',
  isk: 'survey.viewIsk',
};

/**
 * Which view fills the Survey's whole chart area (ore left, depletion by ore,
 * ISK left). Unlabelled: the aria-label names it. Controlled: the caller owns
 * the pick and passes only the views available right now.
 */
export function SurveyViewSelect({
  value,
  onChange,
  views,
}: {
  value: SurveyChartView;
  onChange: (view: SurveyChartView) => void;
  views: SurveyChartView[];
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as SurveyChartView)}>
      <SelectTrigger aria-label={t('survey.chartView')} size="sm" className="min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {views.map((view) => (
          <SelectItem key={view} value={view}>
            {t(VIEW_LABEL[view])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

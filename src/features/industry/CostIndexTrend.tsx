import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { focusRingClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { IndustryActivity } from '@/engine/industry/types';
import { areaPoints } from '@/features/overview/widgets/charts/geometry';
import { CHART_COLOR } from '@/features/overview/widgets/charts/palette';
import { costIndexTrend, esiActivityName } from './costIndexHistory';
import { useCostIndexHistory } from './costIndexHistoryRead';
import { formatCostIndex } from './format';

const CHART_HEIGHT = 56;

interface CostIndexTrendProps {
  /** Live figure, pre-formatted. */
  value: string;
  systemId: number | undefined;
  systemName: string;
  activity: IndustryActivity;
}

/**
 * The facility's cost index figure. With 7+ days of history for the build
 * system it becomes a button (chart glyph after it) opening a popover with the
 * trend for the plan's activity; otherwise, and while loading or on a failed
 * read, it is just the figure.
 */
export function CostIndexTrend({ value, systemId, systemName, activity }: CostIndexTrendProps) {
  const { t } = useTranslation();
  const history = useCostIndexHistory(systemId);
  const trend = history ? costIndexTrend(history, esiActivityName(activity)) : null;
  if (!trend) return <>{value}</>;
  const summary = t('industry.costIndexTrend.summary', {
    weekAgo: formatCostIndex(trend.weekAgo),
    today: formatCostIndex(trend.today),
  });
  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex items-center gap-1 rounded-xs ${focusRingClassName}`}
        aria-label={t('industry.costIndexTrend.open', { system: systemName, value })}
      >
        {value}
        <Icon.Market size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-dim" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 max-w-[calc(100vw-2rem)] space-y-2 p-3">
        <p className="text-xs font-semibold text-text">
          {t('industry.costIndexTrend.title', { system: systemName, days: trend.points.length })}
        </p>
        <svg
          role="img"
          aria-label={summary}
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: CHART_HEIGHT, color: CHART_COLOR.accent }}
        >
          <polyline
            points={areaPoints(
              trend.points.map((p) => p.value),
              CHART_HEIGHT
            ).line.join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="text-xs text-text-dim tabular-nums">{summary}</p>
      </PopoverContent>
    </Popover>
  );
}

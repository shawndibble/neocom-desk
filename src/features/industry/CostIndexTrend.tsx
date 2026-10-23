import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { focusRingClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { IndustryActivity } from '@/engine/industry/types';
import { ChartHover } from '@/features/overview/widgets/charts/ChartHover';
import { areaCoords } from '@/features/overview/widgets/charts/geometry';
import { CHART_COLOR } from '@/features/overview/widgets/charts/palette';
import { cheaperNearbySystems } from '@/engine/industry/cheaperNearbySystems';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { costIndexTrend, esiActivityName } from './costIndexHistory';
import { useCostIndexHistory } from './costIndexHistoryRead';
import { formatDateWithYear } from '@/lib/formatDateTick';
import { formatCostIndex } from './format';
import { loadSystemCostIndices } from './marketData';

const CHART_HEIGHT = 56;

interface CostIndexTrendProps {
  /** Live figure, pre-formatted. */
  value: string;
  systemId: number | undefined;
  systemName: string;
  activity: IndustryActivity;
  /** Live index as a fraction, to compare neighbours against. */
  index: number | null;
}

/**
 * The facility's cost index figure. With 7+ days of history for the build
 * system it becomes a button (chart glyph after it) opening a popover with the
 * trend for the plan's activity; otherwise, and while loading or on a failed
 * read, it is just the figure.
 */
export function CostIndexTrend({
  value,
  systemId,
  systemName,
  activity,
  index,
}: CostIndexTrendProps) {
  const { t } = useTranslation();
  const history = useCostIndexHistory(systemId);
  const trend = history ? costIndexTrend(history, esiActivityName(activity)) : null;
  if (!trend) return <>{value}</>;
  const summary = t('industry.costIndexTrend.summary', {
    weekAgo: formatCostIndex(trend.weekAgo),
    today: formatCostIndex(trend.today),
  });
  const coords = areaCoords(
    trend.points.map((p) => p.value),
    CHART_HEIGHT
  );
  const dotY = coords.map(({ y }) => y / CHART_HEIGHT);
  const tips = trend.points.map((p) => ({
    title: formatDateWithYear(p.date),
    rows: [{ label: t('industry.costIndexTrend.index'), value: formatCostIndex(p.value) }],
  }));
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
        <ChartHover
          tips={tips}
          layout="points"
          dotY={dotY}
          className="w-full"
          style={{ height: CHART_HEIGHT }}
        >
          <svg
            role="img"
            aria-label={summary}
            viewBox={`0 0 100 ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height: CHART_HEIGHT, color: CHART_COLOR.accent }}
          >
            <polyline
              points={coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </ChartHover>
        <p className="text-xs text-text-dim tabular-nums">{summary}</p>
        {systemId !== undefined && (
          <CheaperNearby systemId={systemId} activity={activity} index={index ?? trend.today} />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface Nearby {
  id: number;
  name: string;
  security: number;
  jumps: number;
  index: number;
}

/** The 5 cheapest systems within 5 jumps, cheapest first. Renders nothing while loading, on a failed read, or when none is cheaper. */
function CheaperNearby({
  systemId,
  activity,
  index,
}: {
  systemId: number;
  activity: IndustryActivity;
  index: number;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Nearby[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [graph, systems, indices] = await Promise.all([
        loadJumpGraph().catch(() => undefined),
        loadSolarSystemsById().catch(() => null),
        loadSystemCostIndices(activity).catch(() => null),
      ]);
      if (!live || !graph || !systems || !indices) return;
      const found = cheaperNearbySystems(graph, systemId, indices, index);
      setRows(
        found.flatMap(({ systemId: id, jumps, index: value }) => {
          const system = systems.get(id);
          return system
            ? [{ id, name: system.name, security: system.security, jumps, index: value }]
            : [];
        })
      );
    })();
    return () => {
      live = false;
    };
  }, [systemId, activity, index]);
  if (rows.length === 0) return null;
  return (
    <ul
      aria-label={t('industry.costIndexTrend.nearby')}
      className="space-y-0.5 border-t border-line pt-2 text-xs tabular-nums"
    >
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline gap-2">
          <SecurityStatus security={row.security} />
          <span className="min-w-0 flex-1 truncate text-text">{row.name}</span>
          <span className="text-text-dim">
            {t('industry.costIndexTrend.jumps', { count: row.jumps })}
          </span>
          <span className="w-12 text-right text-text">{formatCostIndex(row.index)}</span>
        </li>
      ))}
    </ul>
  );
}

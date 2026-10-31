/**
 * "Daily flow" (issue #3914): the Journal panel's one-bar-per-day In / Out
 * chart. Reads the same filtered, netted rows as the panel's totals, so a ref
 * type picked in the panel draws that type alone. On a mouse, a click on a day
 * sets the Journal's date range to that day (again clears it); on touch a tap
 * only reads the bar. `recharts` stays behind a lazy import
 * (`IskFlowChartBars.tsx`); this file never imports it.
 */
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import { Button, Spinner } from '@/components/ui';
import { journalDailyFlow, journalFlowWindow, FLOW_MAX_DAYS } from '@/engine/journalDailyFlow';
import { utcDay } from '@/engine/netWorth/snapshot';
import type { JournalRow } from '@/engine/journalNetting';
import { useJournalFlowChartHidden } from '@/features/character/journalFlowChartPref';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import { IskFlowLegend } from '@/features/character/IskFlowLegend';
import { useHydratedStore } from '@/lib/useHydratedStore';
import type { WalletJournalFilter } from '@/features/character/walletJournalFilter';
import { useNow } from '@/lib/useNow';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

const LazyIskFlowChartBars = lazy(() => guarded(() => import('./IskFlowChartBars')));

interface IskFlowChartProps {
  /** The Journal's rows under every filter but the date range. */
  rows: readonly JournalRow[];
  filter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
}

export function IskFlowChart({ rows, filter, onFilterChange }: IskFlowChartProps) {
  const { t } = useTranslation();
  const hidden = useJournalFlowChartHidden((state) => state.value);
  const hydrated = useHydratedStore(useJournalFlowChartHidden);
  const touch = useMediaQuery(COARSE_POINTER_QUERY);
  const { startDate, endDate } = filter;
  const today = utcDay(useNow());
  const flowSpan = useMemo(
    () => journalFlowWindow(startDate, endDate, today),
    [startDate, endDate, today]
  );
  const days = useMemo(() => journalDailyFlow(rows, flowSpan), [rows, flowSpan]);
  // No flow in the span: a heading and toggle would control nothing.
  if (!hydrated || !days.some((d) => d.in > 0 || d.out > 0)) return null;
  const selectedDay =
    filter.startDate !== null && filter.startDate === filter.endDate ? filter.startDate : null;
  const baseHeading = filter.refType
    ? t('wallet.journalFlowHeadingType', { type: journalRefLabel(filter.refType, t) })
    : t('wallet.journalFlowHeading');
  const heading = flowSpan.truncated
    ? t('wallet.journalFlowHeadingTruncated', { heading: baseHeading, count: FLOW_MAX_DAYS })
    : baseHeading;
  return (
    <section aria-label={heading} className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-xs font-semibold uppercase tracking-wide text-text-dim">
          {heading}
        </h3>
        <Button
          size="sm"
          onClick={() => void useJournalFlowChartHidden.getState().setValue(!hidden)}
        >
          {hidden ? t('wallet.journalFlowShow') : t('wallet.journalFlowHide')}
        </Button>
      </div>
      {!hidden && (
        <>
          <Suspense
            fallback={
              <div className="flex h-40 items-center justify-center">
                <Spinner label={t('common.loading')} />
              </div>
            }
          >
            <LazyIskFlowChartBars
              days={days}
              selectedDay={selectedDay}
              readOnly={touch}
              onSelectDay={(day) => {
                const flow = days.find((d) => d.day === day);
                if (!flow || (flow.in === 0 && flow.out === 0)) return;
                const clear = day === selectedDay;
                onFilterChange({
                  ...filter,
                  startDate: clear ? null : day,
                  endDate: clear ? null : day,
                });
              }}
            />
          </Suspense>
          <IskFlowLegend>
            <span>
              {t('wallet.journalFlowClickHint', { context: touch ? 'touch' : undefined })}
            </span>
          </IskFlowLegend>
        </>
      )}
    </section>
  );
}

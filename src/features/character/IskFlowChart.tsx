/**
 * "Daily flow" (issue #3914): the Journal panel's one-bar-per-day In / Out
 * chart. Reads the same filtered, netted rows as the panel's totals, so a ref
 * type picked in the panel draws that type alone. A click on a day sets the
 * Journal's date range to that day. `recharts` stays behind a lazy import
 * (`IskFlowChartBars.tsx`); this file never imports it.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import { Button, Spinner } from '@/components/ui';
import { journalDailyFlow } from '@/engine/journalDailyFlow';
import type { JournalRow } from '@/engine/journalNetting';
import { useJournalFlowChartHidden } from '@/features/character/journalFlowChartPref';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import type { WalletJournalFilter } from '@/features/character/walletJournalFilter';

const LazyIskFlowChartBars = lazy(() => guarded(() => import('./IskFlowChartBars')));

interface IskFlowChartProps {
  /** The Journal's filtered rows. */
  rows: readonly JournalRow[];
  filter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
}

export function IskFlowChart({ rows, filter, onFilterChange }: IskFlowChartProps) {
  const { t } = useTranslation();
  const hidden = useJournalFlowChartHidden((state) => state.value);
  const hydrated = useJournalFlowChartHidden((state) => state.hydrated);
  useEffect(() => {
    void useJournalFlowChartHidden.getState().hydrate();
  }, []);
  const days = useMemo(() => journalDailyFlow(rows), [rows]);
  if (!hydrated || (days.length === 0 && !hidden)) return null;
  const selectedDay =
    filter.startDate !== null && filter.startDate === filter.endDate ? filter.startDate : null;
  const heading = filter.refType
    ? t('wallet.journalFlowHeadingType', { type: journalRefLabel(filter.refType, t) })
    : t('wallet.journalFlowHeading');
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
              onSelectDay={(day) => onFilterChange({ ...filter, startDate: day, endDate: day })}
            />
          </Suspense>
          <p className="flex flex-wrap gap-x-4 text-xs text-text-dim">
            <span>
              <span className="mr-1 inline-block size-2 rounded-xs bg-isk-pos" />
              {t('wallet.journalFlowLegendIn')}
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-xs bg-isk-neg" />
              {t('wallet.journalFlowLegendOut')}
            </span>
            <span>{t('wallet.journalFlowClickHint')}</span>
          </p>
        </>
      )}
    </section>
  );
}

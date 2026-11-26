import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { LiveNote } from '@/components/ui/LiveStatus';
import { BREAK_EVEN_MAX_RUNS } from '@/engine/industry/breakEvenRuns';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/numberLocale';
import { parseOrKeep } from './planInputParsers';
import { SourcingInput } from './SourcingInput';

interface PlanRunsControlProps {
  runs: number;
  onRunsChange: (runs: number) => void;
  seconds: number | null;
  profit: number | null;
  findBreakEven: (() => number | null) | null;
  stockRuns?: { runs: number; limitingName: string | null } | null;
}

export function PlanRunsControl({
  runs,
  onRunsChange,
  seconds,
  profit,
  findBreakEven,
  stockRuns = null,
}: PlanRunsControlProps) {
  const { t } = useTranslation();
  const [noBreakEvenAt, setNoBreakEvenAt] = useState<{
    runs: number;
    profit: number | null;
  } | null>(null);
  const stockRunsText =
    stockRuns &&
    (stockRuns.runs > 0
      ? t(
          stockRuns.limitingName === null
            ? 'industry.stockRuns.covers'
            : 'industry.stockRuns.coversLimited',
          {
            count: stockRuns.runs,
            runs: formatNumber(stockRuns.runs),
            name: stockRuns.limitingName,
          }
        )
      : t(
          stockRuns.limitingName === null
            ? 'industry.stockRuns.none'
            : 'industry.stockRuns.noneLimited',
          {
            name: stockRuns.limitingName,
          }
        ));
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
      <SourcingInput
        value={runs}
        label={t('industry.runs')}
        inputMode="numeric"
        widthClassName="w-16"
        parse={(raw) => parseOrKeep(runs, raw, (n) => Math.max(1, Math.round(n)))}
        onCommit={(next) => {
          if (next !== undefined) onRunsChange(next);
        }}
      />
      <span aria-hidden="true">{t('industry.hero.runsUnit', { count: runs })}</span>
      {seconds !== null && (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatDuration(seconds)}</span>
        </>
      )}
      {findBreakEven && (
        <Button
          size="sm"
          onClick={() => setNoBreakEvenAt(findBreakEven() === null ? { runs, profit } : null)}
        >
          {t('industry.breakEvenRuns')}
        </Button>
      )}
      {stockRuns && (
        <span className="flex flex-wrap items-center gap-2" data-testid="stock-runs">
          <span aria-hidden="true">·</span>
          <span className="text-xs">{stockRunsText}</span>
          {stockRuns.runs > 0 && stockRuns.runs !== runs && (
            <Button size="sm" onClick={() => onRunsChange(stockRuns.runs)}>
              {t('industry.stockRuns.set', { runs: formatNumber(stockRuns.runs) })}
            </Button>
          )}
        </span>
      )}
      {noBreakEvenAt?.runs === runs && noBreakEvenAt.profit === profit && (
        <LiveNote as="span" className="text-xs">
          {t('industry.breakEvenRunsNone', { max: formatNumber(BREAK_EVEN_MAX_RUNS) })}
        </LiveNote>
      )}
    </span>
  );
}

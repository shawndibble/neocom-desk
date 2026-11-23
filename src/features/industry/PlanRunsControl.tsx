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
  /** The whole plan's time; `null` until the plan resolves. */
  seconds: number | null;
  /** The profit the verdict reads now. A failed search's note goes stale once it moves. */
  profit: number | null;
  /**
   * Searches for the runs at which the verdict breaks even and applies them,
   * returning the runs found or `null`. Passed only while the verdict reads a
   * loss on live prices: Break Even is the way out of a loss, not a control
   * the page always carries.
   */
  findBreakEven: (() => number | null) | null;
  /**
   * The most runs the owned stock covers and the material that caps it
   * (`limitingName`, null at the maximum job runs); `null` shows nothing.
   */
  stockRuns?: { runs: number; limitingName: string | null } | null;
}

/**
 * The verdict's runs row: the runs field, the plan's time, and Break Even
 * while the plan loses money. The time is a fact of the recipe, so it stays
 * when prices are unreachable and the ledger below is an empty state.
 */
export function PlanRunsControl({
  runs,
  onRunsChange,
  seconds,
  profit,
  findBreakEven,
  stockRuns = null,
}: PlanRunsControlProps) {
  const { t } = useTranslation();
  // The runs and profit a failed search ran against: the note is stale once either moves.
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
        // Blank/garbage reverts to the last committed value rather than
        // snapping to the minimum — clearing the box to retype "10" as
        // "100" must not overwrite it with 1 mid-edit.
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
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
}: PlanRunsControlProps) {
  const { t } = useTranslation();
  // The runs and profit a failed search ran against: the note is stale once either moves.
  const [noBreakEvenAt, setNoBreakEvenAt] = useState<{
    runs: number;
    profit: number | null;
  } | null>(null);
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
      {noBreakEvenAt?.runs === runs && noBreakEvenAt.profit === profit && (
        <span role="status" className="text-xs">
          {t('industry.breakEvenRunsNone', { max: formatNumber(BREAK_EVEN_MAX_RUNS) })}
        </span>
      )}
    </span>
  );
}

/**
 * Tells the stats column what the ticked rows, plus the row under the pointer
 * or keyboard focus, would change. The hovered row's figures are one debounced
 * recalculation, so a sweep down the list works out only where the pointer rests.
 */
import { useEffect, useMemo, useState } from 'react';
import { applyImproveCandidate, type ImproveOption } from '@/engine/fittings/improve';
import { optionKey, setKey, withHovered } from '@/engine/fittings/improveKeys';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { diffFittingStats, type FittingStatsDelta } from '@/engine/fittings/variationDelta';
import type { ImproveSearch } from './useImprove';
import { ADD_PREVIEW_DELAY_MS } from './useModuleAddPreview';

interface Input {
  recalc: ImproveSearch['recalc'];
  fitting: Fitting | null | undefined;
  /** The fit as it is now; null before a search is done. */
  before: FittingStats | null;
  chosen: ImproveOption[];
  ticked: ReadonlyMap<string, ImproveOption>;
  hovered: ImproveOption | null;
  /** The ticked set's stats, once checked. */
  checked: FittingStats | null | undefined;
  onPreview?: (delta: FittingStatsDelta | null, iskDelta?: number | null) => void;
}

export function useSelectionPreview({
  recalc,
  fitting,
  before,
  chosen,
  ticked,
  hovered,
  checked,
  onPreview,
}: Input) {
  // The ticked set with the hovered row on top (it displaces a ticked row sharing a slot, as ticking it would).
  const hoverSet = useMemo(
    () => (!hovered || ticked.has(optionKey(hovered)) ? null : withHovered(chosen, hovered)),
    [hovered, ticked, chosen]
  );
  const hoverKey = hoverSet ? setKey(hoverSet) : null;
  const [hoverResult, setHoverResult] = useState<{
    key: string;
    fitting: Fitting;
    after: FittingStats | null;
  } | null>(null);
  useEffect(() => {
    if (!fitting || !recalc || !hoverSet || hoverKey === null) return;
    let stale = false;
    const timer = setTimeout(() => {
      const folded = hoverSet.reduce(
        (acc, pick) => applyImproveCandidate(acc, pick.candidate),
        fitting
      );
      recalc(folded)
        .then((after) => !stale && setHoverResult({ key: hoverKey, fitting, after }))
        .catch(() => !stale && setHoverResult({ key: hoverKey, fitting, after: null }));
    }, ADD_PREVIEW_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [fitting, recalc, hoverSet, hoverKey]);
  const hoverAfter =
    hoverKey !== null && hoverResult?.key === hoverKey && hoverResult.fitting === fitting
      ? hoverResult.after
      : null;
  // Until the hovered row's figures land, the ticked set's stay up.
  const previewAfter = hoverAfter ?? (chosen.length > 0 ? (checked ?? null) : null);
  const previewDelta = useMemo(
    () => (before && previewAfter ? diffFittingStats(before, previewAfter) : null),
    [before, previewAfter]
  );
  // The Price figure follows the same rows. The rows' iskDelta moves the fit's price exactly.
  const previewRows = hoverAfter && hoverSet ? hoverSet : chosen;
  const previewIsk =
    previewDelta && previewRows.some((row) => row.iskDelta !== null)
      ? previewRows.reduce((sum, row) => sum + (row.iskDelta ?? 0), 0)
      : null;
  useEffect(() => {
    onPreview?.(previewDelta, previewIsk);
  }, [onPreview, previewDelta, previewIsk]);
  // Closing Improve (or a new search) takes the panel away: nothing stays previewed.
  useEffect(() => () => onPreview?.(null), [onPreview]);
}

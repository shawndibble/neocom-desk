import { useEffect, useMemo, useState } from 'react';
import { applyImproveCandidate, type ImproveOption } from '@/engine/fittings/improve';
import { optionKey, setKey, withHovered } from '@/engine/fittings/improve';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { diffFittingStats, type FittingStatsDelta } from '@/engine/fittings/variationDelta';
import type { ImproveSearch } from './useImprove';
import { ADD_PREVIEW_DELAY_MS } from './useModuleAddPreview';

interface Input {
  recalc: ImproveSearch['recalc'];
  fitting: Fitting | null | undefined;
  before: FittingStats | null;
  chosen: ImproveOption[];
  ticked: ReadonlyMap<string, ImproveOption>;
  hovered: ImproveOption | null;
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
  const previewAfter = hoverAfter ?? (chosen.length > 0 ? (checked ?? null) : null);
  const previewDelta = useMemo(
    () => (before && previewAfter ? diffFittingStats(before, previewAfter) : null),
    [before, previewAfter]
  );
  const previewRows = hoverAfter && hoverSet ? hoverSet : chosen;
  const previewIsk =
    previewDelta && previewRows.some((row) => row.iskDelta !== null)
      ? previewRows.reduce((sum, row) => sum + (row.iskDelta ?? 0), 0)
      : null;
  useEffect(() => {
    onPreview?.(previewDelta, previewIsk);
  }, [onPreview, previewDelta, previewIsk]);
  useEffect(() => () => onPreview?.(null), [onPreview]);
}

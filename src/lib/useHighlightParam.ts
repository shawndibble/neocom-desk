/**
 * The row a notification sent the reader to, read once from `?highlight=`.
 *
 * An alert that only opens the right *page* still leaves the pilot scanning a
 * table for the thing they were just told about. The fire knows which row it
 * was about, so it says so in the URL, and the table it lands on scrolls there
 * and pulses it (`components/ui/DataTable`'s `highlightRowKey`).
 *
 * Two behaviours make this a one-shot rather than a piece of view state:
 *
 * - **Latched on mount.** The value is read once, so the effect below can
 *   delete the parameter without the hook then reading back `null`.
 * - **Spent immediately**, whether or not anything matched. A link left armed
 *   would pulse again on a reload or a tab round-trip, and — worse — could
 *   pulse a *different* row once a cache caught up with newer data. What the
 *   reader was shown once, they were shown.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePositiveInt } from '@/engine/market/urlState';

/**
 * The query key. Lives here rather than beside the route table because both
 * the link that writes it and the table that reads it point at this module,
 * and a second spelling would break the pair silently.
 */
export const HIGHLIGHT_PARAM = 'highlight';

export function useHighlightParam(): number | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlight] = useState(() => parsePositiveInt(searchParams.get(HIGHLIGHT_PARAM)));

  useEffect(() => {
    if (highlight === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(HIGHLIGHT_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [highlight, setSearchParams]);

  return highlight;
}

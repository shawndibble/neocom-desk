/**
 * The record a widget row asked a page to open, read once from `?open=`.
 *
 * The sibling of `useHighlightParam`, with the same one-shot rules (latched on
 * mount, stripped from the URL at once, a bad id ignored). The page uses the id
 * as if the reader had clicked that row, so closing the modal leaves a clean
 * URL. `open` implies a flash too: a page with both a highlight and a modal
 * passes this id to each.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePositiveInt } from '@/engine/market/urlState';
import { OPEN_PARAM } from './highlightParam';

export function useOpenParam(): number | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open] = useState(() => parsePositiveInt(searchParams.get(OPEN_PARAM)));

  useEffect(() => {
    if (open === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(OPEN_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [open, setSearchParams]);

  return open;
}

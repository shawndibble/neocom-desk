import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePositiveInt } from '@/engine/market/urlState';
import { HIGHLIGHT_PARAM } from './highlightParam';

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

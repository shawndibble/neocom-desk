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

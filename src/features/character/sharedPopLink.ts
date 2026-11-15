/**
 * The deep link to one Shared Pop: `/calendar?pop=<SharedPopView.id>` opens the Calendar on it
 * (its detail, as a click on its row would). The Shared Moon Pop notification opens it.
 * Read once on mount and stripped from the URL, like `?open=` (`useOpenParam`).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SHARED_POP_PARAM = 'pop';

export function sharedPopCalendarHref(popId: string): string {
  return `/calendar?${new URLSearchParams({ [SHARED_POP_PARAM]: popId }).toString()}`;
}

/** The Shared Pop id a link asked the Calendar to open, or null. */
export function useSharedPopParam(): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [popId] = useState(() => {
    const raw = searchParams.get(SHARED_POP_PARAM)?.trim() ?? '';
    return raw === '' ? null : raw;
  });

  useEffect(() => {
    if (popId === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(SHARED_POP_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [popId, setSearchParams]);

  return popId;
}

import { useEffect } from 'react';
import { useDocumentTitleNameStore } from './documentTitleName';
import { useRouteTitle } from './useRouteTitle';

export function DocumentTitleTracker(): null {
  const title = useRouteTitle(useDocumentTitleNameStore((state) => state.name));

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

import { startTransition, useEffect, useLayoutEffect, useState } from 'react';
import { LANDING_SECTION_IDS } from './landingAnchors';

function anchorTarget(hash: string): string | null {
  const id = hash.slice(1);
  return LANDING_SECTION_IDS.includes(id) ? id : null;
}

export function useBelowFold(ready: boolean): boolean {
  const [target] = useState(() => anchorTarget(window.location.hash));
  const [shown, setShown] = useState(target !== null);

  useEffect(() => {
    if (ready && !shown) startTransition(() => setShown(true));
  }, [ready, shown]);

  useLayoutEffect(() => {
    if (ready && target !== null) document.getElementById(target)?.scrollIntoView();
  }, [ready, target]);

  return shown;
}

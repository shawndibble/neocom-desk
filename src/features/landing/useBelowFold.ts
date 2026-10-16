import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LANDING_ANCHORS } from './landingAnchors';

/** The landing section a URL `#hash` names, or null when it names none of them. */
function anchorTarget(hash: string): string | null {
  const id = decodeURIComponent(hash.slice(1));
  return LANDING_ANCHORS.some((anchor) => anchor.id === id) ? id : null;
}

/**
 * Whether the landing page's sections below the hero are mounted (#3967).
 *
 * The commit that takes over from the prerendered hero (`app/landingShell.ts`)
 * renders the header and hero only; the rest mounts in a transition right
 * after, which React renders in slices rather than as one long task on a slow
 * phone. It all sits below the first screen, so nothing visible changes.
 *
 * `ready`: the page renders its hero now. Until then nothing is scheduled, so
 * the deferral cannot land before the hero does.
 *
 * A URL whose hash names a landing section (`/login#login-faq`) mounts
 * everything in that first commit and scrolls the section into view: the
 * browser's own jump to the fragment has given up long before React renders.
 */
export function useBelowFold(ready: boolean): boolean {
  const { hash } = useLocation();
  const [target] = useState(() => anchorTarget(hash));
  const [shown, setShown] = useState(target !== null);

  useEffect(() => {
    if (ready && !shown) startTransition(() => setShown(true));
  }, [ready, shown]);

  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!ready || target === null || scrolled.current) return;
    scrolled.current = true;
    document.getElementById(target)?.scrollIntoView();
  }, [ready, target]);

  return shown;
}

import { startTransition, useEffect, useLayoutEffect, useState } from 'react';
import { LANDING_ANCHORS } from './landingAnchors';

/** The landing section a URL `#hash` names, or null. Compared raw: the ids are plain ASCII, and decoding throws on a stray `%`. */
function anchorTarget(hash: string): string | null {
  const id = hash.slice(1);
  return LANDING_ANCHORS.some((anchor) => anchor.id === id) ? id : null;
}

/**
 * Whether the landing page's sections below the hero are mounted.
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
 * The hash is read once from `window.location`, not the router, so a header
 * anchor click does not re-render the page.
 */
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

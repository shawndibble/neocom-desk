import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useOutlet } from 'react-router-dom';

/**
 * `<Outlet />` replacement that cross-fades between routes using the native
 * View Transition API, where supported (Chromium; no-op elsewhere).
 *
 * The app's router is declarative (`<BrowserRouter>`/`<Routes>`, App.tsx),
 * not react-router's data router, so `<Link viewTransition>` isn't available
 * — this hand-rolls the same effect. React Router already resolves
 * `useOutlet()` to the *new* route's element as soon as `location` changes;
 * without buffering, `document.startViewTransition()` would capture nothing
 * to fade from. So a locally-held "displayed" location/element pair only
 * advances to the new one inside the transition's callback.
 *
 * When there's nothing to animate — the route didn't actually change (only
 * the search string or hash did), the API isn't supported, or the user asked
 * for reduced motion (the API has no built-in opt-out, unlike the
 * `@view-transition` at-rule used for cross-document navigation in
 * styles/index.css) — `displayed` is advanced directly during render. That's
 * React's own "adjusting state when a prop changes" pattern, not an effect:
 * there's no external system to synchronize with, just derived state.
 */
export function PageTransitionOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const [displayed, setDisplayed] = useState({ location, outlet });

  const routeChanged = location.pathname !== displayed.location.pathname;
  const canAnimate =
    routeChanged &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (location !== displayed.location && !canAnimate) {
    setDisplayed({ location, outlet });
  }

  useEffect(() => {
    if (!canAnimate) return;
    document.startViewTransition(() => {
      flushSync(() => setDisplayed({ location, outlet }));
    });
    // `canAnimate` already encodes "did the route change", so this only needs
    // to re-run when that verdict, or the destination itself, changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAnimate, location]);

  return displayed.outlet;
}

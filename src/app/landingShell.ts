import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * The landing page's first screen, prerendered into `index.html` (#3926): the
 * sticky header and the hero, as static HTML a first-time visitor sees before
 * any JS has loaded. On a slow phone that is seconds sooner than React can
 * render it.
 *
 * `index.html` carries it inside a `<template>`. The `#landing-shell-gate`
 * script in `<head>` chooses it, hides `#root` and starts the hero's ship,
 * only on `/` or `/login`, with no signed-in hint and outside the Play Store
 * app; the `#landing-shell-boot` script in `<body>` clones it in. React renders under it
 * unseen, and whatever the first real screen turns out to be lets it go:
 * `Login` once its Dexie read resolves (the hero commits in the same frame, so
 * the swap never paints in between), any other route on arrival, and a render
 * error at once. `main.tsx` adds a timed backstop, so nothing can strand a
 * visitor on a page whose buttons do not work.
 *
 * The markup is the real `Login` render, kept by
 * `src/features/landing/landingShell.test.tsx` as
 * `landingShell.snapshot.html`, which `vite.config.ts` injects.
 */
export const LANDING_SHELL_ID = 'landing-shell';

/** Set on `<html>` while the shell stands in; hides `#root`. */
export const LANDING_SHELL_ATTR = 'data-landing-shell';

/** Set on `<html>` once the shell was shown, and kept: the hero's entry animation would replay the text it already showed. */
export const LANDING_SHELL_SHOWN_ATTR = 'data-landing-shell-shown';

/** How long after the entry runs the shell may stand in, whatever happens. */
export const LANDING_SHELL_BACKSTOP_MS = 10_000;

const LANDING_PATHS = new Set(['/', '/login']);

/** Removes the shell and shows `#root`. Idempotent; a no-op when none was shown. */
export function releaseLandingShell(): void {
  document.documentElement.removeAttribute(LANDING_SHELL_ATTR);
  document.getElementById(LANDING_SHELL_ID)?.remove();
}

/** Lets the shell go on any route that is not the landing page: a signed-in pilot's `/` redirect, or a stale hint. */
export function LandingShellOffLandingRelease(): null {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (!LANDING_PATHS.has(pathname)) releaseLandingShell();
  }, [pathname]);
  return null;
}

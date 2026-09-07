import type { ReactElement } from 'react';
import * as Sentry from '@sentry/react';

/**
 * `/error` — an undisclosed route that crashes on purpose, so Sentry can be
 * confirmed from production with a browser instead of by waiting for a real
 * user to hit a real bug.
 *
 * Throws during render rather than from a click, which is the point: that is
 * the path a genuine crash takes, through `ErrorBoundary` and out via React
 * 19's `onCaughtError` hook to Sentry. The reload screen you land on is
 * `ErrorBoundary`'s own — its Reload button will re-throw, so navigate away
 * rather than reloading.
 *
 * Unlinked from every nav, like `/styleguide`. `/error` is also one of the
 * most-probed paths on the web and Googlebot runs JavaScript, so the message
 * names itself and the `probe` tag makes a crawler-triggered copy one mute
 * click rather than a diagnosis.
 */
export function ErrorProbe(): ReactElement {
  Sentry.setTag('probe', 'error-route');
  throw new Error('Deliberate probe: /error route render throw');
}

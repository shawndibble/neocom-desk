import type { ReactElement } from 'react';
import * as Sentry from '@sentry/react';

export function ErrorProbe(): ReactElement {
  Sentry.setTag('probe', 'error-route');
  throw new Error('Deliberate probe: /error route render throw');
}

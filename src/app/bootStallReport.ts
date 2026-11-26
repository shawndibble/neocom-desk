import { captureMessage } from '@sentry/react';

export type BootGate = 'root' | 'require-character' | 'login' | 'fitting-shared';

let reported = false;
let reportedAt: number | undefined;

export function reportBootStallOnce(afterMs: number, gate: BootGate): void {
  if (reported) return;
  reported = true;
  reportedAt = Date.now();
  captureMessage('Boot stalled on BootScreen', {
    level: 'warning',
    tags: { subsystem: 'boot' },
    extra: { afterMs, gate, visibility: document.visibilityState },
  });
}

export function reportBootStallResolved(recoveryTapped: boolean): void {
  if (reportedAt === undefined) return;
  const resolvedAfterMs = Date.now() - reportedAt;
  reportedAt = undefined;
  captureMessage('Boot stall resolved', {
    level: 'info',
    tags: { subsystem: 'boot' },
    extra: { resolvedAfterMs, recoveryTapped, visibility: document.visibilityState },
  });
}

import { captureMessage } from '@sentry/react';

/**
 * Report a boot that never finished — once per page session.
 *
 * `BootScreen` mounts from three routes and re-arms its timer on each, so a
 * genuinely wedged database would otherwise report on every mount and burn
 * Sentry quota describing one stuck session. Latched the same way
 * `ReloadPrompt`'s `pollingRegistrations` latches its interval.
 *
 * Paired with the blocked-upgrade report (`upgradeBlockedReport.ts`) by the
 * shared `subsystem` tag, because the pair is the diagnosis: stall *and*
 * blocked is the schema-version block; stall alone is something else.
 */
let reported = false;

export function reportBootStallOnce(afterMs: number): void {
  if (reported) return;
  reported = true;
  captureMessage('Boot stalled on BootScreen', {
    level: 'warning',
    tags: { subsystem: 'boot' },
    extra: { afterMs },
  });
}

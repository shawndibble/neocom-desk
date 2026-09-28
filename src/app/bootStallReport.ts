import { captureMessage } from '@sentry/react';

/** Which of `BootScreen`'s mount points reported the stall. */
export type BootGate =
  'root' | 'require-character' | 'login' | 'fitting-shared' | 'signed-in-shell';

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
 *
 * `gate` narrows "something else" further: `root`, `login` and
 * `fitting-shared` all wait on the same `characters.count()` read as
 * `require-character`, but only `require-character` shares the page with the
 * boot-time ESI prefetch burst (`prefetch.ts`) — the two waiting on the
 * *same* read is what tells slow Dexie contention apart from a wedged one.
 */
let reported = false;
let reportedAt: number | undefined;

export function reportBootStallOnce(afterMs: number, gate: BootGate): void {
  if (reported) return;
  reported = true;
  reportedAt = Date.now();
  captureMessage('Boot stalled on BootScreen', {
    level: 'warning',
    tags: { subsystem: 'boot' },
    extra: { afterMs, gate },
  });
}

/**
 * Report how long a *reported* stall took to clear, once the gate that
 * stalled it finally resolves (or `BootScreen` unmounts for any other
 * reason). Distinguishes a boot that was merely slow — resolves on its own
 * shortly after the stall report, `recoveryTapped: false` — from one that
 * was still stuck when the user gave up and tapped reload first.
 *
 * That second case still reaches here rather than never firing at all:
 * `recoverFromStalledBoot` awaits up to two bounded steps before it actually
 * reloads the page, and the gate can resolve on its own during that window
 * (its Dexie read finally landing) — the mount stays alive long enough for
 * this cleanup to run before the reload cuts it off. `recoveryTapped: true`
 * marks that race.
 *
 * A no-op when no stall was ever reported: most unmounts are the ordinary
 * "gate resolved before ten seconds" case, and reporting on all of them
 * would swamp the one signal this exists for.
 */
export function reportBootStallResolved(recoveryTapped: boolean): void {
  if (reportedAt === undefined) return;
  const resolvedAfterMs = Date.now() - reportedAt;
  reportedAt = undefined;
  captureMessage('Boot stall resolved', {
    level: 'info',
    tags: { subsystem: 'boot' },
    extra: { resolvedAfterMs, recoveryTapped },
  });
}

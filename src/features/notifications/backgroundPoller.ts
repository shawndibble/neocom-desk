/**
 * SW-safe overrides for the Service Worker's `push` handler (ADR 0009; kept
 * from the retired Periodic Background Sync work, ADR 0007/issue #176): the
 * two `liveDependencies()` pieces that don't work unchanged inside a Service
 * Worker's global scope —
 * `Notification` has no constructor there, and there's no `Notification.permission`
 * getter to read. Everything else (Dexie, ESI fetch, the notification-event
 * registry/diff functions from #172) is plain module code shared as-is with
 * `runForegroundPoll`, so this file's only job is producing the two
 * SW-safe overrides. Kept out of `src/sw.ts` itself so it's unit-testable —
 * the SW file that wires it up is orchestration-only, per ADR 0007's
 * unit-testability carve-out.
 */
import { liveDependencies, notificationText } from './foregroundPoller';
import { notificationOptionsFor } from './notificationOptions';
import type { AnyNotificationFire, CharacterRef, PollDependencies } from './foregroundPoller';

/**
 * `registration.showNotification` is the SW-scope equivalent of `new
 * Notification(...)` — same fire-and-forget contract as
 * `sendBrowserNotification`: pollerState is persisted before the notify loop
 * runs (foregroundPoller.ts), so a rejected/throwing call here (permission
 * revoked mid-flight, an unsupported platform) must not abort the rest of
 * this poll's already-persisted fires.
 */
export async function sendBackgroundNotification(
  registration: ServiceWorkerRegistration,
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const { title, body } = await notificationText(fire, character);
    await registration.showNotification(
      title,
      notificationOptionsFor({ eventId: fire.eventId, characterId: character.characterId }, body)
    );
  } catch {
    // See doc comment above.
  }
}

/**
 * There is no `Notification.permission` to read from a Service Worker's
 * global scope. Treating `showNotification`'s existence as "granted" is the
 * closest available proxy: it degrades to a no-op via the try/catch above if
 * the browser disagrees at call time, rather than a wrong permission read
 * blocking every event this poll would otherwise have fired.
 */
export function backgroundPermission(
  registration: ServiceWorkerRegistration
): 'granted' | 'unsupported' {
  return typeof registration.showNotification === 'function' ? 'granted' : 'unsupported';
}

/**
 * `liveDependencies()` plus the two SW-safe overrides above. `configureEsi`
 * is not called here — the Service Worker is a separate module graph from
 * the page, so `src/sw.ts` wires it once at its own module scope, exactly
 * as `App.tsx` does for the page.
 */
export function backgroundDependencies(registration: ServiceWorkerRegistration): PollDependencies {
  return {
    ...liveDependencies(),
    permission: () => backgroundPermission(registration),
    notify: (fire, character) => sendBackgroundNotification(registration, fire, character),
  };
}

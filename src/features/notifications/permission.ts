/**
 * The browser notification grant (issue #171) — the one place that touches
 * `Notification.requestPermission()`, plus the pure rules deciding when the
 * one-time explainer appears and when Settings must say "blocked".
 *
 * Two different facts, deliberately kept apart:
 *
 * - **Has this device been offered the explainer yet** is ours to remember, so
 *   it lives in a device-local `settings` row (`useLocalSetting`, same category
 *   as `installPromptRules.ts` — never synced, because a grant is per-device).
 *   The answer the browser gave is stored alongside it, but only as a record.
 * - **Whether notifications are permitted right now** is the browser's to
 *   remember, and the user can change it in site settings at any time without
 *   telling us. So every decision reads `Notification.permission` live; the
 *   stored outcome is never a substitute for it.
 *
 * `requestNotificationPermission` is called from exactly one place — the
 * explainer's Enable button and Settings' Enable button, both of which are a
 * deliberate user tap. Nothing here fires on mount.
 */
import { useCallback, useEffect, useState } from 'react';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const NOTIFICATION_PERMISSION_PROMPT_KEY = 'notifications.permissionPrompt';

/** Live permission, widened with the browsers that have no Notification API. */
export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface NotificationPromptState {
  /** True once the explainer has been shown and acted on — once ever per device. */
  seen: boolean;
  /** What the browser answered the one time we asked; null until it was asked. */
  outcome: NotificationPermission | null;
}

export const DEFAULT_NOTIFICATION_PROMPT_STATE: NotificationPromptState = {
  seen: false,
  outcome: null,
};

const OUTCOMES: readonly string[] = ['granted', 'denied', 'default'];

function parsePromptState(raw: unknown): NotificationPromptState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.seen !== 'boolean') return null;
  if (r.outcome !== null && !OUTCOMES.includes(r.outcome as string)) return null;
  return { seen: r.seen, outcome: r.outcome as NotificationPermission | null };
}

export const useNotificationPromptState = createLocalSetting<NotificationPromptState>({
  key: NOTIFICATION_PERMISSION_PROMPT_KEY,
  defaultValue: DEFAULT_NOTIFICATION_PROMPT_STATE,
  parse: parsePromptState,
});

export function readNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * The single real permission request. Resolves to the resulting state rather
 * than throwing: legacy Safari hands back `undefined` (callback style) and a
 * blocked embed can reject outright, neither of which should surface as an
 * error to a user who just tapped a button.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return OUTCOMES.includes(result) ? result : readNotificationPermission();
  } catch {
    return readNotificationPermission();
  }
}

/**
 * The prompt row to persist once an ask has completed, wherever it was made
 * from. `seen` is set even on 'default' (the user dismissed the browser's own
 * prompt) — they have been offered it, which is what the flag records; and
 * 'unsupported' stores no outcome because no browser ever answered.
 */
export function promptStateAfterAsk(outcome: NotificationPermissionState): NotificationPromptState {
  return { seen: true, outcome: outcome === 'unsupported' ? null : outcome };
}

export function shouldShowPermissionExplainer(state: {
  hydrated: boolean;
  seen: boolean;
  hasCharacter: boolean;
  permission: NotificationPermissionState;
}): boolean {
  if (!state.hydrated || state.seen || !state.hasCharacter) return false;
  // 'granted'/'denied' mean the browser has already been asked on this origin,
  // and a denied grant can never be re-requested from JS — an explainer whose
  // Enable button would do nothing is worse than no explainer.
  return state.permission === 'default';
}

/**
 * A browser with no Notification API is *not* blocked — nothing was refused,
 * so the toggle UI stays as-is rather than accusing the user of denying
 * something. (This is also what jsdom looks like, which keeps issue #170's
 * Settings tests honest instead of quietly routing them down the notice path.)
 */
export function notificationsBlocked(permission: NotificationPermissionState): boolean {
  return permission === 'denied';
}

/**
 * The live permission, re-read whenever the user could have changed it behind
 * our back — flipping it in site settings never notifies the page, but it does
 * mean leaving and coming back. `navigator.permissions.query` would push those
 * changes instead of polling for them, but it is absent in jsdom and throws on
 * the 'notifications' name in Safari; a re-read on return covers the same case
 * with no branching.
 */
export function useNotificationPermission(): {
  permission: NotificationPermissionState;
  /** Re-read now — for right after a request this component itself made. */
  refresh: () => void;
} {
  const [permission, setPermission] = useState<NotificationPermissionState>(
    readNotificationPermission
  );
  const refresh = useCallback(() => setPermission(readNotificationPermission()), []);

  // The initial read is the `useState` initializer above; this only keeps up
  // with changes made outside the page.
  useEffect(() => {
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { permission, refresh };
}

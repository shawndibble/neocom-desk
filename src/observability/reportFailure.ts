import { captureException } from '@sentry/react';
import { isOnline } from '@/stores/network';
import { redactSecrets } from './scrub';

/** Infrastructure layer that failed. Sent as the `subsystem` tag, nothing else identifying. */
export type FailureSubsystem = 'sync' | 'esi' | 'auth' | 'backup';

/** Same message at most once per window, so a retry loop cannot burn Sentry quota. */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED = 100;
const lastReported = new Map<string, number>();

const NETWORK_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'network-request-failed',
  'network_error',
  'timeout',
]);

/**
 * Failures that say nothing about the app: offline, DNS, timeout, ESI never
 * answered (status 0), a Firebase backend that is unreachable.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!isOnline()) return true;
  if (
    error instanceof TypeError &&
    /^(failed to fetch|networkerror|network request failed|load failed)/i.test(error.message)
  )
    return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof code === 'string' && NETWORK_CODES.has(code.replace(/^[a-z]+\//, ''))) return true;
  return status === 0;
}

/**
 * A dead SSO grant (revoked or expired refresh token) is the player's state,
 * not a fault: the app already asks them to log in again. Matched by shape,
 * like `isNetworkFailure`, so this module imports nothing from `auth`.
 */
function isDeadGrant(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return name === 'AuthError' && code === 'invalid_grant';
}

/**
 * Report an unexpected sync/esi/auth/backup failure to Sentry. Skips network
 * failures, dead SSO grants and repeats of a message already sent this window. The message and
 * stack go through `scrubEvent` (`beforeSend`); only the subsystem is tagged —
 * never a token, email or character name.
 */
export function reportFailure(
  subsystem: FailureSubsystem,
  error: unknown,
  now: number = Date.now()
): void {
  if (isNetworkFailure(error) || isDeadGrant(error)) return;
  const message = error instanceof Error ? error.message : String(error);
  const key = `${subsystem}:${message}`;
  const last = lastReported.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
  if (lastReported.size >= MAX_TRACKED) {
    const oldest = lastReported.keys().next().value;
    if (oldest !== undefined) lastReported.delete(oldest);
  }
  lastReported.delete(key);
  lastReported.set(key, now);
  // A non-Error value serializes into `extra`, which `scrubEvent` does not walk.
  captureException(error instanceof Error ? error : new Error(redactSecrets(message)), {
    tags: { subsystem },
  });
}

/** Tests only. */
export function resetReportedFailures(): void {
  lastReported.clear();
}

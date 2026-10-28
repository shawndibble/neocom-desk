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
  // A pass that failed in several places at once: network only if every one was.
  if (error instanceof AggregateError) {
    if (error.errors.length === 0) return false;
    // Firestore rejects the requests that follow a failed token refresh as
    // `unauthenticated`: the same dropped connection, one step later.
    const anyNetwork = error.errors.some(isNetworkFailure);
    return error.errors.every((e) => isNetworkFailure(e) || (anyNetwork && isUnauthenticated(e)));
  }
  if (
    error instanceof TypeError &&
    /^(failed to fetch|networkerror|network request failed|load failed)/i.test(error.message)
  )
    return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof code === 'string' && NETWORK_CODES.has(code.replace(/^[a-z]+\//, ''))) return true;
  // Firestore Lite's own wrap of a fetch that threw (no response at all): the
  // missing status maps to `unknown`, the missing statusText to "undefined".
  if (
    code === 'unknown' &&
    error instanceof Error &&
    error.message === 'Request failed with error: undefined'
  )
    return true;
  return status === 0;
}

function isUnauthenticated(error: unknown): boolean {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' && code.replace(/^[a-z]+\//, '') === 'unauthenticated';
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
 * Extra Sentry tags for one failure, set by the code that knows what failed
 * (the sync pass knows which collections). Keyed by the error object, so it
 * needs no change to the error's shape or message. Values must be fixed
 * vocabulary — collection names, error codes — never user data.
 */
const annotations = new WeakMap<object, Record<string, string>>();

export function annotateFailure(error: unknown, tags: Record<string, string>): void {
  if (typeof error === 'object' && error !== null) annotations.set(error, tags);
}

/** Add a tag to a failure without losing the ones already on it, or its own `code`. */
export function addFailureTag(error: unknown, tags: Record<string, string>): void {
  annotateFailure(error, { ...failureAnnotation(error), ...tags });
}

/**
 * The annotation, or failing that the error's own `code` (a FirebaseError's
 * `functions/internal`, say): Sentry groups these by message, and "Request
 * failed with error: undefined" says nothing about what failed.
 */
export function failureAnnotation(error: unknown): Record<string, string> | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const annotated = annotations.get(error);
  if (annotated) return annotated;
  return codeTag(error);
}

function codeTag(error: object): Record<string, string> | undefined {
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? { error_codes: code } : undefined;
}

/**
 * `beforeSend`'s other half: an error that reaches Sentry by the global handlers
 * (an unhandled rejection, an error boundary) rather than `reportFailure` still
 * carries the tags its thrower put on it. The event's own tags win.
 */
export function tagAnnotatedEvent<E extends { tags?: Record<string, unknown> }>(
  event: E,
  original: unknown
): E {
  const annotated =
    typeof original === 'object' && original !== null ? annotations.get(original) : undefined;
  if (!annotated) return event;
  return { ...event, tags: { ...annotated, ...event.tags } };
}

/**
 * Report an unexpected sync/esi/auth/backup failure to Sentry. Skips network
 * failures, dead SSO grants and repeats of a message already sent this window.
 * The message and stack go through `scrubEvent` (`beforeSend`); only the subsystem is tagged —
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
    tags: { ...failureAnnotation(error), subsystem },
  });
}

/** Tests only. */
export function resetReportedFailures(): void {
  lastReported.clear();
}

/**
 * `beforeSend`'s filter for the `DatabaseClosedError` a blocked upgrade causes
 * on purpose: `db.ts` closes the connection, every pending read rejects, and
 * `upgradeBlockedReport` has already sent the one report that carries the
 * versions. The rejections add no diagnosis, only a duplicate issue.
 */
export function isClosedDatabaseEvent(event: {
  exception?: { values?: { type?: string }[] };
}): boolean {
  return event.exception?.values?.some((v) => v.type === 'DatabaseClosedError') ?? false;
}

/**
 * `beforeSend`'s filter for a bare `AbortError` that reaches the global
 * unhandled-rejection handler: a fetch or Firestore stream cancelled by a
 * navigation, a tab going to the background or Safari dropping the connection.
 * It has no stack and names nothing, and `isNetworkFailure` already treats the
 * same error as noise wherever the app catches it. Handled aborts never get
 * here; only the ones nothing awaited do.
 */
export function isStrayAbortEvent(event: {
  exception?: { values?: { value?: string; mechanism?: { type?: string } }[] };
}): boolean {
  return (
    event.exception?.values?.some(
      (v) =>
        v.mechanism?.type === 'auto.browser.global_handlers.onunhandledrejection' &&
        /^(Error: )?AbortError\b/.test(v.value ?? '')
    ) ?? false
  );
}

// Same wording as `DYNAMIC_IMPORT_FAILURE` in app/routeChunks.ts, kept apart: importing app code here
// reorders module loading for every test that mocks around it.
const CHUNK_LOAD_MESSAGE = /dynamically imported module|importing a module script failed/i;

/**
 * `beforeSend`'s half of the chunk-failure downgrade `main.tsx` does for React's
 * error hooks. The reports seen in production arrive by a path that never
 * passed through those hooks (a generic, handled capture with no
 * `chunk_load` tag), so the level is set here, where every path ends. A failed
 * chunk is the visitor's network, a blocker or a retired build the recovery
 * could not reload past; a burst of them after a deploy is what the
 * `chunk_load` tag is for.
 */
export function markChunkLoadFailure<
  E extends {
    level?: string;
    tags?: Record<string, unknown>;
    exception?: { values?: { type?: string; value?: string }[] };
  },
>(event: E): E {
  const failed = event.exception?.values?.some(
    (v) => v.type === 'TypeError' && CHUNK_LOAD_MESSAGE.test(v.value ?? '')
  );
  if (!failed) return event;
  return { ...event, level: 'warning', tags: { ...event.tags, chunk_load: 'failed' } };
}

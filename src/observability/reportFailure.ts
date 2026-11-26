import { captureException } from '@sentry/react';
import { isOnline } from '@/stores/network';
import { redactSecrets } from './scrub';

export type FailureSubsystem = 'sync' | 'esi' | 'auth' | 'backup';

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

export function isNetworkFailure(error: unknown): boolean {
  if (!isOnline()) return true;
  if (error instanceof AggregateError) {
    if (error.errors.length === 0) return false;
    const anyNetwork = error.errors.some(isNetworkFailure);
    return error.errors.every((e) => isNetworkFailure(e) || (anyNetwork && isUnauthenticated(e)));
  }
  if (
    error instanceof TypeError &&
    /^(failed to fetch|networkerror|network request failed|load failed)/i.test(error.message)
  )
    return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof Error && /without an in-progress transaction/.test(error.message))
    return true;
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof code === 'string' && NETWORK_CODES.has(code.replace(/^[a-z]+\//, ''))) return true;
  if (
    code === 'unknown' &&
    error instanceof Error &&
    /^(request failed with error: undefined$|typeerror: (failed to fetch|load failed|networkerror))/i.test(
      error.message
    )
  )
    return true;
  return status === 0;
}

function isUnauthenticated(error: unknown): boolean {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' && code.replace(/^[a-z]+\//, '') === 'unauthenticated';
}

function isDeadGrant(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return name === 'AuthError' && code === 'invalid_grant';
}

function isRemovedCharacter(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'UnknownCharacterError';
}

const annotations = new WeakMap<object, Record<string, string>>();

export function annotateFailure(error: unknown, tags: Record<string, string>): void {
  if (typeof error === 'object' && error !== null) annotations.set(error, tags);
}

export function addFailureTag(error: unknown, tags: Record<string, string>): void {
  annotateFailure(error, { ...failureAnnotation(error), ...tags });
}

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

export function tagAnnotatedEvent<E extends { tags?: Record<string, unknown> }>(
  event: E,
  original: unknown
): E {
  const annotated =
    typeof original === 'object' && original !== null ? annotations.get(original) : undefined;
  if (!annotated) return event;
  return { ...event, tags: { ...annotated, ...event.tags } };
}

export function reportFailure(
  subsystem: FailureSubsystem,
  error: unknown,
  now: number = Date.now()
): void {
  if (isNetworkFailure(error) || isDeadGrant(error) || isRemovedCharacter(error)) return;
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
  captureException(error instanceof Error ? error : new Error(redactSecrets(message)), {
    tags: { ...failureAnnotation(error), subsystem },
  });
}

export function resetReportedFailures(): void {
  lastReported.clear();
}

export function isClosedDatabaseEvent(event: {
  exception?: { values?: { type?: string }[] };
}): boolean {
  return event.exception?.values?.some((v) => v.type === 'DatabaseClosedError') ?? false;
}

const STRAY_REJECTION_VALUE =
  /^(Error: )?(AbortError\b|UnknownError: Attempt to get a record from database without an in-progress transaction)/;

export function isStrayAbortEvent(event: {
  exception?: { values?: { type?: string; value?: string; mechanism?: { type?: string } }[] };
}): boolean {
  return (
    event.exception?.values?.some(
      (v) =>
        v.mechanism?.type === 'auto.browser.global_handlers.onunhandledrejection' &&
        (v.type === 'AbortError' || STRAY_REJECTION_VALUE.test(v.value ?? ''))
    ) ?? false
  );
}

const CHUNK_LOAD_MESSAGE = /dynamically imported module|importing a module script failed/i;

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

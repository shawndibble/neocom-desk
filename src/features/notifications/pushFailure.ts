/**
 * Device-local record of the last failed Web Push registration or Scheduled
 * Push upload (issue #2844). Those paths are best-effort and used to fail with
 * only a `console.error`, so Settings showed alerts as on while nothing could
 * arrive. The record is a typed reason and a time — never the error message,
 * endpoint or token — and is not synced: it describes this device's browser.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PUSH_FAILURE_KEY = 'notifications.pushFailure';

export const PUSH_FAILURE_REASONS = [
  'browser-refused',
  'network',
  'server-rejected',
  'unknown',
] as const;
export type PushFailureReason = (typeof PUSH_FAILURE_REASONS)[number];

export interface PushFailure {
  reason: PushFailureReason;
  /** Epoch ms of the failure. */
  at: number;
}

export function classifyPushError(err: unknown): PushFailureReason {
  if (err instanceof TypeError) return 'network';
  if (typeof err !== 'object' || err === null) return 'unknown';
  if ((err as { name?: unknown }).name === 'NotAllowedError') return 'browser-refused';
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return 'unknown';
  if (code.startsWith('messaging/')) return 'browser-refused';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return 'network';
  if (code.startsWith('functions/')) return 'server-rejected';
  return 'unknown';
}

export function parsePushFailure(raw: unknown): PushFailure | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!PUSH_FAILURE_REASONS.includes(r.reason as PushFailureReason)) return null;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null;
  return { reason: r.reason as PushFailureReason, at: r.at };
}

export const usePushFailure = createLocalSetting<PushFailure | null>({
  key: PUSH_FAILURE_KEY,
  defaultValue: null,
  parse: parsePushFailure,
});

export function recordPushFailure(err: unknown, now = Date.now()): Promise<void> {
  return usePushFailure.getState().setValue({ reason: classifyPushError(err), at: now });
}

/** Records a failure with an already-known reason (a rejected, not thrown, result). */
function recordPushFailureReason(reason: PushFailureReason, now = Date.now()) {
  return usePushFailure.getState().setValue({ reason, at: now });
}

export function clearPushFailure(): Promise<void> {
  if (usePushFailure.getState().value === null) return Promise.resolve();
  return usePushFailure.getState().setValue(null);
}

/**
 * Files a `registerDeviceForWebPush` outcome. `null` means it did nothing (no
 * token, or `skipIfUnchanged` hit), which says nothing about a standing failure
 * either way — so it leaves the record alone.
 */
export function settlePushRegistration(
  result: { registered: readonly number[]; rejected: readonly number[] } | null
): void {
  if (result === null) return;
  // Only an every-character rejection is a failure: a partial one still
  // delivers for the characters that registered.
  const allRejected = result.registered.length === 0 && result.rejected.length > 0;
  void (allRejected ? recordPushFailureReason('server-rejected') : clearPushFailure());
}

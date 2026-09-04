/**
 * A stable per-device identifier for Web Push registration (issue #356).
 *
 * Deliberately NOT the FCM token itself: FCM tokens rotate, and the backend
 * doc for this device must be keyed by something that survives a rotation so
 * re-registering with a new token replaces the existing doc (a `set` on the
 * same key) instead of leaving the old token's doc behind to accumulate.
 *
 * Device-local only (localStorage, never synced) — a device registration is
 * inherently per-device, the same reasoning `permission.ts` applies to the
 * browser notification grant.
 */
const KEY = 'neocom.deviceId';

function mintId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older WebViews).
  // Not cryptographically strong — this id is a lookup key, not a secret.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = mintId();
  localStorage.setItem(KEY, id);
  return id;
}

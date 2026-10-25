// Quiet time (issue #4566): a device's daily window with no pushes. Pure: no
// Firestore, no FCM. The window lives on the device's registration doc; both
// send paths (pollEveNotifications.ts, projectionStore.ts) ask `suppressPush`.
// A suppressed push is skipped, not queued: the alert still reaches the Alerts
// list through the feed sync, which is separate from the push.

export interface QuietHours {
  /** `HH:MM`, 24h, in `timeZone`. */
  start: string;
  end: string;
  /** IANA zone, so the window follows the pilot's clock and DST, not UTC. */
  timeZone: string;
  /** Attack and loss notifications are still pushed inside the window. */
  allowAttacks: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function validZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Minutes since local midnight in `timeZone`, or null for an unknown zone. */
function localMinutes(nowMs: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(nowMs);
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const minutes = part('hour') * 60 + part('minute');
    return Number.isFinite(minutes) ? minutes : null;
  } catch {
    return null;
  }
}

/**
 * Whether `nowMs` falls in the window `[start, end)`. A window may cross
 * midnight. Equal start and end counts as off. A bad time or zone is not
 * quiet — a broken window must never silence a device — and never throws.
 */
export function isQuiet(
  nowMs: number,
  window: Pick<QuietHours, 'start' | 'end' | 'timeZone'>
): boolean {
  const start = minutesOf(window.start);
  const end = minutesOf(window.end);
  if (start === null || end === null || start === end) return false;
  const now = localMinutes(nowMs, window.timeZone);
  if (now === null) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * The ESI types that already default to a device pop-up: attack and loss
 * kinds. Mirrors `EVE_TYPES_BROWSER_ON_BY_DEFAULT` in
 * `src/features/notifications/eventSelection.ts`; `functions/` cannot import
 * from `src/`, so change one and change the other.
 */
const ATTACK_TYPES: ReadonlySet<string> = new Set([
  'StructureUnderAttack',
  'StructureLostShields',
  'StructureLostArmor',
  'StructureDestroyed',
  'OrbitalAttacked',
  'OrbitalReinforced',
  'CorpKicked',
]);

export function isAttackType(eveType: string | undefined): boolean {
  return eveType !== undefined && ATTACK_TYPES.has(eveType);
}

/** Notification Events that are a loss, let through with the attack types (issue #5121). */
const LOSS_EVENTS: ReadonlySet<string> = new Set(['shipLost']);

/**
 * True when a push for `eveType` (absent for a scheduled alert) or, for a
 * server-pushed event, `eventId` must not be sent now.
 */
export function suppressPush(
  nowMs: number,
  quietHours: QuietHours | undefined,
  eveType: string | undefined,
  eventId?: string
): boolean {
  if (!quietHours || !isQuiet(nowMs, quietHours)) return false;
  const lossOrAttack = isAttackType(eveType) || (eventId !== undefined && LOSS_EVENTS.has(eventId));
  return !(quietHours.allowAttacks && lossOrAttack);
}

/**
 * Validates the callable's raw `quietHours`. `undefined` (an older client)
 * leaves the stored window alone; `null` clears it. A bad value throws and is
 * never stored.
 */
export function parseQuietHours(raw: unknown): QuietHours | null | undefined {
  if (raw === undefined || raw === null) return raw;
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('quietHours must be an object');
  const { start, end, timeZone, allowAttacks } = raw as Record<string, unknown>;
  if (typeof start !== 'string' || minutesOf(start) === null) {
    throw new Error('quietHours.start must be HH:MM (24h)');
  }
  if (typeof end !== 'string' || minutesOf(end) === null) {
    throw new Error('quietHours.end must be HH:MM (24h)');
  }
  if (typeof timeZone !== 'string' || timeZone.length > 100 || !validZone(timeZone)) {
    throw new Error('quietHours.timeZone must be a valid IANA time zone');
  }
  if (allowAttacks !== undefined && typeof allowAttacks !== 'boolean') {
    throw new Error('quietHours.allowAttacks, if present, must be a boolean');
  }
  return { start, end, timeZone, allowAttacks: allowAttacks ?? false };
}

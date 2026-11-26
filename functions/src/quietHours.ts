export interface QuietHours {
  start: string;
  end: string;
  timeZone: string;
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

const LOSS_EVENTS: ReadonlySet<string> = new Set(['shipLost']);

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

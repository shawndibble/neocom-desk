import { DAY_MS } from '@/lib/age';

export const DARK_AFTER_DAYS = 30;

export const DARK_AFTER_MS = DARK_AFTER_DAYS * DAY_MS;

export interface MemberActivity {
  characterId: number;
  logonMs: number | null;
  logoffMs: number | null;
  startMs: number | null;
  shipTypeId: number | null;
  locationId: number | null;
}

export interface MemberStanding {
  characterId: number;
  lastSeenMs: number | null;
  neverSeen: boolean;
  darkForMs: number | null;
  isDark: boolean;
}

function later(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

export function memberStanding(
  member: MemberActivity,
  nowMs: number,
  darkAfterDays: number = DARK_AFTER_DAYS
): MemberStanding {
  const lastSeenMs = later(member.logonMs, member.logoffMs);
  const since = lastSeenMs ?? member.startMs;
  const darkForMs = since === null ? null : nowMs - since;
  return {
    characterId: member.characterId,
    lastSeenMs,
    neverSeen: lastSeenMs === null,
    darkForMs,
    isDark: darkForMs !== null && darkForMs >= darkAfterDays * DAY_MS,
  };
}

export interface RosterDiff {
  readonly joined: readonly number[];
  readonly left: readonly number[];
}

export const EMPTY_ROSTER_DIFF: RosterDiff = { joined: [], left: [] };

export function diffRoster(
  prev: readonly number[] | undefined,
  next: readonly number[]
): RosterDiff {
  if (prev === undefined) return EMPTY_ROSTER_DIFF;
  const before = new Set(prev);
  const after = new Set(next);
  const ascending = (a: number, b: number) => a - b;
  return {
    joined: [...after].filter((id) => !before.has(id)).sort(ascending),
    left: [...before].filter((id) => !after.has(id)).sort(ascending),
  };
}

export function isEmptyRosterDiff(diff: RosterDiff): boolean {
  return diff.joined.length === 0 && diff.left.length === 0;
}

export const DASH = '—';

export function label(name: string | null, id: number | null): string {
  if (name !== null) return name;
  return id === null ? DASH : `#${id}`;
}

export interface RosterSearchFields {
  name: string | null;
  shipName: string | null;
  locationName: string | null;
}

export function filterRosterRows<T extends RosterSearchFields>(
  rows: readonly T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) =>
    [row.name, row.shipName, row.locationName].some(
      (field) => field !== null && field.toLowerCase().includes(q)
    )
  );
}

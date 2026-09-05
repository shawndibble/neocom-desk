/**
 * Who is in this corporation, and are they still here (issue #297).
 *
 * Two questions, two halves of this module:
 *
 * - **Standing** — how long a member has been unaccounted for. `membertracking`
 *   reports `logon_date` and `logoff_date` separately and omits both for a
 *   Character who has never played, so "last seen" is a derivation, not a
 *   field, and "gone dark" is a threshold — which lives here as a named
 *   constant rather than as a number repeated through the view.
 * - **Roster diff** — who joined and who left since the last look. `/members`
 *   is a bare id list with no join or leave event of its own, so the only way
 *   to see the change is to compare two reads. Pure, and here rather than in a
 *   component, because #299's Member Joined / Member Left events consume the
 *   same function.
 *
 * Engine-native shapes only (ARCHITECTURE.md): epoch milliseconds in, never
 * ESI's ISO strings — `features/corp/members.ts` adapts at the boundary.
 */

/**
 * Days without a login after which a member is called dark.
 *
 * Thirty because that is the span a corp's own inactivity policy is written in
 * — "no login in a month" is the sentence a recruiter or a director actually
 * says — and because a month is long enough to survive a holiday, which a
 * fortnight is not. One constant so the table's tone, the summary's count and
 * any later notification all agree on what dark means; a second opinion
 * anywhere else in the UI would be a bug on its face.
 */
export const DARK_AFTER_DAYS = 30;

/** `DARK_AFTER_DAYS` in milliseconds, the unit every span here is measured in. */
export const DARK_AFTER_MS = DARK_AFTER_DAYS * 86_400_000;

/**
 * One member's activity, as the tracking read describes them.
 *
 * Every field but the id is nullable because ESI genuinely omits every one of
 * them: a Character who joined and never undocked has no logon, no logoff, no
 * ship and no location. `null` here means "ESI said nothing", never zero.
 */
export interface MemberActivity {
  characterId: number;
  /** Epoch ms of the last session start, or null when none was reported. */
  logonMs: number | null;
  /** Epoch ms of the last session end, or null when none was reported. */
  logoffMs: number | null;
  /** Epoch ms this Character joined the corporation. */
  startMs: number | null;
  shipTypeId: number | null;
  locationId: number | null;
}

/** What the roster table sorts, tones and counts by. */
export interface MemberStanding {
  characterId: number;
  /**
   * The later of the two session dates, or null for a member who has never
   * logged in. Not "the logoff": a member who is online right now has a logon
   * *after* their last logoff, and reading only the logoff would report them as
   * absent since the previous session.
   */
  lastSeenMs: number | null;
  /**
   * ESI reported no session at all — joined and never played, which is a
   * different fact from "last seen a long time ago" and the one a recruiter is
   * actually looking for. Kept separate from `darkForMs` so the view can say
   * "Never" rather than printing a span from a date that is not a login.
   */
  neverSeen: boolean;
  /**
   * How long this member has been unaccounted for, in ms — since their last
   * session, or, for one who has never had a session, since they joined. Null
   * only when neither date is known, which is the one case nothing can be
   * claimed about.
   *
   * **Unclamped**, deliberately, on the `engine/corp/board.ts` precedent: a
   * client clock running ahead of ESI's would otherwise collapse every skewed
   * member into one tie at zero. Rounding a negative span away is display's
   * job.
   */
  darkForMs: number | null;
  /** `darkForMs` has reached `DARK_AFTER_MS`. False whenever the span is unknown. */
  isDark: boolean;
}

/** The later of two possibly-absent instants; null when both are absent. */
function later(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * One member's standing at `nowMs`.
 *
 * The join date is the fallback measure rather than an unrelated fact: a
 * Character who joined forty days ago and has never logged in has been dark for
 * forty days by any reading a director cares about, and letting them fall out
 * of the dark count merely because they have no logon to subtract from would
 * hide exactly the recruit the page exists to surface.
 */
export function memberStanding(member: MemberActivity, nowMs: number): MemberStanding {
  const lastSeenMs = later(member.logonMs, member.logoffMs);
  const since = lastSeenMs ?? member.startMs;
  const darkForMs = since === null ? null : nowMs - since;
  return {
    characterId: member.characterId,
    lastSeenMs,
    neverSeen: lastSeenMs === null,
    darkForMs,
    isDark: darkForMs !== null && darkForMs >= DARK_AFTER_MS,
  };
}

/** Who appeared in the roster and who dropped out of it, since the last read. */
export interface RosterDiff {
  readonly joined: readonly number[];
  readonly left: readonly number[];
}

/** No change — and the answer whenever there is no baseline to compare against. */
export const EMPTY_ROSTER_DIFF: RosterDiff = { joined: [], left: [] };

/**
 * The roster change between two reads of `/corporations/{id}/members`.
 *
 * `prev === undefined` means "no previous read to compare against" — a first
 * visit, or a fresh device — and answers no change at all, on
 * `engine/notificationDiffs.ts`'s precedent: the alternative is to announce
 * every one of two hundred members as a new joiner the first time the page is
 * opened. An empty *array* is the opposite: a corporation observed with no
 * members, against which the next read's whole roster genuinely did join.
 *
 * Ids come back deduplicated and ascending so the result is a function of the
 * two sets and not of the order ESI happened to paginate them in — the summary
 * above the table must not reshuffle between reads that saw the same change.
 */
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

/**
 * Nothing moved. AC6: a roster unchanged since the last visit shows no
 * joins/leaves summary at all, rather than an empty one announcing that nothing
 * happened.
 */
export function isEmptyRosterDiff(diff: RosterDiff): boolean {
  return diff.joined.length === 0 && diff.left.length === 0;
}

/** The repo's placeholder for a cell with nothing in it (Contacts, Characters). */
export const DASH = '—';

/**
 * A name we could not resolve degrades to the id, never to a blank cell.
 * Lives here (not `CorpRoster.tsx`) so the table cell, the row context menu's
 * Copy Character Name, and the CSV export all agree on what a member's name
 * is — and so a plain function can live next to `filterRosterRows` without
 * tripping react-refresh's one-component-per-file rule on the view.
 */
export function label(name: string | null, id: number | null): string {
  if (name !== null) return name;
  return id === null ? DASH : `#${id}`;
}

/**
 * The three fields the roster search box matches against (issue #421). A
 * structural subset rather than an import of the view's `RosterRow` — the
 * engine layer does not depend on `features/`.
 */
export interface RosterSearchFields {
  name: string | null;
  shipName: string | null;
  locationName: string | null;
}

/**
 * Name/ship/location filter for the roster table, on the
 * `filterCorpAssetGroups` precedent (`engine/corp/assetDivisions.ts`):
 * lowercase substring match, empty query matches everything. A `null` field
 * (unresolved name, docked-nowhere member) never matches rather than being
 * coerced to a matchable string.
 */
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

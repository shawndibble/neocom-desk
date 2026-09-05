import { describe, it, expect } from 'vitest';
import {
  DARK_AFTER_DAYS,
  DARK_AFTER_MS,
  EMPTY_ROSTER_DIFF,
  diffRoster,
  filterRosterRows,
  isEmptyRosterDiff,
  memberStanding,
  type MemberActivity,
  type RosterSearchFields,
} from './members';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;

const ago = (ms: number) => NOW - ms;

function member(overrides: Partial<MemberActivity> = {}): MemberActivity {
  return {
    characterId: 90000001,
    logonMs: ago(2 * HOUR),
    logoffMs: ago(HOUR),
    startMs: ago(400 * DAY),
    shipTypeId: 587,
    locationId: 60003760,
    ...overrides,
  };
}

describe('DARK_AFTER_MS', () => {
  it('is DARK_AFTER_DAYS expressed in milliseconds', () => {
    expect(DARK_AFTER_MS).toBe(DARK_AFTER_DAYS * DAY);
  });
});

describe('memberStanding', () => {
  it('takes last seen as the later of logon and logoff', () => {
    const standing = memberStanding(member({ logonMs: ago(2 * HOUR), logoffMs: ago(HOUR) }), NOW);
    expect(standing.lastSeenMs).toBe(ago(HOUR));
  });

  it('takes the logon when it is the later of the two — a member still online', () => {
    const standing = memberStanding(member({ logonMs: ago(HOUR), logoffMs: ago(3 * HOUR) }), NOW);
    expect(standing.lastSeenMs).toBe(ago(HOUR));
  });

  it('falls back to the logon when ESI reported no logoff', () => {
    const standing = memberStanding(member({ logonMs: ago(5 * HOUR), logoffMs: null }), NOW);
    expect(standing.lastSeenMs).toBe(ago(5 * HOUR));
    expect(standing.neverSeen).toBe(false);
  });

  it('reports a member who has never logged in as never seen, not as seen long ago', () => {
    const standing = memberStanding(member({ logonMs: null, logoffMs: null }), NOW);
    expect(standing.neverSeen).toBe(true);
    expect(standing.lastSeenMs).toBeNull();
  });

  it('measures the dark span from the last login', () => {
    const standing = memberStanding(member({ logonMs: ago(9 * DAY), logoffMs: ago(9 * DAY) }), NOW);
    expect(standing.darkForMs).toBe(9 * DAY);
  });

  it('measures a never-logged-in member from the day they joined', () => {
    const standing = memberStanding(
      member({ logonMs: null, logoffMs: null, startMs: ago(45 * DAY) }),
      NOW
    );
    expect(standing.darkForMs).toBe(45 * DAY);
    expect(standing.isDark).toBe(true);
  });

  it('leaves the dark span unknown when neither a login nor a join date was reported', () => {
    const standing = memberStanding(member({ logonMs: null, logoffMs: null, startMs: null }), NOW);
    expect(standing.darkForMs).toBeNull();
    expect(standing.isDark).toBe(false);
  });

  it('does not call a member dark just under the threshold', () => {
    const seen = ago(DARK_AFTER_MS - 1);
    const standing = memberStanding(member({ logonMs: seen, logoffMs: seen }), NOW);
    expect(standing.isDark).toBe(false);
  });

  it('calls a member dark once the threshold is reached', () => {
    const seen = ago(DARK_AFTER_MS);
    const standing = memberStanding(member({ logonMs: seen, logoffMs: seen }), NOW);
    expect(standing.isDark).toBe(true);
  });

  it('does not call a member who joined yesterday and has not logged in dark', () => {
    const standing = memberStanding(
      member({ logonMs: null, logoffMs: null, startMs: ago(DAY) }),
      NOW
    );
    expect(standing.neverSeen).toBe(true);
    expect(standing.isDark).toBe(false);
  });

  it('keeps the character id so a standing can be joined back to its row', () => {
    expect(memberStanding(member({ characterId: 42 }), NOW).characterId).toBe(42);
  });

  it('leaves a future last-seen negative rather than clamping it', () => {
    // Clock skew between the client and ESI. Clamping here would make every
    // skewed member tie at zero in the sort; display is where a negative span
    // is rounded away.
    const standing = memberStanding(member({ logonMs: NOW + HOUR, logoffMs: NOW + HOUR }), NOW);
    expect(standing.darkForMs).toBe(-HOUR);
    expect(standing.isDark).toBe(false);
  });
});

describe('diffRoster', () => {
  it('reports nothing at all without a previous roster to compare against', () => {
    expect(diffRoster(undefined, [1, 2, 3])).toEqual(EMPTY_ROSTER_DIFF);
  });

  it('treats a previously empty roster as a real baseline, not as no baseline', () => {
    expect(diffRoster([], [1, 2])).toEqual({ joined: [1, 2], left: [] });
  });

  it('reports nothing for an unchanged roster', () => {
    const diff = diffRoster([3, 1, 2], [1, 2, 3]);
    expect(diff).toEqual(EMPTY_ROSTER_DIFF);
    expect(isEmptyRosterDiff(diff)).toBe(true);
  });

  it('reports the ids that appeared', () => {
    expect(diffRoster([1, 2], [1, 2, 5])).toEqual({ joined: [5], left: [] });
  });

  it('reports the ids that disappeared', () => {
    expect(diffRoster([1, 2, 5], [1, 2])).toEqual({ joined: [], left: [5] });
  });

  it('reports both halves of a swap', () => {
    expect(diffRoster([1, 2], [2, 7])).toEqual({ joined: [7], left: [1] });
  });

  it('returns each id once and in a stable order regardless of input order', () => {
    expect(diffRoster([1, 1, 2], [2, 9, 4, 9])).toEqual({ joined: [4, 9], left: [1] });
  });

  it('calls a diff with either half populated non-empty', () => {
    expect(isEmptyRosterDiff({ joined: [1], left: [] })).toBe(false);
    expect(isEmptyRosterDiff({ joined: [], left: [1] })).toBe(false);
  });
});

describe('filterRosterRows', () => {
  function row(overrides: Partial<RosterSearchFields> = {}): RosterSearchFields {
    return {
      name: 'Jita Local',
      shipName: 'Rifter',
      locationName: 'Jita IV - Moon 4',
      ...overrides,
    };
  }

  it('returns every row, unmodified, for an empty query', () => {
    const rows = [row(), row({ name: 'Silent Ren' })];
    expect(filterRosterRows(rows, '')).toEqual(rows);
  });

  it('treats a whitespace-only query as empty', () => {
    const rows = [row()];
    expect(filterRosterRows(rows, '   ')).toEqual(rows);
  });

  it('matches case-insensitively on the member name', () => {
    const rows = [
      row({ name: 'Jita Local', shipName: null, locationName: null }),
      row({ name: 'Silent Ren', shipName: null, locationName: null }),
    ];
    expect(filterRosterRows(rows, 'jita')).toEqual([rows[0]]);
  });

  it('matches on ship name', () => {
    const rows = [row({ shipName: 'Rifter' }), row({ shipName: 'Merlin' })];
    expect(filterRosterRows(rows, 'merlin')).toEqual([rows[1]]);
  });

  it('matches on location name', () => {
    const rows = [row({ locationName: 'Jita IV - Moon 4' }), row({ locationName: 'Amarr VIII' })];
    expect(filterRosterRows(rows, 'amarr')).toEqual([rows[1]]);
  });

  it('never matches a null field', () => {
    const rows = [row({ name: null, shipName: null, locationName: null })];
    expect(filterRosterRows(rows, 'jita')).toEqual([]);
  });

  it('drops a row that matches nothing', () => {
    expect(filterRosterRows([row()], 'caldari')).toEqual([]);
  });
});

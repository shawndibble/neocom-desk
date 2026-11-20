/**
 * The Members page's Players view as a flat row list (ADR: players in two layers). Pure: no
 * fetch/DOM/Dexie imports. Each stored Miner group with a corporation member becomes a Player
 * parent row, followed by its characters when open; members in no group stay single rows.
 *
 * A Player's "last seen" is the latest of its characters that are in the corporation: a character
 * outside it has no activity here, so it is excluded from the aggregate and shown as "No data".
 *
 * Sorting is per Player: a column orders the Player rows and loose members by what the row shows
 * (Member: the main's name; Last seen: the latest in-corp sighting; any other column: the main's own
 * value). Alts stay under their parent in a fixed order, and an outside character never drives it.
 */
import type { MemberStanding } from '@/engine/corp/members';
import { sortRowsBy } from '@/components/ui/dataTableSort';

/** A stored Miner group as the roster reads it (the optional lists are the Player-slice claim state). */
export interface PlayerGroup {
  id: string;
  mainCharacterId: number;
  characterIds: readonly number[];
  /** Officer claims: billed with the group, not signed in as themselves yet. */
  officerClaimed?: readonly number[];
  /** LEGACY: waiting on the old guest confirmation. */
  pendingConfirmation?: readonly number[];
  provenCharacterIds?: readonly number[];
}

export type CharacterChip = 'unsigned' | 'pending' | 'declined' | 'conflict';

/** The least a roster row must carry for this builder. */
export interface PlayerSourceRow {
  characterId: number;
  name: string | null;
  standing: MemberStanding;
}

export interface PlayerLine<R extends PlayerSourceRow> {
  /** `p:<group>` for a Player, `p:<group>:<id>` for its other characters, `c:<id>` for a lone member. */
  key: string;
  kind: 'player' | 'alt' | 'loose';
  groupId: string | null;
  group: PlayerGroup | null;
  /** The group holds at least one character that is in the corporation. */
  groupHasMember: boolean;
  /** This row's own character (a Player's is its main). */
  characterId: number;
  name: string;
  /** The character's roster row; null for one outside the corporation. */
  member: R | null;
  outside: boolean;
  /** In the order they read: not signed in, pending, declined, conflict. */
  chips: CharacterChip[];
  /** Player only. */
  expanded: boolean;
  characterCount: number;
  outsideCount: number;
  unsignedCount: number;
  /** Player only: the roster row of its latest-seen corporation character, whose standing is the Player's. */
  seen: R | null;
}

export interface PlayerLinesInput<R extends PlayerSourceRow> {
  /** The whole roster, unfiltered. */
  rows: readonly R[];
  groups: readonly PlayerGroup[];
  /** Names for characters that are not on the roster. */
  names: ReadonlyMap<number, string>;
  /** Roster characters that pass the search and every filter. */
  matchedIds: ReadonlySet<number>;
  /** Whether an outside character's name is a search hit (never while a ship/place/dark filter is on). */
  outsideMatches: (name: string) => boolean;
  /** A search or filter is on: matching Players open themselves and stay open. */
  filtering: boolean;
  /** Group-row keys the reader opened. */
  expanded: ReadonlySet<string>;
  /** A `?highlight` character id (it keys the row; opening its Player is the view's job). */
  highlightId: number | null;
  conflictIds?: ReadonlySet<number>;
  declinedIds?: ReadonlySet<number>;
  /** Column and direction; default Last seen, most recent first (the roster's `?sort=`). */
  sort?: { columnId: string; direction: 'asc' | 'desc' };
  /** A column's sort value for a roster row (every column but Member and Last seen). */
  columnValue?: (columnId: string, row: R) => string | number | undefined;
}

/** The label for a character nobody has named yet. The one fallback every roster name lookup shares. */
export const unknownCharacterName = (id: number): string => `#${id}`;

/** Most recently seen first: an unknown span sorts last. */
const byRecency = (a: PlayerSourceRow | null, b: PlayerSourceRow | null): number => {
  const x = a?.standing.darkForMs ?? Number.POSITIVE_INFINITY;
  const y = b?.standing.darkForMs ?? Number.POSITIVE_INFINITY;
  return x === y ? 0 : x < y ? -1 : 1;
};

export function buildPlayerLines<R extends PlayerSourceRow>(
  input: PlayerLinesInput<R>
): { lines: PlayerLine<R>[]; highlightKey: string | null; highlightPlayerKey: string | null } {
  const byId = new Map(input.rows.map((r) => [r.characterId, r]));
  const nameOf = (id: number) =>
    byId.get(id)?.name ?? input.names.get(id) ?? unknownCharacterName(id);
  const chipsOf = (g: PlayerGroup | null, id: number): CharacterChip[] => {
    const chips: CharacterChip[] = [];
    if (g?.officerClaimed?.includes(id)) chips.push('unsigned');
    if (g?.pendingConfirmation?.includes(id)) chips.push('pending');
    if (input.declinedIds?.has(id)) chips.push('declined');
    if (input.conflictIds?.has(id)) chips.push('conflict');
    return chips;
  };

  // Each character sits in the first group that holds it; a group left with one character is no Player.
  const placed = new Set<number>();
  const players: { group: PlayerGroup; ids: number[] }[] = [];
  for (const group of input.groups) {
    const ids = [...new Set(group.characterIds)].filter((id) => !placed.has(id));
    if (ids.length < 2 || !ids.some((id) => byId.has(id))) continue;
    for (const id of ids) placed.add(id);
    players.push({ group, ids });
  }

  const entries: {
    sort: R | null;
    name: string;
    main: R | null;
    lines: PlayerLine<R>[];
  }[] = [];
  let highlightKey: string | null = null;
  let highlightPlayerKey: string | null = null;

  for (const { group, ids } of players) {
    const main = ids.includes(group.mainCharacterId) ? group.mainCharacterId : ids[0];
    const members = ids.filter((id) => byId.has(id));
    const seen = [...members].map((id) => byId.get(id)!).sort(byRecency)[0] ?? null;
    const hit =
      members.some((id) => input.matchedIds.has(id)) ||
      ids.some((id) => !byId.has(id) && input.outsideMatches(nameOf(id)));
    if (input.filtering && !hit) continue;

    const key = `p:${group.id}`;
    // A highlight does not force the Player open (that would pin it): it is reported in
    // `highlightPlayerKey` so the view can seed the reader's own expansion once.
    const open = input.filtering || input.expanded.has(key);

    const base = {
      groupId: group.id,
      group,
      groupHasMember: members.length > 0,
      expanded: false,
      characterCount: ids.length,
      outsideCount: ids.length - members.length,
      unsignedCount: ids.filter((id) => group.officerClaimed?.includes(id)).length,
      seen: null,
    };
    const lines: PlayerLine<R>[] = [
      {
        ...base,
        key,
        kind: 'player',
        characterId: main,
        name: nameOf(main),
        member: byId.get(main) ?? null,
        outside: !byId.has(main),
        chips: [],
        expanded: open,
        seen,
      },
    ];
    if (open) {
      const others = ids.filter((id) => id !== main);
      const inCorp = others
        .filter((id) => byId.has(id))
        .sort((a, b) => byRecency(byId.get(a)!, byId.get(b)!));
      for (const id of [...inCorp, ...others.filter((id) => !byId.has(id))]) {
        lines.push({
          ...base,
          key: `${key}:${id}`,
          kind: 'alt',
          characterId: id,
          name: nameOf(id),
          member: byId.get(id) ?? null,
          outside: !byId.has(id),
          chips: chipsOf(group, id),
          characterCount: 0,
          outsideCount: 0,
          unsignedCount: 0,
        });
      }
    }
    if (input.highlightId === main) highlightKey = key;
    else if (input.highlightId !== null && ids.includes(input.highlightId)) {
      highlightKey = `${key}:${input.highlightId}`;
      highlightPlayerKey = key;
    }
    entries.push({ sort: seen, name: nameOf(main), main: byId.get(main) ?? null, lines });
  }

  for (const r of input.rows) {
    if (placed.has(r.characterId)) continue;
    if (input.filtering && !input.matchedIds.has(r.characterId)) continue;
    const key = `c:${r.characterId}`;
    if (input.highlightId === r.characterId) highlightKey = key;
    entries.push({
      sort: r,
      name: nameOf(r.characterId),
      main: r,
      lines: [
        {
          key,
          kind: 'loose',
          groupId: null,
          group: null,
          groupHasMember: false,
          characterId: r.characterId,
          name: nameOf(r.characterId),
          member: r,
          outside: false,
          chips: chipsOf(null, r.characterId),
          expanded: false,
          characterCount: 0,
          outsideCount: 0,
          unsignedCount: 0,
          seen: null,
        },
      ],
    });
  }

  // Recency then name is the tie order; the column sort is stable on top of it.
  entries.sort((a, b) => byRecency(a.sort, b.sort) || a.name.localeCompare(b.name));
  const { columnId, direction } = input.sort ?? { columnId: 'lastSeen', direction: 'desc' };
  const valueOf = (e: (typeof entries)[number]): string | number | undefined => {
    if (columnId === 'member') return e.name;
    if (columnId === 'lastSeen') {
      const ms = e.sort?.standing.darkForMs;
      return ms === null || ms === undefined ? undefined : -ms;
    }
    return e.main ? input.columnValue?.(columnId, e.main) : undefined;
  };
  const sorted = sortRowsBy(entries, valueOf, direction);
  return { lines: sorted.flatMap((e) => e.lines), highlightKey, highlightPlayerKey };
}

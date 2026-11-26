import type { MemberStanding } from '@/engine/corp/members';
import { sortRowsBy } from '@/components/ui/dataTableSort';

export interface PlayerGroup {
  id: string;
  mainCharacterId: number;
  characterIds: readonly number[];
  officerClaimed?: readonly number[];
  pendingConfirmation?: readonly number[];
  provenCharacterIds?: readonly number[];
}

export type CharacterChip = 'unsigned' | 'pending' | 'declined' | 'conflict';

export interface PlayerSourceRow {
  characterId: number;
  name: string | null;
  standing: MemberStanding;
}

export interface PlayerLine<R extends PlayerSourceRow> {
  key: string;
  kind: 'player' | 'alt' | 'loose';
  groupId: string | null;
  group: PlayerGroup | null;
  groupHasMember: boolean;
  characterId: number;
  name: string;
  member: R | null;
  outside: boolean;
  chips: CharacterChip[];
  expanded: boolean;
  characterCount: number;
  outsideCount: number;
  unsignedCount: number;
  seen: R | null;
}

export interface PlayerLinesInput<R extends PlayerSourceRow> {
  rows: readonly R[];
  groups: readonly PlayerGroup[];
  names: ReadonlyMap<number, string>;
  matchedIds: ReadonlySet<number>;
  outsideMatches: (name: string) => boolean;
  filtering: boolean;
  expanded: ReadonlySet<string>;
  highlightId: number | null;
  conflictIds?: ReadonlySet<number>;
  declinedIds?: ReadonlySet<number>;
  sort?: { columnId: string; direction: 'asc' | 'desc' };
  columnValue?: (columnId: string, row: R) => string | number | undefined;
}

export const unknownCharacterName = (id: number): string => `#${id}`;

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

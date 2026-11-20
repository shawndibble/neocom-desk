import { describe, expect, it } from 'vitest';
import type { MemberStanding } from '@/engine/corp/members';
import { buildPlayerLines, type PlayerGroup, type PlayerLinesInput } from './playerRows';

interface Row {
  characterId: number;
  name: string | null;
  standing: MemberStanding;
}

const HOUR = 3_600_000;
/** hours: since last seen; null = never seen. Dark from 7 days. */
function row(characterId: number, name: string, hours: number | null): Row {
  const darkForMs = hours === null ? 400 * 24 * HOUR : hours * HOUR;
  return {
    characterId,
    name,
    standing: {
      characterId,
      lastSeenMs: hours === null ? null : 1_000_000 - darkForMs,
      neverSeen: hours === null,
      darkForMs,
      isDark: darkForMs >= 7 * 24 * HOUR,
    },
  };
}

const rows = [
  row(1, 'Kestrel Vane', 2),
  row(2, 'Vane Hauler', 24),
  row(3, 'Vane Miner Two', 9 * 24),
  row(5, 'Sora Tenn', 5),
  row(10, 'Lena Voss', 0.3),
  row(11, 'Ravi Kade', 31 * 24),
  row(12, 'Ingrid Sol', null),
];
const names = new Map([
  [4, 'Outer Rim Vane'],
  [6, 'Sora Of Elsewhere'],
]);
const kestrel: PlayerGroup = {
  id: 'solo:1',
  mainCharacterId: 1,
  characterIds: [1, 2, 3, 4],
  officerClaimed: [4],
};
const sora: PlayerGroup = {
  id: 'solo:5',
  mainCharacterId: 5,
  characterIds: [5, 6],
  provenCharacterIds: [6],
};

function build(over: Partial<PlayerLinesInput<Row>> = {}) {
  return buildPlayerLines<Row>({
    rows,
    groups: [kestrel, sora],
    names,
    matchedIds: new Set(rows.map((r) => r.characterId)),
    outsideMatches: () => false,
    filtering: false,
    expanded: new Set<string>(),
    highlightId: null,
    ...over,
  });
}

describe('buildPlayerLines', () => {
  it('lists Players and ungrouped members by recency, parents folded by default', () => {
    const { lines } = build();
    expect(lines.map((l) => [l.kind, l.name])).toEqual([
      ['loose', 'Lena Voss'],
      ['player', 'Kestrel Vane'],
      ['player', 'Sora Tenn'],
      ['loose', 'Ravi Kade'],
      ['loose', 'Ingrid Sol'],
    ]);
  });

  it('summarises a Player: characters, outside, not signed in, latest seen of corp members only', () => {
    const kes = build().lines.find((l) => l.key === 'p:solo:1')!;
    expect(kes.characterCount).toBe(4);
    expect(kes.outsideCount).toBe(1);
    expect(kes.unsignedCount).toBe(1);
    expect(kes.seen?.characterId).toBe(1);
    expect(kes.expanded).toBe(false);
  });

  it('latest seen ignores an outside character and a silent main', () => {
    const only = build({
      rows: [row(1, 'Kestrel Vane', 40 * 24), row(2, 'Vane Hauler', 3 * 24)],
      groups: [{ id: 'g', mainCharacterId: 1, characterIds: [1, 2, 4] }],
    });
    expect(only.lines[0].seen?.characterId).toBe(2);
  });

  it('expands to the alts: corp members by recency, outside last, with chips', () => {
    const { lines } = build({ expanded: new Set(['p:solo:1']) });
    const alts = lines.filter((l) => l.kind === 'alt' && l.groupId === 'solo:1');
    expect(alts.map((a) => a.name)).toEqual(['Vane Hauler', 'Vane Miner Two', 'Outer Rim Vane']);
    const outside = alts[2];
    expect(outside.outside).toBe(true);
    expect(outside.member).toBeNull();
    expect(outside.chips).toEqual(['unsigned']);
    expect(alts[0].chips).toEqual([]);
    expect(alts[0].member?.characterId).toBe(2);
  });

  it('marks legacy pending, declined and conflicting characters', () => {
    const { lines } = build({
      expanded: new Set(['p:solo:1']),
      groups: [{ ...kestrel, officerClaimed: [], pendingConfirmation: [3] }, sora],
      conflictIds: new Set([2]),
      declinedIds: new Set([11, 12]),
    });
    expect(lines.find((l) => l.characterId === 3)?.chips).toEqual(['pending']);
    expect(lines.find((l) => l.characterId === 2)?.chips).toEqual(['conflict']);
    expect(lines.find((l) => l.characterId === 11)?.chips).toEqual(['declined']);
  });

  it('places a character claimed by two groups under the first only', () => {
    const { lines } = build({
      expanded: new Set(['p:solo:1', 'p:solo:5']),
      groups: [kestrel, { id: 'solo:5', mainCharacterId: 5, characterIds: [5, 2] }],
    });
    expect(lines.filter((l) => l.characterId === 2)).toHaveLength(1);
    // The second group is left with one character, so Sora shows as a plain member.
    expect(lines.find((l) => l.characterId === 5)?.kind).toBe('loose');
  });

  it('search and filters open a matching Player and show all its characters', () => {
    const { lines } = build({
      filtering: true,
      matchedIds: new Set([3]),
    });
    expect(lines.map((l) => [l.kind, l.name])).toEqual([
      ['player', 'Kestrel Vane'],
      ['alt', 'Vane Hauler'],
      ['alt', 'Vane Miner Two'],
      ['alt', 'Outer Rim Vane'],
    ]);
    expect(lines[0].expanded).toBe(true);
  });

  it('an outside character found by name opens its Player', () => {
    const { lines } = build({
      filtering: true,
      matchedIds: new Set(),
      outsideMatches: (name) => name.toLowerCase().includes('elsewhere'),
    });
    expect(lines.map((l) => l.name)).toEqual(['Sora Tenn', 'Sora Of Elsewhere']);
  });

  it('a highlight inside a collapsed Player keys the alt row and names its Player, but does not open it', () => {
    const { lines, highlightKey, highlightPlayerKey } = build({ highlightId: 3 });
    expect(highlightKey).toBe('p:solo:1:3');
    expect(highlightPlayerKey).toBe('p:solo:1');
    expect(lines.some((l) => l.key === 'p:solo:1:3')).toBe(false);
  });

  it('a highlight leaves a Player the reader collapsed collapsed', () => {
    const { lines } = build({ highlightId: 3, expanded: new Set() });
    expect(lines.find((l) => l.key === 'p:solo:1')?.expanded).toBe(false);
  });

  it('a highlight on a Player main or a loose member keys that row', () => {
    expect(build({ highlightId: 1 }).highlightKey).toBe('p:solo:1');
    expect(build({ highlightId: 11 }).highlightKey).toBe('c:11');
    expect(build({ highlightId: 999 }).highlightKey).toBeNull();
  });

  it('carries what the row menu needs', () => {
    const { lines } = build({ expanded: new Set(['p:solo:1']) });
    const outside = lines.find((l) => l.characterId === 4)!;
    expect(outside.group?.id).toBe('solo:1');
    expect(outside.groupHasMember).toBe(true);
  });

  it('skips a stored group with no corp member', () => {
    const { lines } = build({ groups: [{ id: 'x', mainCharacterId: 6, characterIds: [6, 7] }] });
    expect(lines.every((l) => l.groupId === null)).toBe(true);
  });

  describe('sorting', () => {
    const ships: Record<number, string> = { 1: 'Zeta', 2: 'Alpha', 5: 'Mid', 10: 'Beta' };
    const columnValue = (id: string, r: Row) => (id === 'ship' ? ships[r.characterId] : undefined);
    const names = (over: Partial<PlayerLinesInput<Row>>) => build(over).lines.map((l) => l.name);

    it('sorts by the Player name (the main) and flips with the direction', () => {
      const asc = names({ sort: { columnId: 'member', direction: 'asc' } });
      expect(asc).toEqual(['Ingrid Sol', 'Kestrel Vane', 'Lena Voss', 'Ravi Kade', 'Sora Tenn']);
      expect(names({ sort: { columnId: 'member', direction: 'desc' } })).toEqual(
        [...asc].reverse()
      );
    });

    it('Last seen ascending puts the longest-silent first; an unknown span sorts last both ways', () => {
      const asc = names({ sort: { columnId: 'lastSeen', direction: 'asc' } });
      expect(asc).toEqual(['Ingrid Sol', 'Ravi Kade', 'Sora Tenn', 'Kestrel Vane', 'Lena Voss']);
      const unknown = row(20, 'Unknown One', 1);
      unknown.standing = { ...unknown.standing, darkForMs: null as unknown as number };
      for (const direction of ['asc', 'desc'] as const) {
        const out = names({ rows: [...rows, unknown], sort: { columnId: 'lastSeen', direction } });
        expect(out.at(-1)).toBe('Unknown One');
      }
    });

    it('a Player sorts on its latest in-corp sighting, not its main', () => {
      const { lines } = build({
        rows: [row(1, 'Kestrel Vane', 40 * 24), row(2, 'Vane Hauler', 1), row(10, 'Lena Voss', 5)],
        groups: [{ id: 'g', mainCharacterId: 1, characterIds: [1, 2] }],
        sort: { columnId: 'lastSeen', direction: 'desc' },
      });
      expect(lines.map((l) => l.name)).toEqual(['Kestrel Vane', 'Lena Voss']);
    });

    it('an outside character never drives the sort', () => {
      const out = names({
        rows: [row(1, 'Kestrel Vane', 50), row(10, 'Lena Voss', 20)],
        groups: [{ id: 'g', mainCharacterId: 1, characterIds: [1, 4] }],
        sort: { columnId: 'lastSeen', direction: 'desc' },
      });
      expect(out).toEqual(['Lena Voss', 'Kestrel Vane']);
    });

    it('other columns use the main row value; missing values sort last both ways', () => {
      const sort = (direction: 'asc' | 'desc') => ({ columnId: 'ship', direction });
      // Kestrel's main is 1 (Zeta); Ravi and Ingrid have no ship value.
      expect(names({ columnValue, sort: sort('asc') }).slice(0, 3)).toEqual([
        'Lena Voss',
        'Sora Tenn',
        'Kestrel Vane',
      ]);
      expect(names({ columnValue, sort: sort('desc') }).slice(0, 3)).toEqual([
        'Kestrel Vane',
        'Sora Tenn',
        'Lena Voss',
      ]);
      expect(
        names({ columnValue, sort: sort('desc') })
          .slice(3)
          .sort()
      ).toEqual(['Ingrid Sol', 'Ravi Kade']);
    });

    it('alts stay directly under their parent in main-then-recency order whatever the sort', () => {
      for (const direction of ['asc', 'desc'] as const) {
        const { lines } = build({
          expanded: new Set(['p:solo:1']),
          sort: { columnId: 'member', direction },
        });
        const i = lines.findIndex((l) => l.key === 'p:solo:1');
        expect(lines.slice(i, i + 4).map((l) => l.name)).toEqual([
          'Kestrel Vane',
          'Vane Hauler',
          'Vane Miner Two',
          'Outer Rim Vane',
        ]);
      }
    });
  });
});

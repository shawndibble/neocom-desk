import { describe, expect, it } from 'vitest';
import type { CharacterStandingEntry } from '@/engine/market/standings';
import { buildNpcStandingRows, feeOwnerIds, filterNpcStandingRows } from './npcStandingsRows';

const entries: CharacterStandingEntry[] = [
  { from_id: 500001, from_type: 'faction', standing: 2.5 },
  { from_id: 1000035, from_type: 'npc_corp', standing: 5 },
  { from_id: 1000999, from_type: 'npc_corp', standing: -1 },
  { from_id: 3009000, from_type: 'agent', standing: 8 },
];
const names = new Map([
  [500001, 'Caldari State'],
  [1000035, 'Caldari Navy'],
  [3009000, 'Some Agent'],
]);
const owners = new Set([500001, 1000035]);

describe('buildNpcStandingRows', () => {
  const rows = buildNpcStandingRows(entries, names, owners);

  it('maps the ESI kind to faction / corp / agent', () => {
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      [3009000, 'agent'],
      [1000035, 'corp'],
      [500001, 'faction'],
      [1000999, 'corp'],
    ]);
  });

  it('flags only fee owner ids, by id', () => {
    expect(rows.filter((r) => r.usedForFees).map((r) => r.id)).toEqual([1000035, 500001]);
  });

  it('falls back to #id for an unresolved name and orders by standing descending', () => {
    expect(rows.at(-1)?.name).toBe('#1000999');
    expect(rows.map((r) => r.standing)).toEqual([8, 5, 2.5, -1]);
  });

  it('is empty for no entries', () => {
    expect(buildNpcStandingRows([], names, owners)).toEqual([]);
  });
});

describe('filterNpcStandingRows', () => {
  const rows = buildNpcStandingRows(entries, names, owners);
  it('matches name case-insensitively and id', () => {
    expect(filterNpcStandingRows(rows, 'NAVY').map((r) => r.id)).toEqual([1000035]);
    expect(filterNpcStandingRows(rows, '1000999').map((r) => r.id)).toEqual([1000999]);
    expect(filterNpcStandingRows(rows, '  ')).toHaveLength(4);
  });
});

describe('feeOwnerIds', () => {
  it('holds the five hub owner corps and four distinct factions', () => {
    const ids = feeOwnerIds();
    expect(ids.has(1000035)).toBe(true);
    expect(ids.has(500002)).toBe(true);
    expect(ids.size).toBe(9);
  });
});

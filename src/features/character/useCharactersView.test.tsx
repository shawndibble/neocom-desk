import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { CharacterRecord } from '@/db';
import type { LatestNetWorth } from '@/engine/netWorth/latest';
import { useCharactersView } from './useCharactersView';

const alice = { characterId: 1, name: 'Alice' } as CharacterRecord;
const bob = { characterId: 2, name: 'Bob' } as CharacterRecord;

function view(
  url: string,
  starred: number[] = [],
  netWorthById = new Map<number, LatestNetWorth>()
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () =>
      useCharactersView({
        characters: [alice, bob],
        corporationNameById: { 1: 'Acme', 2: 'Zeta' },
        rosterCore: new Map(),
        attentionById: new Map(),
        groups: [{ id: 'g', name: 'Mining', characterIds: [2] }],
        starred,
        spFarm: [],
        alertCounts: new Map(),
        notTrainingAlertEnabledFor: () => true,
        visibleColumns: ['name'],
        spExtractionEnabled: false,
        whereabouts: {
          of: () => undefined,
          hasLocationGrant: () => true,
          hasShipGrant: () => true,
        },
        netWorthById,
      }),
    { wrapper }
  ).result.current;
}

describe('useCharactersView', () => {
  it('keeps every character when nothing narrows', () => {
    const v = view('/characters');
    expect(v.tableRows.map((row) => row.character.name)).toEqual(['Alice', 'Bob']);
    expect(v.noMatches).toBe(false);
  });

  it('searches names and corporations', () => {
    expect(view('/characters?q=zet').tableRows.map((row) => row.character.name)).toEqual(['Bob']);
    expect(view('/characters?q=nobody').noMatches).toBe(true);
  });

  it('floats starred characters first and reports group membership', () => {
    const v = view('/characters', [2]);
    expect(v.tableRows.map((row) => row.character.name)).toEqual(['Bob', 'Alice']);
    expect(v.tableRows[0]?.groupId).toBe('g');
    expect(v.ungroupedIds).toEqual([1]);
  });

  it('puts each Character’s newest net worth on its row, and none on one never snapshotted', () => {
    const worth: LatestNetWorth = {
      day: '2026-11-01',
      total: 9,
      layers: { isk: 1, assets: 8, escrow: 0, sellOrders: 0, contracts: 0 },
    };
    const v = view('/characters', [], new Map([[2, worth]]));
    expect(v.tableRows.map((row) => row.netWorth?.total)).toEqual([undefined, 9]);
  });

  it('filters to one group', () => {
    expect(view('/characters?group=g').tableRows.map((row) => row.character.name)).toEqual(['Bob']);
  });
});

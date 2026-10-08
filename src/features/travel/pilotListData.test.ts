import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postUniverseIds: vi.fn(),
  resolveAffiliations: vi.fn(),
  resolveNames: vi.fn(),
  fetchPilotStats: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({ postUniverseIds: mocks.postUniverseIds }));
vi.mock('@/features/character/affiliations', () => ({
  resolveAffiliations: mocks.resolveAffiliations,
}));
vi.mock('@/features/character/names', () => ({ resolveNames: mocks.resolveNames }));
vi.mock('@/lib/zkillboard', () => ({ fetchPilotStats: mocks.fetchPilotStats }));

import { loadPilotList, type PilotListRow } from './pilotListData';

describe('loadPilotList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.postUniverseIds.mockResolvedValue({
      characters: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
      ],
    });
    mocks.resolveAffiliations.mockResolvedValue(
      new Map([[1, { character_id: 1, corporation_id: 10, alliance_id: 20 }]])
    );
    mocks.resolveNames.mockResolvedValue(
      new Map([
        [10, 'Corp'],
        [20, 'Alliance'],
      ])
    );
    mocks.fetchPilotStats.mockImplementation((id: number) =>
      Promise.resolve(id === 1 ? { kind: 'no-history' } : { kind: 'failed' })
    );
  });

  it('marks unresolved names, and keeps no-history apart from unreachable', async () => {
    let last: PilotListRow[] = [];
    await loadPilotList(['alpha', 'Beta', 'Nobody'], { onRows: (rows) => (last = rows) });

    expect(mocks.postUniverseIds).toHaveBeenCalledTimes(1);
    expect(last.map((r) => [r.name, r.state.kind])).toEqual([
      ['Alpha', 'no-history'],
      ['Beta', 'unreachable'],
      ['Nobody', 'not-found'],
    ]);
    expect(last[0]).toMatchObject({ corporationName: 'Corp', allianceName: 'Alliance' });
  });
});

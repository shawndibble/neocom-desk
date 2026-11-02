import { beforeEach, describe, expect, it, vi } from 'vitest';

const affiliations = vi.hoisted(() => ({
  rows: [] as { character_id: number; corporation_id: number }[],
}));
const corps = vi.hoisted(() => ({ byId: new Map<number, { name: string; ceo_id: number }>() }));

vi.mock('@/esi/endpoints', () => ({
  postCharactersAffiliation: vi.fn(async (ids: number[]) =>
    affiliations.rows.filter((r) => ids.includes(r.character_id))
  ),
  getCorporationPublicInfo: vi.fn(async (id: number) => ({ data: corps.byId.get(id) })),
}));

import { findOwnCeoCorps, verifyOwnCeoCorp } from './useOwnCeoCorps';

const ME = [
  { characterId: 1, name: 'Kestrel Vane' },
  { characterId: 2, name: 'Mira Soltane' },
];

beforeEach(() => {
  affiliations.rows = [
    { character_id: 1, corporation_id: 100 },
    { character_id: 2, corporation_id: 200 },
  ];
  corps.byId = new Map([
    [100, { name: 'Ironvale Reach', ceo_id: 1 }],
    [200, { name: 'Ashen Harbor Mining', ceo_id: 2 }],
  ]);
});

describe('findOwnCeoCorps', () => {
  it('offers a corp only with the CEO Character that is in it, read live', async () => {
    const found = await findOwnCeoCorps(ME, undefined);
    expect(found.map((c) => [c.corporationId, c.ceoCharacterId])).toEqual([
      [200, 2],
      [100, 1],
    ]);
  });

  it('drops a pairing whose CEO has since moved to another corporation', async () => {
    // The corp record still names Character 2 as CEO, but ESI now has them in corp 300.
    affiliations.rows[1] = { character_id: 2, corporation_id: 300 };
    corps.byId.set(300, { name: 'New Hollow', ceo_id: 9 });
    const found = await findOwnCeoCorps(ME, undefined);
    expect(found.map((c) => c.corporationId)).toEqual([100]);
  });

  it('keeps the others when one corporation cannot be read', async () => {
    const { getCorporationPublicInfo } = await import('@/esi/endpoints');
    vi.mocked(getCorporationPublicInfo).mockRejectedValueOnce(new Error('503'));
    const found = await findOwnCeoCorps(ME, undefined);
    expect(found).toHaveLength(1);
  });

  it('leaves the book corporation out', async () => {
    const found = await findOwnCeoCorps(ME, 100);
    expect(found.map((c) => c.corporationId)).toEqual([200]);
  });
});

describe('verifyOwnCeoCorp', () => {
  const candidate = {
    corporationId: 100,
    ceoCharacterId: 1,
    name: 'Ironvale Reach',
    ceoName: 'Kestrel Vane',
  };

  it('is true while the CEO is still in the corporation', async () => {
    expect(await verifyOwnCeoCorp(candidate)).toBe('ok');
  });

  it('is false once the CEO has moved or the corporation has a new CEO', async () => {
    affiliations.rows[0] = { character_id: 1, corporation_id: 555 };
    expect(await verifyOwnCeoCorp(candidate)).toBe('stale');
    affiliations.rows[0] = { character_id: 1, corporation_id: 100 };
    corps.byId.set(100, { name: 'Ironvale Reach', ceo_id: 77 });
    expect(await verifyOwnCeoCorp(candidate)).toBe('stale');
  });

  it('says unreachable, not stale, when ESI cannot be asked', async () => {
    const { postCharactersAffiliation } = await import('@/esi/endpoints');
    vi.mocked(postCharactersAffiliation).mockRejectedValueOnce(new Error('offline'));
    expect(await verifyOwnCeoCorp(candidate)).toBe('unreachable');
  });
});

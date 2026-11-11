import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postUniverseNames, postUniverseIds } = vi.hoisted(() => ({
  postUniverseNames: vi.fn(),
  postUniverseIds: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({
  postUniverseNames,
  postUniverseIds,
  getCharacterSearch: vi.fn(),
}));

import { nameIds, resolvePayeeId, resolveTypedPayee, resolvePlaceId } from './startLinkNames';

beforeEach(() => {
  postUniverseNames.mockReset();
  postUniverseIds.mockReset();
});

describe('resolvePlaceId', () => {
  it('names a system or an NPC station', async () => {
    postUniverseNames.mockResolvedValue([{ id: 1, name: 'Efa', category: 'solar_system' }]);
    expect(await resolvePlaceId(1)).toEqual({ ok: true, name: 'Efa' });
    postUniverseNames.mockResolvedValue([{ id: 2, name: 'Jita IV', category: 'station' }]);
    expect(await resolvePlaceId(2)).toEqual({ ok: true, name: 'Jita IV' });
  });

  it('refuses an id that is not a place a survey can name', async () => {
    postUniverseNames.mockResolvedValue([{ id: 3, name: 'Bob Corp', category: 'corporation' }]);
    expect(await resolvePlaceId(3)).toEqual({ ok: false });
  });

  it('is not found when ESI knows no such id or cannot be reached', async () => {
    postUniverseNames.mockImplementation(() => Promise.reject(new Error('404')));
    expect(await resolvePlaceId(4)).toEqual({ ok: false });
  });
});

describe('resolvePayeeId', () => {
  it('names a corporation, alliance or character, with which it is', async () => {
    postUniverseNames.mockResolvedValue([{ id: 5, name: 'Bob Corp', category: 'corporation' }]);
    expect(await resolvePayeeId(5)).toEqual({
      ok: true,
      name: 'Bob Corp',
      kind: 'corporation',
      id: 5,
    });
  });

  it('refuses a system or station id', async () => {
    postUniverseNames.mockResolvedValue([{ id: 6, name: 'Efa', category: 'solar_system' }]);
    expect(await resolvePayeeId(6)).toEqual({ ok: false });
  });
});

describe('resolveTypedPayee', () => {
  it('finds a corporation by its exact name and returns its spelling and ID', async () => {
    postUniverseIds.mockResolvedValue({ corporations: [{ id: 98000001, name: 'Bob Corp' }] });
    expect(await resolveTypedPayee('bob corp')).toEqual({
      ok: true,
      name: 'Bob Corp',
      kind: 'corporation',
      id: 98000001,
    });
  });

  it('takes a corporation over a character over an alliance when one name is several', async () => {
    postUniverseIds.mockResolvedValue({
      characters: [{ id: 3, name: 'Bob' }],
      alliances: [{ id: 2, name: 'Bob' }],
    });
    expect(await resolveTypedPayee('Bob')).toMatchObject({ kind: 'character', id: 3 });
  });

  it('is not found when nothing has that name or ESI cannot be reached', async () => {
    postUniverseIds.mockResolvedValue({});
    expect(await resolveTypedPayee('Nobody')).toEqual({ ok: false });
    postUniverseIds.mockImplementation(() => Promise.reject(new Error('down')));
    expect(await resolveTypedPayee('Nobody')).toEqual({ ok: false });
  });
});

describe('nameIds', () => {
  const noInfo = { location: null, tax: null, notes: '' };
  const link = (rate: number | null) => ({
    place: { id: 30003889, name: '' },
    payee: { id: 98834802, name: '' },
    rate,
    notes: '',
  });

  it('names the IDs the live lookup had not reached yet', async () => {
    postUniverseNames.mockImplementation((ids: number[]) =>
      Promise.resolve([
        ids[0] === 30003889
          ? { id: 30003889, name: 'Talidal', category: 'solar_system' }
          : { id: 98834802, name: 'Star Tail Industries', category: 'corporation' },
      ])
    );
    expect(await nameIds(link(5), noInfo)).toEqual({
      location: { id: 30003889, name: 'Talidal' },
      tax: { name: 'Star Tail Industries', pct: 5 },
      notes: '',
    });
  });

  it('leaves what is already named, and an ID ESI cannot name, alone', async () => {
    postUniverseNames.mockImplementation(() => Promise.reject(new Error('404')));
    const named = { location: { id: 1, name: 'Efa' }, tax: null, notes: 'x' };
    expect(await nameIds(link(null), named)).toEqual(named);
    expect(await nameIds(link(5), noInfo)).toEqual(noInfo);
  });
});

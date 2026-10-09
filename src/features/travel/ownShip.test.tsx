import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '24702': { name: 'Hurricane', groupID: 419 },
    '33153': { name: 'Hurricane Fleet Issue', groupID: 419 },
    '587': { name: 'Rifter', groupID: 25 },
    '606': { name: 'Velator', groupID: 237 },
    '670': { name: 'Capsule', groupID: 29 },
    '11129': { name: 'Shuttle X', groupID: 31 },
    '2175': { name: 'Infiltrator II', groupID: 100 },
  }),
  loadGroupCategories: async () => ({ '419': 6, '25': 6, '237': 6, '29': 6, '31': 6, '100': 18 }),
}));

import { db } from '@/db';
import { listShipTypes, searchShips, useManualShip, type ShipType } from './ownShip';

const SHIPS: ShipType[] = [
  { typeId: 1, name: 'Hurricane', groupId: 419 },
  { typeId: 2, name: 'Hurricane Fleet Issue', groupId: 419 },
  { typeId: 3, name: 'Typhoon', groupId: 27 },
  { typeId: 4, name: 'Sacrilege', groupId: 358 },
  { typeId: 5, name: "Nestor's Heir", groupId: 27 },
];

describe('searchShips', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchShips(SHIPS, '')).toEqual([]);
    expect(searchShips(SHIPS, '   ')).toEqual([]);
  });

  it('is case-insensitive and ranks prefix matches before substring matches', () => {
    const names = searchShips(SHIPS, 'HURR').map((s) => s.name);
    expect(names).toEqual(['Hurricane', 'Hurricane Fleet Issue']);
    expect(searchShips(SHIPS, 'oon').map((s) => s.name)).toEqual(['Typhoon']);
    const ranked = searchShips(
      [
        { typeId: 1, name: 'Alpha Rifter', groupId: 25 },
        { typeId: 2, name: 'Rifter', groupId: 25 },
      ],
      'rif'
    );
    expect(ranked.map((s) => s.name)).toEqual(['Rifter', 'Alpha Rifter']);
  });

  it('ignores punctuation and extra spaces', () => {
    expect(searchShips(SHIPS, '  hurricane   fleet ').map((s) => s.name)).toEqual([
      'Hurricane Fleet Issue',
    ]);
    expect(searchShips(SHIPS, 'nestors heir').map((s) => s.name)).toEqual(["Nestor's Heir"]);
    expect(searchShips(SHIPS, "nestor's").map((s) => s.name)).toEqual(["Nestor's Heir"]);
  });

  it('caps results at the limit', () => {
    expect(searchShips(SHIPS, 'e', 2)).toHaveLength(2);
  });
});

describe('listShipTypes', () => {
  it('keeps ships only, drops capsules and shuttles, sorted by name', async () => {
    const ships = await listShipTypes();
    expect(ships.map((s) => s.name)).toEqual([
      'Hurricane',
      'Hurricane Fleet Issue',
      'Rifter',
      'Velator',
    ]);
    expect(ships[0]).toEqual({ typeId: 24702, name: 'Hurricane', groupId: 419 });
    expect(await listShipTypes()).toBe(ships);
  });
});

describe('useManualShip', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('is null until a ship is picked, then persists device-locally', async () => {
    const { result } = renderHook(() => useManualShip());
    expect(result.current.typeId).toBeNull();
    await act(async () => result.current.setTypeId(24702));
    await waitFor(() => expect(result.current.typeId).toBe(24702));
    expect((await db.settings.get('dscan.ownShip'))?.value).toBe(24702);
    await act(async () => result.current.setTypeId(null));
    await waitFor(() => expect(result.current.typeId).toBeNull());
  });

  it('reads a ship stored earlier', async () => {
    await db.settings.put({ key: 'dscan.ownShip', value: 587 });
    const { result } = renderHook(() => useManualShip());
    await waitFor(() => expect(result.current.typeId).toBe(587));
  });
});

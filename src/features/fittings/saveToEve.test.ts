import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type TokenRecord } from '@/db';
import { EsiError } from '@/esi/client';
import type { Fitting } from '@/engine/fittings/types';

const postCharacterFittingMock = vi.hoisted(() => vi.fn());
const deleteCharacterFittingMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({
  postCharacterFitting: postCharacterFittingMock,
  deleteCharacterFitting: deleteCharacterFittingMock,
}));

import { IN_GAME_FITTING_NAME_MAX, saveFittingToEve } from './saveToEve';

const FITTING: Fitting = {
  name: 'PvP Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 484, state: 'active' }],
  drones: [],
  cargo: [],
};

beforeEach(async () => {
  vi.clearAllMocks();
  await db.tokens.clear();
});

describe('saveFittingToEve', () => {
  it('creates the fitting and never deletes when no overwrite target is given', async () => {
    postCharacterFittingMock.mockResolvedValue({ data: { fitting_id: 42 } });
    const result = await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
    });
    expect(result).toEqual({ ok: true, fittingId: 42, overwriteError: null });
    expect(postCharacterFittingMock).toHaveBeenCalledWith(1, {
      name: 'PvP Rifter',
      description: '',
      ship_type_id: 587,
      items: [{ flag: 'HiSlot0', quantity: 1, type_id: 484 }],
    });
    expect(deleteCharacterFittingMock).not.toHaveBeenCalled();
  });

  it('truncates a name over the ESI 50-character limit before sending it', async () => {
    postCharacterFittingMock.mockResolvedValue({ data: { fitting_id: 1 } });
    const longName = 'x'.repeat(60);
    await saveFittingToEve({ characterId: 1, fitting: FITTING, name: longName, description: '' });
    const sent = postCharacterFittingMock.mock.calls[0][1];
    expect(sent.name).toHaveLength(IN_GAME_FITTING_NAME_MAX);
  });

  it('sends the description, cut to the ESI 500-character limit', async () => {
    postCharacterFittingMock.mockResolvedValue({ data: { fitting_id: 1 } });
    await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'Kite',
      description: 'z'.repeat(600),
    });
    expect(postCharacterFittingMock.mock.calls[0][1].description).toHaveLength(500);
  });

  it('deletes the overwritten fitting only after the create succeeds', async () => {
    postCharacterFittingMock.mockResolvedValue({ data: { fitting_id: 99 } });
    deleteCharacterFittingMock.mockResolvedValue({ data: null });
    const result = await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
      overwriteFittingId: 7,
    });
    expect(result).toEqual({ ok: true, fittingId: 99, overwriteError: null });
    expect(deleteCharacterFittingMock).toHaveBeenCalledWith(1, 7);
  });

  it('never deletes the original when the create fails, and surfaces ESI’s error', async () => {
    postCharacterFittingMock.mockRejectedValue(new EsiError(500, 'ESI is down', null));
    const result = await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
      overwriteFittingId: 7,
    });
    expect(result).toEqual({ ok: false, message: 'ESI is down' });
    expect(deleteCharacterFittingMock).not.toHaveBeenCalled();
  });

  it('says a Permission is needed when ESI refuses and the grant lacks the write scope', async () => {
    await db.tokens.put({
      characterId: 1,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 600_000,
      scopes: ['esi-fittings.read_fittings.v1'],
    } as TokenRecord);
    postCharacterFittingMock.mockRejectedValue(new EsiError(403, 'Forbidden', null));
    const result = await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
    });
    expect(result).toEqual({ ok: false, message: 'Forbidden', needsPermission: true });
  });

  it('does not ask for a Permission the grant already holds: a re-login could not fix that refusal', async () => {
    await db.tokens.put({
      characterId: 1,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 600_000,
      scopes: ['esi-fittings.write_fittings.v1'],
    } as TokenRecord);
    postCharacterFittingMock.mockRejectedValue(new EsiError(403, 'Forbidden', null));
    const result = await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
    });
    expect(result).toEqual({ ok: false, message: 'Forbidden' });
  });

  it('reports a failed overwrite delete without treating the save itself as failed — the pilot now has both', async () => {
    postCharacterFittingMock.mockResolvedValue({ data: { fitting_id: 99 } });
    deleteCharacterFittingMock.mockRejectedValue(new EsiError(404, 'Fitting not found', null));
    const result = await saveFittingToEve({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
      overwriteFittingId: 7,
    });
    expect(result).toEqual({ ok: true, fittingId: 99, overwriteError: 'Fitting not found' });
  });
});

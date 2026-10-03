import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { EsiError } from '@/esi/errors';

const postAutopilotWaypointMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postAutopilotWaypoint: postAutopilotWaypointMock }));

import { setWaypointsInGame } from './sendWaypoints';

beforeEach(async () => {
  vi.clearAllMocks();
  await db.tokens.clear();
});

describe('setWaypointsInGame', () => {
  it('clears with the first waypoint, then adds the rest in order', async () => {
    postAutopilotWaypointMock.mockResolvedValue({ data: null });
    const result = await setWaypointsInGame(7, [30000002, 30000003, 30000001]);
    expect(result).toEqual({ ok: true, set: 3 });
    expect(postAutopilotWaypointMock.mock.calls).toEqual([
      [7, 30000002, { clearOtherWaypoints: true }],
      [7, 30000003, { clearOtherWaypoints: false }],
      [7, 30000001, { clearOtherWaypoints: false }],
    ]);
  });

  it('sends nothing for no waypoints', async () => {
    expect(await setWaypointsInGame(7, [])).toEqual({ ok: true, set: 0 });
    expect(postAutopilotWaypointMock).not.toHaveBeenCalled();
  });

  it('stops at the first failure, saying how many were set and why', async () => {
    postAutopilotWaypointMock
      .mockResolvedValueOnce({ data: null })
      .mockRejectedValueOnce(new EsiError(520, 'Character is not online'));
    const result = await setWaypointsInGame(7, [30000002, 30000003, 30000001]);
    expect(result).toEqual({ ok: false, set: 1, message: 'Character is not online' });
    expect(postAutopilotWaypointMock).toHaveBeenCalledTimes(2);
  });

  it('gives no message rather than invented words when ESI gave none', async () => {
    postAutopilotWaypointMock.mockRejectedValue(new Error('network'));
    expect(await setWaypointsInGame(7, [30000002])).toEqual({ ok: false, set: 0, message: null });
  });

  it('asks for the Permission when the grant lacks the waypoint scope', async () => {
    await db.tokens.put({
      characterId: 7,
      refreshToken: 'r',
      scopes: ['esi-location.read_location.v1'],
    } as never);
    postAutopilotWaypointMock.mockRejectedValue(new EsiError(403, 'Token not authorized'));
    const result = await setWaypointsInGame(7, [30000002]);
    expect(result).toEqual({
      ok: false,
      set: 0,
      message: 'Token not authorized',
      needsPermission: true,
    });
  });
});

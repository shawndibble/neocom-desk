import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const sde = vi.hoisted(() => ({
  positions: vi.fn(),
  systems: vi.fn(),
}));
vi.mock('@/sde/loadMarketSde', () => ({ loadSystemPositions: sde.positions }));
vi.mock('@/sde/solarSystems', () => ({ loadSolarSystemsById: sde.systems }));

const SHIP = { typeId: 1, name: 'Hull', groupId: 898, massKg: 1, drive: [4, 16273, 1000] as const };
vi.mock('./routeShip', () => ({
  useRouteShipMass: () => ({ ship: SHIP, hulls: [], holeTable: {} }),
}));

let useRouteJump: typeof import('./routeJumpSettings').useRouteJump;

beforeEach(async () => {
  sde.positions.mockReset();
  sde.systems.mockReset();
  // The module memoises the system map for the session, so each test gets its own copy.
  vi.resetModules();
  const settings = await import('./routeJumpSettings');
  useRouteJump = settings.useRouteJump;
  await settings.useRouteJumpsEnabled.getState().setValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('useRouteJump', () => {
  it('plans jump legs once the system map reads', async () => {
    sde.positions.mockResolvedValue([30000142, 0, 0, 0]);
    sde.systems.mockResolvedValue(
      new Map([[30000142, { id: 30000142, security: 0.9, regionId: 1 }]])
    );
    const { result } = renderHook(() => useRouteJump());
    await waitFor(() => expect(result.current.setup).not.toBeNull());
    expect(result.current.unavailable).toBe(false);
  });

  it('says jump data is unavailable when the map cannot be read, and retries on reconnect', async () => {
    sde.positions.mockRejectedValueOnce(new Error('offline'));
    sde.systems.mockResolvedValue(null);
    const { result } = renderHook(() => useRouteJump());
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.setup).toBeNull();
    expect(result.current.ready).toBe(true);

    sde.positions.mockResolvedValue([30000142, 0, 0, 0]);
    sde.systems.mockResolvedValue(
      new Map([[30000142, { id: 30000142, security: 0.9, regionId: 1 }]])
    );
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.setup).not.toBeNull());
    expect(result.current.unavailable).toBe(false);
  });

  it('recovers on reconnect when only the systems read came back empty', async () => {
    // Positions load, but the systems index resolves null (its own failed read).
    sde.positions.mockResolvedValue([30000142, 0, 0, 0]);
    sde.systems.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useRouteJump());
    await waitFor(() => expect(result.current.unavailable).toBe(true));

    sde.systems.mockResolvedValue(
      new Map([[30000142, { id: 30000142, security: 0.9, regionId: 1 }]])
    );
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.setup).not.toBeNull());
    expect(result.current.unavailable).toBe(false);
  });
});

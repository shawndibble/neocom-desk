import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let resolveStations: (list: unknown[]) => void = () => {};
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: () => new Promise((resolve) => (resolveStations = resolve)),
}));
vi.mock('@/features/route/currentSystem', () => ({
  useCurrentSystem: () => ({ systemId: 30000001, loaded: true }),
  useJumpRangeFilter: () => ({ jumps: new Map([[30000002, 4]]), jumpsStatus: 'ready' }),
}));

import { useNearestStation } from './useNearestStation';

describe('useNearestStation', () => {
  it('is loading until the station list arrives, then gives the nearest station', async () => {
    const { result } = renderHook(() => useNearestStation(7));
    expect(result.current).toEqual({ loading: true, station: null, jumpsStatus: 'ready' });
    resolveStations([{ id: 60000001, name: 'Home', systemId: 30000002, ownerCorporationId: 7 }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.station).toEqual({
      stationId: 60000001,
      stationName: 'Home',
      systemId: 30000002,
      jumps: 4,
    });
  });

  it('does not load for a null corporation', () => {
    const { result } = renderHook(() => useNearestStation(null));
    expect(result.current).toEqual({ loading: false, station: null, jumpsStatus: 'ready' });
  });
});

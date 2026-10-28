import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

const useNearestStation = vi.fn();
vi.mock('./useNearestStation', () => ({
  useNearestStation: (id: number) => useNearestStation(id),
}));

import { NearestStationLine } from './NearestStationLine';

const STATION = { stationId: 1, stationName: 'Jita IV - Moon 4', systemId: 2, jumps: 3 };

describe('NearestStationLine', () => {
  beforeEach(() => useNearestStation.mockReset());

  it('shows the station and jumps', () => {
    useNearestStation.mockReturnValue({ loading: false, station: STATION, jumpsStatus: 'ready' });
    render(<NearestStationLine corporationId={7} />);
    expect(screen.getByTestId('nearest-station')).toHaveTextContent(
      'Nearest station: Jita IV - Moon 4 · 3 jumps'
    );
    expect(useNearestStation).toHaveBeenCalledWith(7);
  });

  it('uses the singular for one jump', () => {
    useNearestStation.mockReturnValue({
      loading: false,
      station: { ...STATION, jumps: 1 },
      jumpsStatus: 'ready',
    });
    render(<NearestStationLine corporationId={7} />);
    expect(screen.getByTestId('nearest-station')).toHaveTextContent('· 1 jump');
    expect(screen.getByTestId('nearest-station')).not.toHaveTextContent('1 jumps');
  });

  it('is dim "…" while loading the stations', () => {
    useNearestStation.mockReturnValue({ loading: true, station: null, jumpsStatus: 'ready' });
    render(<NearestStationLine corporationId={7} />);
    expect(screen.getByTestId('nearest-station')).toHaveTextContent('Nearest station: …');
  });

  it('is "…" while distances load', () => {
    useNearestStation.mockReturnValue({ loading: false, station: null, jumpsStatus: 'loading' });
    render(<NearestStationLine corporationId={7} />);
    expect(screen.getByTestId('nearest-station')).toHaveTextContent('…');
  });

  it('asks for a location when none is set', () => {
    useNearestStation.mockReturnValue({ loading: false, station: null, jumpsStatus: 'no-origin' });
    render(<NearestStationLine corporationId={7} />);
    expect(screen.getByTestId('nearest-station')).toHaveTextContent(
      'Set your location to see the nearest station'
    );
  });

  it('says so when no station is reachable', () => {
    useNearestStation.mockReturnValue({ loading: false, station: null, jumpsStatus: 'ready' });
    render(<NearestStationLine corporationId={7} />);
    expect(screen.getByTestId('nearest-station')).toHaveTextContent(
      'No station of this corporation'
    );
  });
});

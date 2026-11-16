import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteSafetyTrip } from '@/engine/route/routeSafetyTrip';
import { TripTimeLine } from './TripTimeLine';
import '@/i18n';

const state = vi.hoisted(() => ({
  ship: null as { typeId: number; name: string; massKg: number } | null,
  gates: {} as Record<string, number[]>,
  flight: {} as Record<string, number[]>,
}));
vi.mock('@/features/route/routeShip', () => ({
  useRouteShipMass: () => ({ ship: state.ship, hulls: [], holeTable: {} }),
}));
vi.mock('@/sde/loadMarketSde', () => ({ loadGatePositions: () => Promise.resolve(state.gates) }));
vi.mock('@/sde/loadSde', () => ({ loadShipFlight: () => Promise.resolve(state.flight) }));

const row = (systemId: number, entry: unknown) => ({ systemId, entry });
const trip = (entry2: unknown) =>
  ({
    rows: [row(1, null), row(2, entry2)],
    stopIndexes: [1],
  }) as unknown as RouteSafetyTrip;

describe('TripTimeLine', () => {
  beforeEach(() => {
    state.ship = { typeId: 7, name: 'Charon', massKg: 1e9 };
    state.gates = { 1: [2, 149_598, 0, 0], 2: [1, 149_598, 0, 0] };
    state.flight = { 7: [0.05, 60, 1.5] };
  });

  it('asks for a route ship when none is chosen', () => {
    state.ship = null;
    render(<TripTimeLine trip={trip({ kind: 'gate' })} />);
    expect(screen.getByText('Pick a route ship to estimate time')).toBeInTheDocument();
  });

  it('shows both figures, warp to 0 then the longer autopilot', async () => {
    render(<TripTimeLine trip={trip({ kind: 'gate' })} />);
    const line = await screen.findByText(/warp to 0/);
    const [warp, auto] = [...line.textContent!.matchAll(/(\d+) min/g)].map((m) => Number(m[1]));
    expect(line).toHaveTextContent('≈');
    expect(auto).toBeGreaterThanOrEqual(warp);
    expect(line).not.toHaveTextContent('Gate legs only');
  });

  it('says the figure covers gate legs only when a hop is not by gate', async () => {
    const mixed = {
      rows: [row(1, null), row(2, { kind: 'gate' }), row(3, { kind: 'bridge' })],
      stopIndexes: [2],
    } as unknown as RouteSafetyTrip;
    state.gates = { 1: [2, 149_598, 0, 0], 2: [1, 149_598, 0, 0] };
    render(<TripTimeLine trip={mixed} />);
    expect(await screen.findByText(/Gate legs only/)).toBeInTheDocument();
  });

  it('shows nothing when a gate position is missing', async () => {
    state.gates = {};
    const { container } = render(<TripTimeLine trip={trip({ kind: 'gate' })} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

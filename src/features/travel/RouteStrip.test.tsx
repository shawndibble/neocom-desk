import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { RouteSafetyTripRow, RouteStep } from '@/engine/route/routeSafetyTrip';
import { RouteStrip } from './RouteStrip';

const GATE: RouteStep = { kind: 'gate' };
const HOLE: RouteStep = {
  kind: 'hole',
  hole: {
    id: '1',
    hub: 'thera',
    hubSignature: 'ABC-123',
    exitSignature: 'XYZ-789',
    exitSystemId: 2,
    exitSystemName: 'Two',
    exitClass: null,
    exitRegionName: null,
    wormholeType: null,
    maxShipSize: 'large',
    expiresAt: 0,
  },
};
const BRIDGE: RouteStep = { kind: 'bridge', gate: { fromId: 3, toId: 4, name: 'Three » Four' } };

function row(systemId: number, name: string, entry: RouteStep | null): RouteSafetyTripRow {
  return {
    systemId,
    name,
    security: 0.5,
    band: 'highsec',
    regionId: null,
    regionName: null,
    jumps: 0,
    shipKills: 0,
    podKills: 0,
    npcKills: 0,
    chokepoint: false,
    entry,
  };
}

function show(rows: RouteSafetyTripRow[]) {
  render(<RouteStrip rows={rows} killsOf={() => ({ status: 'loading' })} />);
}

describe('RouteStrip', () => {
  it('draws a cell of its own for each hole and bridge jump, read off the row tags', () => {
    show([row(1, 'One', null), row(2, 'Two', GATE), row(3, 'Three', HOLE), row(4, 'Four', BRIDGE)]);
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(4);
    expect(screen.getAllByTestId('route-strip-hole')).toHaveLength(1);
    expect(screen.getAllByTestId('route-strip-bridge')).toHaveLength(1);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('1 jump through a wormhole.');
    expect(label).toContain('1 jump over an Ansiblex.');
  });

  it('draws no step cells on a gate-only route', () => {
    show([row(1, 'One', null), row(2, 'Two', GATE)]);
    expect(screen.queryByTestId('route-strip-hole')).toBeNull();
    expect(screen.queryByTestId('route-strip-bridge')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/Ansiblex|wormhole/);
  });
});

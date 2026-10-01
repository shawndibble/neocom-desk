import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { FleetSupportStats } from '@/engine/fittings/fleetSupport';
import type { FittingStats } from '@/engine/fittings/types';
import { FleetBoostFacts } from './FittingFleetBoostStats';

const names: Record<number, string> = {
  43551: 'Mining Foreman Burst II',
  42829: 'Mining Laser Field Enhancement Charge',
  62625: 'Large Asteroid Ore Compressor I',
  58950: 'Large Industrial Core II',
  16272: 'Heavy Water',
};
const typeName = (id: number) => names[id] ?? `#${id}`;

const burst = {
  typeId: 43551,
  chargeTypeId: 42829,
  count: 2,
  strengths: [77.25, 3.8625],
  rangeMeters: 51_827.5,
  durationSeconds: 92.7,
  reloadSeconds: 30,
};

function render_(fleetSupport: FleetSupportStats) {
  render(
    <FleetBoostFacts stats={{ fleetSupport } as unknown as FittingStats} typeName={typeName} />
  );
}

describe('FleetBoostFacts', () => {
  it('shows a burst with its charge, strength, range, length and reload', () => {
    render_({ bursts: [burst], compressors: [], core: null });
    expect(screen.getByText(/2× Mining Foreman Burst II/)).toBeInTheDocument();
    expect(screen.getByText('Mining Laser Field Enhancement Charge')).toBeInTheDocument();
    expect(screen.getByText('77.3% · 3.9%')).toBeInTheDocument();
    expect(screen.getByText('51.8 km')).toBeInTheDocument();
    expect(screen.getByText('lasts 92.7 s')).toBeInTheDocument();
    expect(screen.getByText('reload 30.0 s')).toBeInTheDocument();
  });

  it('says a burst with no charge hands out nothing', () => {
    render_({
      bursts: [{ ...burst, chargeTypeId: undefined, strengths: [] }],
      compressors: [],
      core: null,
    });
    expect(screen.getByText(/No charge loaded/)).toBeInTheDocument();
  });

  it('shows compressor range and the fuel the core burns each activation', () => {
    render_({
      bursts: [],
      compressors: [{ typeId: 62625, count: 1, rangeMeters: 124_500, cycleSeconds: 60 }],
      core: { typeId: 58950, fuelTypeId: 16_272, fuelPerCycle: 375, cycleSeconds: 150 },
    });
    expect(screen.getByText('1× Large Asteroid Ore Compressor I')).toBeInTheDocument();
    expect(screen.getByText('124.5 km')).toBeInTheDocument();
    expect(screen.getByText('Every 60.0 s')).toBeInTheDocument();
    expect(screen.getByText('375 Heavy Water')).toBeInTheDocument();
    expect(screen.getByText('Every 150.0 s')).toBeInTheDocument();
  });
});

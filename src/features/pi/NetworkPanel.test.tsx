import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { NetworkPlan, NetworkOpportunity } from '@/engine/pi/network';
import { NetworkPanel } from './NetworkPanel';

function opportunity(overrides: Partial<NetworkOpportunity>): NetworkOpportunity {
  return {
    typeId: 1,
    name: 'Test Cultures',
    tier: 2,
    hostPlanetId: 1,
    factories: 1,
    facility: 'advanced',
    inputs: [],
    unitsPerHour: 5,
    marginPerUnit: 100,
    marginPerHour: 500,
    buyCostPerHour: 0,
    revenuePerHour: 1_000,
    ...overrides,
  };
}

function plan(opportunities: NetworkOpportunity[]): NetworkPlan {
  return { opportunities, conversions: [], unallocated: [], blocked: [] };
}

const planetNames = new Map([
  [1, 'Ashab III'],
  [2, 'Ashab IV'],
]);

describe('NetworkPanel', () => {
  it('names the shared rate when every host in the plan pays the same one', () => {
    render(
      <NetworkPanel
        plan={plan([
          opportunity({ hostPlanetId: 1, marginPerHour: 500 }),
          opportunity({ typeId: 2, name: 'Water-Cooled CPU', hostPlanetId: 1, marginPerHour: 300 }),
        ])}
        buyInputs={false}
        assumesRemoval={false}
        planetNames={planetNames}
        taxRate={0.06}
        taxRateByPlanet={new Map([[1, 0.06]])}
      />
    );
    expect(screen.getByText(/this system’s 6% customs rate/)).toBeInTheDocument();
  });

  it('does not attribute one rate to the total when hosts pay different rates', () => {
    // Decision 20260906-144358: "what a line reports is always recomputed at
    // its real host's rate." A summed total spanning hosts at different rates
    // has no single rate to name honestly.
    render(
      <NetworkPanel
        plan={plan([
          opportunity({ typeId: 1, hostPlanetId: 1, marginPerHour: 500 }),
          opportunity({ typeId: 2, name: 'Water-Cooled CPU', hostPlanetId: 2, marginPerHour: 300 }),
        ])}
        buyInputs={false}
        assumesRemoval={false}
        planetNames={planetNames}
        taxRate={0.06}
        taxRateByPlanet={
          new Map([
            [1, 0.06],
            [2, 0],
          ])
        }
      />
    );
    expect(screen.getByText(/each priced at its own host's customs rate/)).toBeInTheDocument();
    expect(screen.queryByText(/this system’s \d/)).not.toBeInTheDocument();
  });

  it('falls back to the single taxRate when no per-planet map is given', () => {
    render(
      <NetworkPanel
        plan={plan([opportunity({ hostPlanetId: 1, marginPerHour: 500 })])}
        buyInputs={false}
        assumesRemoval={false}
        planetNames={planetNames}
        taxRate={0.06}
      />
    );
    expect(screen.getByText(/this system’s 6% customs rate/)).toBeInTheDocument();
  });
});

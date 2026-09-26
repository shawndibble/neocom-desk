import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { FittingStats } from '@/engine/fittings/types';
import { CapacitorFacts, SustainedTankReadout, TankFacts } from './FittingTankStats';

const typeName = (typeId: number) => (typeId === 33101 ? 'Medium Ancillary Armor Repairer' : '?');

function stats(overrides: Partial<FittingStats> = {}): FittingStats {
  const neutral = neutralExtendedStats();
  return {
    ...neutral,
    repair: { shield: 40, armor: 0, hull: 0 },
    overheated: null,
    capacitorCapacity: 250,
    capacitorRechargeTime: 100000,
    ...overrides,
  } as FittingStats;
}

describe('TankFacts', () => {
  it('sets burst beside sustained tank and passive regeneration', () => {
    render(
      <TankFacts
        stats={stats({
          tank: {
            ...neutralExtendedStats().tank,
            burst: { shield: 40, armor: 0, hull: 0 },
            sustained: { shield: 20, armor: 0, hull: 0 },
            passiveShield: 5.5,
            burstEffective: 90,
            sustainedEffective: 50,
            capFraction: 0.5,
          },
        })}
        typeName={typeName}
      />
    );

    expect(screen.getByText('Shield boost: 40.0 HP/s')).toBeInTheDocument();
    expect(screen.getByText('Passive shield regen: 5.5 HP/s')).toBeInTheDocument();
    expect(screen.getByText('90.0 EHP/s')).toBeInTheDocument();
    expect(screen.getByText('50.0 EHP/s')).toBeInTheDocument();
    expect(
      screen.getByText('Cap-limited: repairers get 50% of the capacitor they need')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cap boosters and ancillary repairers averaged over their reloads/)
    ).toBeInTheDocument();
  });

  it('gives an ancillary armor repairer its rate with paste and dry', () => {
    render(
      <TankFacts
        stats={stats({
          tank: {
            ...neutralExtendedStats().tank,
            ancillary: [{ typeId: 33101, layer: 'armor', loaded: 78, empty: 26, isLoaded: true }],
          },
        })}
        typeName={typeName}
      />
    );

    expect(
      screen.getByText('Medium Ancillary Armor Repairer: 78.0 HP/s with paste, 26.0 dry')
    ).toBeInTheDocument();
  });

  it('says nothing about the capacitor limiting a tank it keeps up with', () => {
    render(<TankFacts stats={stats()} typeName={typeName} />);
    expect(screen.queryByText(/Cap-limited/)).toBeNull();
  });
});

describe('CapacitorFacts', () => {
  it('shows peak recharge, drain, booster, nosferatu, delta and the booster charge rate', () => {
    render(
      <CapacitorFacts
        stats={stats({
          capacitorBudget: {
            peakRecharge: 35.84,
            drain: 60,
            boosterInjection: 33.33,
            nosferatuGain: 7.2,
            delta: 16.37,
            deltaPct: 45.7,
            secondsPerBoosterCharge: 23.9,
          },
        })}
      />
    );

    expect(screen.getByText('35.8 GJ/s')).toBeInTheDocument();
    expect(screen.getByText('−60.0 GJ/s')).toBeInTheDocument();
    expect(screen.getByText('+33.3 GJ/s')).toBeInTheDocument();
    expect(screen.getByText('+7.2 GJ/s')).toBeInTheDocument();
    expect(screen.getByText('+16.4 GJ/s')).toBeInTheDocument();
    expect(screen.getByText('1 every 23.9 s')).toBeInTheDocument();
  });

  it('leaves out cap boosters and nosferatu the fit does not run', () => {
    render(<CapacitorFacts stats={stats()} />);
    expect(screen.queryByText('Cap boosters')).toBeNull();
    expect(screen.queryByText('Nosferatu')).toBeNull();
  });
});

describe('SustainedTankReadout', () => {
  it('reads the sustained tank for the ring', () => {
    render(
      <SustainedTankReadout
        stats={stats({ tank: { ...neutralExtendedStats().tank, sustainedEffective: 168.4 } })}
      />
    );
    expect(screen.getByText('Sustained')).toBeInTheDocument();
    expect(screen.getByText('168 EHP/s')).toBeInTheDocument();
  });

  it('renders nothing before there are stats', () => {
    const { container } = render(<SustainedTankReadout stats={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import type { FittingStats, LayerDefense } from '@/engine/fittings/types';
import { FittingStatsSections } from './FittingStatsSections';

const LAYER: LayerDefense = {
  hp: 1000,
  emResonance: 0.5,
  thermalResonance: 0.5,
  kineticResonance: 0.5,
  explosiveResonance: 0.5,
};

const NAMES: Record<number, string> = {
  3186: 'Neutron Blaster Cannon II',
  230: 'Antimatter Charge M',
  2488: 'Warrior II',
};
const typeName = (typeId: number) => NAMES[typeId] ?? `#${typeId}`;

function stats(overrides: Partial<FittingStats> = {}): FittingStats {
  return {
    cpuUsed: 0,
    cpuTotal: 0,
    powergridUsed: 0,
    powergridTotal: 0,
    calibrationUsed: 0,
    calibrationTotal: 0,
    droneDps: 120,
    droneBandwidthUsed: 0,
    droneBandwidthTotal: 0,
    droneCapacity: 0,
    ehp: 17000,
    capacitor: { stable: true, stablePercentage: 60 },
    capacitorCapacity: 0,
    capacitorRechargeTime: 0,
    shield: LAYER,
    armor: LAYER,
    hull: LAYER,
    targeting: { maxTargetRange: 0, maxLockedTargets: 0, scanResolution: 0, signatureRadius: 0 },
    navigation: { maxVelocity: 200, agility: 0, mass: 0, warpSpeed: 0 },
    unknownItemTypeIds: [],
    slotCounts: { high: 0, medium: 0, low: 0, rig: 0, subsystem: 0 },
    modules: [],
    offense: {
      weapons: [
        {
          typeId: 3186,
          chargeTypeId: 230,
          isDrone: false,
          count: 2,
          dps: 53.7,
          volley: 304,
          overheatedDps: 61.7,
          overheatedVolley: 350,
        },
        {
          typeId: 2488,
          isDrone: true,
          count: 5,
          dps: 120,
          volley: 480,
          overheatedDps: null,
          overheatedVolley: null,
        },
      ],
      dps: 173.7,
      volley: 784,
      overheatedDps: 181.7,
      overheatedVolley: 830,
    },
    repair: { shield: 0, armor: 63.2, hull: 0 },
    overheated: { ehp: 17400, maxVelocity: 200, repair: { shield: 0, armor: 81.8, hull: 0 } },
    ...overrides,
  };
}

function renderSections(value: FittingStats) {
  render(
    <FittingStatsSections
      stats={value}
      statsProgress={null}
      statsError={false}
      price={null}
      typeName={typeName}
    />
  );
}

function sectionBody(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('section')!;
}

describe('FittingStatsSections offense', () => {
  it('lists each weapon group and drone type with its DPS and volley, and the total', () => {
    renderSections(stats());
    const offense = within(sectionBody('Offense'));

    expect(offense.getByText('2× Neutron Blaster Cannon II')).toBeInTheDocument();
    expect(offense.getByText('Antimatter Charge M')).toBeInTheDocument();
    expect(offense.getByText('5× Warrior II')).toBeInTheDocument();
    expect(offense.getByText('53.7 DPS')).toBeInTheDocument();
    expect(offense.getByText('120.0 DPS')).toBeInTheDocument();
    // The total, once in the section header and once as the Total row.
    expect(offense.getAllByText('173.7 DPS')).toHaveLength(2);
    expect(offense.getByText('784 volley')).toBeInTheDocument();
  });

  it('shows overheated values beside weapons that overheat, and says drones do not', () => {
    renderSections(stats());
    const offense = within(sectionBody('Offense'));

    expect(offense.getByText('61.7 overheated')).toBeInTheDocument();
    expect(offense.getByText('350 overheated')).toBeInTheDocument();
    expect(offense.getByText('181.7 overheated')).toBeInTheDocument();
    expect(offense.getByText("Drones don't overheat")).toBeInTheDocument();
  });

  it('says so when nothing is firing', () => {
    renderSections(
      stats({
        offense: {
          weapons: [],
          dps: 0,
          volley: 0,
          overheatedDps: null,
          overheatedVolley: null,
        },
      })
    );

    expect(within(sectionBody('Offense')).getByText('Nothing is firing.')).toBeInTheDocument();
  });
});

describe('FittingStatsSections overheated lines elsewhere', () => {
  it('shows overheated EHP and repair in Defense, and none in Navigation when speed is unchanged', () => {
    renderSections(stats());

    const defense = within(sectionBody('Defense'));
    expect(defense.getByText('17400 overheated')).toBeInTheDocument();
    expect(defense.getByText('Armor repair: 63.2 HP/s')).toBeInTheDocument();
    expect(defense.getByText('81.8 overheated')).toBeInTheDocument();
    expect(within(sectionBody('Navigation')).queryByText(/overheated/)).toBeNull();
  });

  it('shows no overheated line anywhere when no module can overheat', () => {
    renderSections(
      stats({
        overheated: null,
        offense: {
          weapons: [],
          dps: 0,
          volley: 0,
          overheatedDps: null,
          overheatedVolley: null,
        },
      })
    );

    expect(screen.queryByText(/overheated/)).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BUILT_IN_DAMAGE_PROFILES } from '@/engine/fittings/damageProfile';
import type { FittingStats } from '@/engine/fittings/types';
import type { DamageProfiles } from './damageProfiles';
import { FittingStatsSections } from './FittingStatsSections';

function layer(hp: number, ehp: number) {
  return {
    hp,
    ehp,
    emResonance: 0.5,
    thermalResonance: 0.5,
    kineticResonance: 0.5,
    explosiveResonance: 0.5,
  };
}

function stats(overrides: Partial<FittingStats> = {}): FittingStats {
  return {
    cpuUsed: 100,
    cpuTotal: 400,
    powergridUsed: 50,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
    droneDps: 0,
    droneBandwidthUsed: 0,
    droneBandwidthTotal: 0,
    droneCapacity: 0,
    ehp: 4619,
    capacitor: { stable: true, stablePercentage: 60 },
    capacitorCapacity: 250,
    capacitorRechargeTime: 100000,
    shield: layer(450, 514),
    armor: layer(405, 3234),
    hull: layer(350, 871),
    targeting: {
      maxTargetRange: 20000,
      maxLockedTargets: 4,
      scanResolution: 600,
      signatureRadius: 35,
    },
    navigation: { maxVelocity: 350, agility: 3.2, mass: 1000000, warpSpeed: 5 },
    unknownItemTypeIds: [],
    slotCounts: { high: 3, medium: 3, low: 4, rig: 3, subsystem: 0 },
    modules: [],
    ...overrides,
  };
}

const guristas = BUILT_IN_DAMAGE_PROFILES.find((p) => p.id === 'builtin:guristas')!;

function damageProfiles(overrides: Partial<DamageProfiles> = {}): DamageProfiles {
  return {
    custom: [],
    selected: guristas,
    select: vi.fn(),
    saveCustom: vi.fn(),
    deleteCustom: vi.fn(),
    ...overrides,
  };
}

function renderSections(fittingStats: FittingStats, profiles: DamageProfiles) {
  render(
    <FittingStatsSections
      stats={fittingStats}
      statsProgress={null}
      statsError={false}
      price={null}
      damageProfiles={profiles}
    />
  );
}

describe('FittingStatsSections — Defense', () => {
  it('shows each layer with its raw HP and its EHP under the profile', () => {
    renderSections(stats(), damageProfiles());

    expect(screen.getByText('Shield — 450 HP · 514 EHP')).toBeInTheDocument();
    expect(screen.getByText('Armor — 405 HP · 3234 EHP')).toBeInTheDocument();
    expect(screen.getByText('Hull — 350 HP · 871 EHP')).toBeInTheDocument();
    expect(screen.getByText('4619 EHP')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Damage profile' })).toHaveTextContent('Guristas');
  });

  it("labels a Reactive Armor Hardener's resists as adapted to the chosen profile", () => {
    renderSections(
      stats({
        modules: [
          {
            state: 'active',
            maxState: 'overload',
            chargeGroupIds: [],
            adaptedResonances: {
              emResonance: 1,
              thermalResonance: 0.7,
              kineticResonance: 0.5,
              explosiveResonance: 1,
            },
          },
        ],
      }),
      damageProfiles()
    );

    expect(screen.getByText('Reactive Armor Hardener — adapted to Guristas')).toBeInTheDocument();
    expect(
      screen.getByText('Includes the Reactive Armor Hardener, adapted to Guristas.')
    ).toBeInTheDocument();
  });

  it('adds no RAH label when none is fitted', () => {
    renderSections(stats(), damageProfiles());

    expect(screen.queryByText(/Reactive Armor Hardener/)).not.toBeInTheDocument();
  });
});

describe('FittingStatsSections — custom damage profiles', () => {
  it('creates a custom profile from the manage dialog', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    renderSections(stats(), damageProfiles({ saveCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'New profile' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Drifters');
    await user.clear(within(dialog).getByLabelText('EM'));
    await user.type(within(dialog).getByLabelText('EM'), '60');
    await user.clear(within(dialog).getByLabelText('Kinetic'));
    await user.clear(within(dialog).getByLabelText('Explosive'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(saveCustom).toHaveBeenCalledWith({
      id: expect.stringMatching(/^custom:/),
      name: 'Drifters',
      em: 60,
      thermal: 25,
      kinetic: 0,
      explosive: 0,
    });
  });

  it('refuses an all-zero mix', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    renderSections(stats(), damageProfiles({ saveCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'New profile' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Nothing');
    for (const type of ['EM', 'Thermal', 'Kinetic', 'Explosive']) {
      await user.clear(within(dialog).getByLabelText(type));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(saveCustom).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('at least one above zero');
  });

  it('edits and deletes an existing custom profile', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    const deleteCustom = vi.fn();
    const mine = { id: 'custom:a', name: 'Mine', em: 1, thermal: 1, kinetic: 0, explosive: 0 };
    renderSections(stats(), damageProfiles({ custom: [mine], saveCustom, deleteCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Edit Mine' }));
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(saveCustom).toHaveBeenCalledWith({ ...mine, name: 'Renamed' });

    await user.click(within(dialog).getByRole('button', { name: 'Delete Mine' }));
    expect(deleteCustom).toHaveBeenCalledWith('custom:a');
  });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BUILT_IN_DAMAGE_PROFILES } from '@/engine/fittings/damageProfile';
import type { FittingStats } from '@/engine/fittings/types';
import { BUILT_IN_TARGET_PROFILES } from '@/engine/fittings/targetProfile';
import type { AppliedWeapon } from '@/engine/fittings/appliedDps';
import type { DamageProfiles } from './damageProfiles';
import type { TargetProfiles } from './targetProfiles';
import type { OverlayFitting } from './useOverlayFitting';
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
    applied: { weapons: [], droneControlRange: 20000 },
    slotCounts: { high: 3, medium: 3, low: 4, rig: 3, subsystem: 0 },
    modules: [],
    ...overrides,
  };
}

const guristas = BUILT_IN_DAMAGE_PROFILES.find((p) => p.id === 'builtin:guristas')!;

function damageProfiles(overrides: Partial<DamageProfiles> = {}): DamageProfiles {
  return {
    hydrated: true,
    custom: [],
    selected: guristas,
    select: vi.fn(),
    saveCustom: vi.fn(),
    deleteCustom: vi.fn(),
    ...overrides,
  };
}

const [frigate, cruiser] = BUILT_IN_TARGET_PROFILES;

function targetProfiles(overrides: Partial<TargetProfiles> = {}): TargetProfiles {
  return {
    custom: [],
    selected: cruiser,
    select: vi.fn(),
    saveCustom: vi.fn(),
    deleteCustom: vi.fn(),
    ...overrides,
  };
}

function renderSections(
  fittingStats: FittingStats,
  profiles: DamageProfiles,
  targets: TargetProfiles = targetProfiles(),
  overlay?: OverlayFitting
) {
  return render(
    <FittingStatsSections
      stats={fittingStats}
      statsProgress={null}
      statsError={false}
      price={null}
      damageProfiles={profiles}
      targetProfiles={targets}
      overlay={overlay}
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

const blaster: AppliedWeapon = {
  kind: 'turret',
  dps: 100,
  optimal: 3600,
  falloff: 10000,
  tracking: 5.196,
  optimalSigRadius: 40000,
};

function armed(weapons: AppliedWeapon[] = [blaster]) {
  return stats({ applied: { weapons, droneControlRange: 20000 } });
}

describe('FittingStatsSections — Applied DPS', () => {
  // The graphs are lazy; load recharts once up front so the first findBy
  // doesn't spend its whole timeout on the import.
  beforeAll(async () => {
    await import('./AppliedDpsChart');
  }, 60000);

  it('moves applied DPS with the target profile, never raw DPS', () => {
    const { rerender } = renderSections(armed(), damageProfiles(), targetProfiles());
    const summary = () => screen.getByText(/^Raw DPS/).textContent ?? '';
    const againstCruiser = summary();
    expect(againstCruiser).toMatch(/^Raw DPS 100\.0 · applied/);
    expect(screen.getByRole('combobox', { name: 'Target profile' })).toHaveTextContent(
      'NPC cruiser'
    );

    rerender(
      <FittingStatsSections
        stats={armed()}
        statsProgress={null}
        statsError={false}
        price={null}
        damageProfiles={damageProfiles()}
        targetProfiles={targetProfiles({ selected: frigate })}
      />
    );
    expect(summary()).toMatch(/^Raw DPS 100\.0 · applied/);
    expect(summary()).not.toBe(againstCruiser);
    expect(screen.getByText(/Our own calculation/)).toBeInTheDocument();
  });

  it('draws both graphs, with an accessible table for each', async () => {
    renderSections(armed(), damageProfiles());

    expect(await screen.findByRole('table', { name: 'Applied DPS vs range' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /^Applied DPS vs target speed, at [\d.]+ km$/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Applied DPS vs range' })).toBeInTheDocument();
  });

  it('says so when nothing is firing', () => {
    renderSections(armed([]), damageProfiles());

    expect(screen.getByText(/No weapons are running/)).toBeInTheDocument();
    expect(screen.queryByText(/^Raw DPS/)).not.toBeInTheDocument();
  });

  it('overlays a second fitting as a dashed line, named in the key and the tables', async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    const overlay: OverlayFitting = {
      options: [{ id: 'f1', name: 'Kiting Vexor' }],
      selectedId: 'f1',
      select,
      result: {
        name: 'Kiting Vexor',
        applied: { weapons: [{ ...blaster, dps: 80 }], droneControlRange: 20000 },
      },
    };
    const { container } = renderSections(armed(), damageProfiles(), targetProfiles(), overlay);

    const rangeTable = await screen.findByRole('table', { name: 'Applied DPS vs range' });
    expect(
      within(rangeTable).getByRole('columnheader', { name: 'Kiting Vexor' })
    ).toBeInTheDocument();
    expect(container.querySelector('svg line[stroke-dasharray="4 3"]')).not.toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Compare with' }));
    await user.click(await screen.findByRole('option', { name: 'No overlay' }));
    expect(select).toHaveBeenCalledWith(null);
  });

  it('creates a custom target profile from its manage dialog', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    renderSections(armed(), damageProfiles(), targetProfiles({ saveCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage targets' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'New profile' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Kiting frig');
    await user.clear(within(dialog).getByLabelText('Signature radius (m)'));
    await user.type(within(dialog).getByLabelText('Signature radius (m)'), '30');
    await user.clear(within(dialog).getByLabelText('Speed (m/s)'));
    await user.type(within(dialog).getByLabelText('Speed (m/s)'), '2500');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(saveCustom).toHaveBeenCalledWith({
      id: expect.stringMatching(/^custom:/),
      name: 'Kiting frig',
      signatureRadius: 30,
      velocity: 2500,
    });
  });

  it('refuses a zero signature radius', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    renderSections(armed(), damageProfiles(), targetProfiles({ saveCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage targets' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'New profile' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Nothing');
    await user.clear(within(dialog).getByLabelText('Signature radius (m)'));
    await user.type(within(dialog).getByLabelText('Signature radius (m)'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(saveCustom).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('signature radius above zero');
  });
});

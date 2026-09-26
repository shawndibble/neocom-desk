import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
import { db } from '@/db';
import { useStatsSectionsPreference } from './statsSectionsPreference';
import { useOverheatAll } from './statsConditions';
import { configureClipboard } from '@/lib/clipboard';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Fitting } from '@/engine/fittings/types';
import { FittingItemActionsProvider } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';

beforeEach(async () => {
  await db.settings.clear();
  useStatsSectionsPreference.setState({ value: {}, hydrated: false });
  useOverheatAll.setState({ overheatAll: false });
});
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';

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
    maxActiveDrones: 0,
    droneBandwidthByType: {},
    hardpoints: { turrets: 0, launchers: 0 },
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
    offense: { weapons: [], dps: 0, volley: 0, overheated: null, chargelessWeaponCount: 0 },
    repair: { shield: 0, armor: 0, hull: 0 },
    overheated: null,
    ...neutralExtendedStats(),
    ...overrides,
  };
}

const NAMES: Record<number, string> = {
  3186: 'Neutron Blaster Cannon II',
  230: 'Antimatter Charge M',
  2488: 'Warrior II',
};
const typeName = (typeId: number) => NAMES[typeId] ?? `#${typeId}`;

/** Two blasters that overheat, five drones, an armor rep, and a shield hardener under heat. */
function heatedStats(): FittingStats {
  const base = stats();
  return {
    ...base,
    offense: {
      weapons: [
        {
          typeId: 3186,
          chargeTypeId: 230,
          isDrone: false,
          count: 2,
          dps: 53.7,
          volley: 304,
          overheated: { dps: 61.7, volley: 350 },
        },
        { typeId: 2488, isDrone: true, count: 5, dps: 120, volley: 480, overheated: null },
      ],
      dps: 173.7,
      volley: 784,
      overheated: { dps: 181.7, volley: 830 },
      chargelessWeaponCount: 0,
    },
    repair: { shield: 0, armor: 63.2, hull: 0 },
    overheated: {
      ehp: 17400,
      maxVelocity: base.navigation.maxVelocity,
      repair: { shield: 0, armor: 81.8, hull: 0 },
      shield: { ...base.shield, emResonance: 0.4 },
      armor: base.armor,
      hull: base.hull,
    },
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
  profiles: DamageProfiles = damageProfiles(),
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
      typeName={typeName}
    />
  );
}

function sectionBody(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('section')!;
}

describe('FittingStatsSections offense weapon menu', () => {
  const blasters: Fitting = {
    name: 'Brutix',
    shipTypeId: 16229,
    modules: [
      { slot: 'high', slotIndex: 0, typeId: 3186, state: 'active', chargeTypeId: 230 },
      { slot: 'high', slotIndex: 1, typeId: 3186, state: 'active', chargeTypeId: 230 },
      // Same blaster, other charge: another row, not this one.
      { slot: 'high', slotIndex: 2, typeId: 3186, state: 'active', chargeTypeId: 231 },
    ],
    drones: [],
    cargo: [{ typeId: 229, quantity: 1000 }],
  };

  function renderWithActions() {
    const actions = fakeItemActions(
      { names: { ...NAMES, 229: 'Null M', 232: 'Void M' }, cargoCharges: [229, 230] },
      { chargesFor: () => [229, 230, 232] }
    );
    render(
      <MemoryRouter>
        <FittingItemActionsProvider value={actions}>
          <FittingStatsSections
            stats={heatedStats()}
            statsProgress={null}
            statsError={false}
            price={null}
            damageProfiles={damageProfiles()}
            targetProfiles={targetProfiles()}
            typeName={typeName}
            fitting={blasters}
          />
        </FittingItemActionsProvider>
      </MemoryRouter>
    );
    return actions;
  }

  const group = [
    { slot: 'high', slotIndex: 0 },
    { slot: 'high', slotIndex: 1 },
  ];

  it('changes the charge of just that weapon group, from cargo', async () => {
    const actions = renderWithActions();
    const offense = within(sectionBody('Offense'));
    fireEvent.pointerDown(
      offense.getByRole('button', { name: 'More actions for 2× Neutron Blaster Cannon II' }),
      { button: 0, pointerType: 'mouse' }
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change charge' }));
    // The charge it already holds isn't offered again.
    expect(screen.queryByRole('menuitem', { name: 'Antimatter Charge M' })).toBeNull();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Null M' }));
    expect(actions.charges.load).toHaveBeenCalledWith(229, { fromCargo: true, only: group });
  });

  it('offers every other charge the group takes too, loaded without touching the hold', async () => {
    const actions = renderWithActions();
    fireEvent.pointerDown(
      within(sectionBody('Offense')).getByRole('button', {
        name: 'More actions for 2× Neutron Blaster Cannon II',
      }),
      { button: 0, pointerType: 'mouse' }
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change charge' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Void M' }));
    expect(actions.charges.load).toHaveBeenCalledWith(232, { fromCargo: false, only: group });
  });

  it('sets the group’s state, and opens on a right-click of the row too', async () => {
    const actions = renderWithActions();
    fireEvent.contextMenu(within(sectionBody('Offense')).getByText('2× Neutron Blaster Cannon II'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'State' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Online' }));
    expect(actions.setGroupState).toHaveBeenCalledWith(group, 'online');
  });

  it('gives drone rows no weapon menu', () => {
    renderWithActions();
    expect(
      screen.queryByRole('button', { name: 'More actions for 5× Warrior II' })
    ).not.toBeInTheDocument();
  });
});

describe('FittingStatsSections offense', () => {
  it('lists each weapon group and drone type with its DPS and volley, and the total', () => {
    renderSections(heatedStats());
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
    renderSections(heatedStats());
    const offense = within(sectionBody('Offense'));

    expect(offense.getByText('61.7 overheated')).toBeInTheDocument();
    expect(offense.getByText('350 overheated')).toBeInTheDocument();
    expect(offense.getByText('181.7 overheated')).toBeInTheDocument();
    expect(offense.getByText("Drones don't overheat")).toBeInTheDocument();
  });

  it('says so when nothing is firing', () => {
    renderSections(stats());

    expect(within(sectionBody('Offense')).getByText('Nothing is firing.')).toBeInTheDocument();
  });

  it('blames the missing charge, not activation, when weapons are active but empty', () => {
    renderSections(
      stats({
        offense: { weapons: [], dps: 0, volley: 0, overheated: null, chargelessWeaponCount: 3 },
      })
    );
    const offense = within(sectionBody('Offense'));

    expect(offense.getByText(/3 weapons have no charge loaded/)).toBeInTheDocument();
    expect(offense.queryByText('Nothing is firing.')).not.toBeInTheDocument();
  });
});

describe('FittingStatsSections overheated lines elsewhere', () => {
  it('shows overheated EHP and repair in Defense, and none in Navigation when speed is unchanged', () => {
    renderSections(heatedStats());

    const defense = within(sectionBody('Defense'));
    expect(defense.getByText('17400 overheated')).toBeInTheDocument();
    expect(defense.getByText('Armor repair: 63.2 HP/s')).toBeInTheDocument();
    expect(defense.getByText('81.8 overheated')).toBeInTheDocument();
    // Only the shield moves under heat, so one overheated row, under it.
    const hotRows = defense.getAllByRole('row', { name: /^Overheated/ });
    expect(hotRows).toHaveLength(1);
    expect(within(hotRows[0]).getByText('60%')).toBeInTheDocument();
    expect(within(sectionBody('Navigation')).queryByText(/overheated/)).toBeNull();
  });

  it('shows no overheated line anywhere when no module can overheat', () => {
    renderSections(stats());

    expect(screen.queryByText(/overheated/)).toBeNull();
  });
});

describe('FittingStatsSections — Defense', () => {
  it('shows each layer with its raw HP and its EHP under the profile', () => {
    renderSections(stats(), damageProfiles());

    for (const [layer, hp, ehp] of [
      ['Shield', '450 HP', '514'],
      ['Armor', '405 HP', '3234'],
      ['Hull', '350 HP', '871'],
    ]) {
      const row = within(screen.getByRole('row', { name: new RegExp(`^${layer}`) }));
      expect(row.getByText(hp)).toBeInTheDocument();
      expect(row.getByText(ehp)).toBeInTheDocument();
    }
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

    const rah = within(screen.getByRole('row', { name: /^Reactive Armor Hardener/ }));
    expect(rah.getByText('Guristas')).toBeInTheDocument();
    expect(rah.getByText('30%')).toBeInTheDocument();
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
        typeName={typeName}
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

  it('blames the missing charge, not activation, when weapons are active but empty', () => {
    renderSections(
      stats({
        applied: { weapons: [], droneControlRange: 20000 },
        offense: { weapons: [], dps: 0, volley: 0, overheated: null, chargelessWeaponCount: 3 },
      }),
      damageProfiles()
    );

    const appliedDps = within(sectionBody('Applied DPS'));
    expect(appliedDps.getByText(/3 weapons have no charge loaded/)).toBeInTheDocument();
    expect(appliedDps.queryByText(/No weapons are running/)).not.toBeInTheDocument();
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

  it('gives a custom target profile resists', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    renderSections(armed(), damageProfiles(), targetProfiles({ saveCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage targets' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'New profile' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Guristas cruiser');
    await user.type(within(dialog).getByLabelText('Kinetic resist (%)'), '50');
    await user.type(within(dialog).getByLabelText('Thermal resist (%)'), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(saveCustom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Guristas cruiser',
        resists: { em: 0, thermal: 0.4, kinetic: 0.5, explosive: 0 },
      })
    );
  });

  it('refuses a resist over 100%', async () => {
    const user = userEvent.setup();
    const saveCustom = vi.fn();
    renderSections(armed(), damageProfiles(), targetProfiles({ saveCustom }));

    await user.click(screen.getByRole('button', { name: 'Manage targets' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'New profile' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Wall');
    await user.type(within(dialog).getByLabelText('EM resist (%)'), '120');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(saveCustom).not.toHaveBeenCalled();
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

describe('FittingStatsSections — a failed calculation', () => {
  function renderFailed(reason: 'skills' | 'shipData', onRetry = vi.fn()) {
    render(
      <FittingStatsSections
        stats={null}
        statsProgress={null}
        statsError
        statsErrorReason={reason}
        onRetry={onRetry}
        price={null}
        damageProfiles={damageProfiles()}
        targetProfiles={targetProfiles()}
        typeName={typeName}
      />
    );
    return onRetry;
  }

  it('says once what failed, and retries on request', async () => {
    const onRetry = renderFailed('shipData');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load ship data for this fit.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('names the Character’s skills when those are what failed', () => {
    renderFailed('skills');
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load this Character's skills, so the stats can't be worked out."
    );
  });
});

describe('FittingStatsSections — remembered layout', () => {
  it('keeps a section the pilot collapsed collapsed after the stats are shown again', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSections(stats());
    const toggle = () => screen.getByRole('button', { name: 'Defense' });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    unmount();

    // A fresh load reads the choice back from storage, not from memory.
    useStatsSectionsPreference.setState({ value: {}, hydrated: false });
    renderSections(stats());
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-expanded', 'false'));
    // Sections the pilot never touched keep their defaults.
    expect(screen.getByRole('button', { name: 'Offense' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Price' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('FittingStatsSections — Overheat all and Copy stats', () => {
  /**
   * `heatedStats()` as "Overheat all" hands it over: the heated figures are
   * the figures, the unheated ones ride along. The blasters' DPS rises with
   * heat but — as a launcher's does — their volley doesn't.
   */
  function allOverheatedStats(): FittingStats {
    const base = heatedStats();
    const unheated: FittingStats = {
      ...base,
      applied: { weapons: [blaster], droneControlRange: 20000 },
      overheated: null,
      offense: {
        ...base.offense,
        weapons: base.offense.weapons.map((row) => ({ ...row, overheated: null })),
        overheated: null,
      },
    };
    const [blasters, drones] = unheated.offense.weapons;
    return {
      ...unheated,
      ehp: 17400,
      repair: { shield: 0, armor: 81.8, hull: 0 },
      shield: { ...base.shield, emResonance: 0.4 },
      applied: { weapons: [{ ...blaster, dps: 115 }], droneControlRange: 20000 },
      offense: {
        ...unheated.offense,
        weapons: [{ ...blasters, dps: 61.7 }, drones],
        dps: 181.7,
      },
      allOverheated: true,
      unheated,
    };
  }

  const inWarningTone = (element: HTMLElement) => element.closest('.text-warning') !== null;

  it('turns Overheat all on for every calculation', async () => {
    const user = userEvent.setup();
    renderSections(heatedStats());
    await user.click(screen.getByRole('checkbox', { name: 'Overheat all' }));
    expect(useOverheatAll.getState().overheatAll).toBe(true);
  });

  it('reads only the figures heat changed in the warning tone, with their unheated value on hover', () => {
    renderSections(allOverheatedStats());

    // The Defense headline: heated, and what it reads unheated.
    const ehp = screen.getByText('17400 EHP');
    expect(inWarningTone(ehp)).toBe(true);
    expect(ehp).toHaveAttribute('title', 'Unheated: 4619 EHP');
    // Colour and hover alone reach neither touch nor screen readers: the value is also in the text.
    expect(ehp).toHaveTextContent('(Unheated: 4619 EHP)');
    expect(inWarningTone(screen.getByText('Armor repair: 81.8 HP/s'))).toBe(true);

    // Offense: the blasters' DPS moved, their volley and the drones didn't.
    const offense = within(sectionBody('Offense'));
    expect(inWarningTone(offense.getByText('61.7 DPS'))).toBe(true);
    expect(inWarningTone(offense.getByText('304 volley'))).toBe(false);
    expect(inWarningTone(offense.getByText('120.0 DPS'))).toBe(false);
    // The total, in the body and as the section's headline.
    expect(offense.getAllByText('181.7 DPS').every(inWarningTone)).toBe(true);

    // Resists: only the shield's EM cell moved.
    const shield = within(screen.getByRole('row', { name: /^Shield/ }));
    expect(inWarningTone(shield.getByText('60%'))).toBe(true);
    expect(shield.getAllByText('50%').some(inWarningTone)).toBe(false);
    const armor = within(screen.getByRole('row', { name: /^Armor/ }));
    expect(armor.getAllByText('50%').some(inWarningTone)).toBe(false);

    // Applied DPS moves with the weapons' raw DPS.
    expect(inWarningTone(screen.getByText(/^Raw DPS 115\.0/))).toBe(true);

    // What heat never touches stays in the normal tone.
    expect(screen.getAllByText('350 m/s').some(inWarningTone)).toBe(false);
    expect(screen.getAllByText('20.0 km').some(inWarningTone)).toBe(false);
    for (const section of ['Capacitor', 'Targeting', 'Navigation', 'Drones']) {
      expect(sectionBody(section).querySelector('.text-warning')).toBeNull();
    }

    // No second, "overheated" number beside the heated one.
    expect(screen.queryByText(/overheated$/)).toBeNull();
  });

  it('marks a heated support module’s amount or range, and the capacitor drain it costs, but not the rest', () => {
    const neut = {
      kind: 'neutralizer' as const,
      typeId: 12267,
      count: 1,
      amount: 15,
      optimal: 10000,
      falloff: 0,
    };
    const scram = {
      kind: 'warpDisruption' as const,
      typeId: 448,
      count: 1,
      amount: 2,
      optimal: 9000,
      falloff: 0,
    };
    const base = stats();
    const unheated: FittingStats = {
      ...base,
      support: { ...base.support, rows: [neut, scram], neutralizer: 15 },
      capacitorBudget: { ...base.capacitorBudget, peakRecharge: 10, drain: 20, delta: -10 },
    };
    renderSections({
      ...unheated,
      support: {
        ...unheated.support,
        rows: [
          { ...neut, amount: 17.6 },
          { ...scram, optimal: 10800 },
        ],
        neutralizer: 17.6,
      },
      capacitorBudget: { ...unheated.capacitorBudget, drain: 23.5, delta: -13.5 },
      allOverheated: true,
      unheated,
    });

    const support = within(sectionBody('Support out'));
    // The neutralizer drains harder, at the same range.
    expect(inWarningTone(support.getByText('17.6 GJ/s neutralized'))).toBe(true);
    expect(inWarningTone(support.getByText('10.0 km'))).toBe(false);
    // The scrambler reaches further, with the same two points.
    expect(inWarningTone(support.getByText('10.8 km'))).toBe(true);
    expect(support.getByText('10.8 km')).toHaveAttribute('title', 'Unheated: 9.0 km');

    const capacitor = within(sectionBody('Capacitor'));
    expect(inWarningTone(capacitor.getByText('−23.5 GJ/s'))).toBe(true);
    expect(inWarningTone(capacitor.getByText('10.0 GJ/s'))).toBe(false);
    expect(inWarningTone(capacitor.getByText('250 GJ'))).toBe(false);
  });

  it('has nothing to overheat on a fit with no module that can', () => {
    renderSections(stats());
    expect(screen.getByRole('checkbox', { name: 'Overheat all' })).toBeDisabled();
  });

  it('copies the headline stats as text', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    const user = userEvent.setup();
    renderSections(heatedStats());
    await user.click(screen.getByRole('button', { name: 'Copy stats' }));
    expect(written[0]).toMatch(/^DPS 173\.7 \(181\.7 overheated\)/);
    expect(await screen.findByText('Stats copied')).toBeInTheDocument();
    configureClipboard(null);
  });
});

describe('FittingStatsSections — resources', () => {
  it('names both lock limits when the pilot and the hull differ', async () => {
    const user = userEvent.setup();
    renderSections(stats({ lockedTargets: { ship: 7, pilot: 3, effective: 3 } }));
    await user.click(screen.getByRole('button', { name: 'Targeting' }));
    expect(screen.getByText('3 (hull 7, pilot 3)')).toBeInTheDocument();
  });

  it('reads out the holds, the sensor and the jump drive in Fitting', async () => {
    const user = userEvent.setup();
    renderSections(
      stats({
        holds: { cargo: 450, fleetHangar: 5000, miningHold: 0 },
        sensor: { strength: 21.6, type: 'gravimetric' },
        jumpDrive: { rangeLightYears: 7, fuelTypeId: 16274, fuelPerLightYear: 3000 },
      })
    );
    await user.click(screen.getByRole('button', { name: 'Fitting' }));
    const fitting = within(sectionBody('Fitting'));
    expect(fitting.getByText('450 m³')).toBeInTheDocument();
    expect(fitting.getByText('5000 m³')).toBeInTheDocument();
    expect(fitting.queryByText('Mining hold')).toBeNull();
    expect(fitting.getByText('21.6 Gravimetric')).toBeInTheDocument();
    expect(fitting.getByText('7.00 ly')).toBeInTheDocument();
    expect(fitting.getByText('3000 #16274/ly')).toBeInTheDocument();
  });
});

describe('FittingStatsSections — Support out', () => {
  it('lists what each support module hands out, at its range', () => {
    const neutral = stats().support;
    renderSections(
      stats({
        support: {
          ...neutral,
          rows: [
            {
              kind: 'remoteArmor',
              typeId: 26913,
              count: 2,
              amount: 85.3,
              optimal: 10500,
              falloff: 3000,
            },
            { kind: 'web', typeId: 527, count: 1, amount: 60, optimal: 10000, falloff: 0 },
            { kind: 'warpDisruption', typeId: 448, count: 1, amount: 2, optimal: 9000, falloff: 0 },
          ],
          remoteRepair: { shield: 0, armor: 85.3, hull: 0 },
        },
      })
    );
    const support = within(sectionBody('Support out'));
    expect(support.getAllByText('85.3 HP/s')).toHaveLength(1);
    expect(support.getByText('85.3 HP/s armor')).toBeInTheDocument();
    expect(support.getByText('10.5 + 3.0 km')).toBeInTheDocument();
    expect(support.getByText('−60% speed')).toBeInTheDocument();
    expect(support.getByText('2 points')).toBeInTheDocument();
  });

  it('has no Support out section when nothing reaches another ship', () => {
    renderSections(stats());
    expect(screen.queryByRole('heading', { name: 'Support out' })).toBeNull();
  });
});

describe('FittingStatsSections — Mining', () => {
  it('shows each miner with its crystal, the total, the residue and when the ore hold fills', () => {
    renderSections(
      stats({
        holds: { cargo: 350, fleetHangar: 0, miningHold: 11500 },
        mining: {
          rows: [
            {
              typeId: 17912,
              chargeTypeId: 60281,
              isDrone: false,
              count: 2,
              perCycle: 1122,
              cycleSeconds: 32.5,
              perSecond: 34.5,
              wastePerSecond: 12.7,
            },
          ],
          perSecond: 34.5,
          perHour: 124200,
          wastePerSecond: 12.7,
          wastePct: 36.8,
        },
      })
    );
    const mining = within(sectionBody('Mining'));
    expect(mining.getByText('2× #17912')).toBeInTheDocument();
    expect(mining.getByText('Crystal: #60281')).toBeInTheDocument();
    expect(mining.getByText('1122 m³ / 32.5 s')).toBeInTheDocument();
    expect(mining.getAllByText('34.5 m³/s').length).toBeGreaterThan(0);
    expect(mining.getByText('124.2K m³/h')).toBeInTheDocument();
    expect(mining.getByText('−36.8% expected (12.7 m³/s)')).toBeInTheDocument();
    expect(mining.getByText('Mining hold full in')).toBeInTheDocument();
    expect(mining.getByText('5m (11500 m³)')).toBeInTheDocument();
  });
});

describe('FittingStatsSections — Fighters', () => {
  it('shows fighter DPS, tubes and the bay on a hull with tubes', () => {
    const neutral = stats().fighters;
    renderSections(
      stats({
        fighters: {
          ...neutral,
          dps: 822.7,
          tubes: { used: 2, total: 4 },
          bay: { used: 36000, total: 93750 },
        },
      })
    );
    const fighters = within(sectionBody('Fighters'));
    expect(fighters.getAllByText('822.7 DPS').length).toBeGreaterThan(0);
    expect(fighters.getByText('2 / 4')).toBeInTheDocument();
    expect(fighters.getByText('36000 / 93750 m³')).toBeInTheDocument();
  });

  it('has no Fighters section on a hull without tubes', () => {
    renderSections(stats());
    expect(screen.queryByRole('heading', { name: 'Fighters' })).toBeNull();
  });
});

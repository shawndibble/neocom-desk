import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { industryTabHref } from '@/features/industry/industryTabs';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { FITTING_EDIT_PATH } from '../fittingRoutes';
import { INTERCEPTORS, MERLIN } from './__fixtures__/shipTreeFixture';
import { clearShipTreeCatalogCache } from './shipTreeCatalogs';
import { ShipTreeTab } from './ShipTreeTab';
import { useShipInfoShowMissing, useShipTreeViewPreference } from './shipTreeViewPreference';

vi.mock('@/engine/fitting/fittingShare', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/engine/fitting/fittingShare')>();
  return { ...real, encodeFittingShare: vi.fn(real.encodeFittingShare) };
});
const { usePopularFitsMock } = vi.hoisted(() => ({ usePopularFitsMock: vi.fn() }));
vi.mock('../popularFits', () => ({ usePopularFits: usePopularFitsMock }));
vi.mock('@/sde/loadSde', async (importOriginal) => {
  const f = await import('./__fixtures__/shipTreeFixture');
  return {
    ...(await importOriginal<object>()),
    loadShipTree: vi.fn(async () => f.SHIP_TREE),
    loadMasteries: vi.fn(async () => f.MASTERIES),
  };
});
vi.mock('@/features/skills/skillMap', async (importOriginal) => {
  const f = await import('./__fixtures__/shipTreeFixture');
  return {
    ...(await importOriginal<object>()),
    loadSkillCatalog: vi.fn(async () => f.CATALOG),
  };
});
const ATTRIBUTES = { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };
const NO_TRAINED = new Map();
vi.mock('@/features/skills/planner/usePlanEditorData', async () => {
  const f = await import('./__fixtures__/shipTreeFixture');
  return {
    usePlanEditorData: (characterId: number | null) => ({
      catalog: characterId === null ? null : f.CATALOG,
      trainedSkills: characterId === null ? NO_TRAINED : f.TRAINED,
      trainedSkillsKnown: characterId !== null,
      attributes: ATTRIBUTES,
      implants: {},
    }),
  };
});
const target: TargetPlan = {
  plans: [],
  targetPlanId: null,
  setTargetPlanId: vi.fn(),
  addEntries: vi.fn(async (entries) => ({ planId: 'p', planName: 'Crow', added: [...entries] })),
  removeEntries: vi.fn(async () => {}),
};
vi.mock('@/features/skills/useTargetPlan', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTargetPlan: () => target,
}));

const MERLIN_BLUEPRINT = 954;
vi.mock('@/features/industry/blueprintCatalog', async (importOriginal) => {
  const entry = {
    blueprintTypeID: 954,
    blueprint: {
      name: 'Merlin Blueprint',
      time: 6000,
      materials: [],
      products: [{ typeID: 603, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID: 603,
    productName: 'Merlin',
    productNameLower: 'merlin',
  };
  const catalog = {
    entries: [entry],
    byBlueprintTypeID: new Map([[954, entry]]),
    byProductTypeID: new Map([[603, entry]]),
    typesById: {},
  } as unknown as BlueprintCatalog;
  return {
    ...(await importOriginal<object>()),
    loadBlueprintCatalog: vi.fn(async () => catalog),
  };
});
const owned: CharacterBlueprint[] = [
  {
    item_id: 1,
    type_id: 954,
    runs: -1,
    material_efficiency: 10,
    time_efficiency: 20,
    quantity: -1,
    location_id: 1,
    location_flag: 'Hangar',
  },
  {
    item_id: 2,
    type_id: 954,
    runs: 5,
    material_efficiency: 0,
    time_efficiency: 0,
    quantity: -2,
    location_id: 1,
    location_flag: 'Hangar',
  },
  {
    item_id: 3,
    type_id: 954,
    runs: 5,
    material_efficiency: 0,
    time_efficiency: 0,
    quantity: -2,
    location_id: 1,
    location_flag: 'Hangar',
  },
];
vi.mock('@/features/industry/data', () => ({
  loadCharacterBlueprints: vi.fn(async () => ({
    cached: { data: owned, fetchedAt: new Date() },
    needsReauth: false,
  })),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

async function openShip(name: RegExp) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/tree']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ShipTreeTab />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  await user.click(await screen.findByRole('button', { name }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

beforeEach(async () => {
  clearShipTreeCatalogCache();
  usePopularFitsMock.mockReturnValue({ ok: true, fits: [] });
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  await useShipTreeViewPreference.getState().setValue('map');
  await useShipInfoShowMissing.getState().setValue(false);
  vi.mocked(target.addEntries).mockClear();
  target.plans = [];
  target.targetPlanId = null;
});

describe('Ship Info window', () => {
  it('heads the window with the hull, its standing and Mastery', async () => {
    const { dialog } = await openShip(/^Merlin/);
    expect(within(dialog).getByText('Caldari State · Frigate · Tech 1')).toBeVisible();
    expect(within(dialog).getAllByText('Can fly').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Mastery V')).toBeVisible();
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(['Description', 'Fitting', 'Skills & Mastery', 'Blueprint']);
  });

  it('Description: class and faction, the grouped bonuses, then the description', async () => {
    const { dialog } = await openShip(/^Merlin/);
    expect(within(dialog).getByText('Caldari Frigate bonuses (per skill level):')).toBeVisible();
    expect(within(dialog).getByText('Role bonus:')).toBeVisible();
    expect(within(dialog).getByText('bonus to shield resistances')).toBeVisible();
    expect(within(dialog).getByText(/most powerful combat frigate/)).toBeVisible();
    expect(within(dialog).getByText('Frigate')).toBeVisible();
  });

  it('Fitting: base slots and resources, and Simulate opens a new Fitting in the editor', async () => {
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Fitting' }));
    expect(within(dialog).getByText('High slots').nextElementSibling).toHaveTextContent('3');
    expect(within(dialog).getByText('Rig slots').nextElementSibling).toHaveTextContent('3 (small)');
    expect(within(dialog).getByText('CPU').nextElementSibling).toHaveTextContent('180 tf');
    expect(within(dialog).getByText('Base values, before your skills.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Simulate' }));
    await waitFor(() => {
      const [pathname, search] = screen.getByTestId('location').textContent!.split('?');
      expect(pathname).toBe(FITTING_EDIT_PATH);
      expect(new URLSearchParams(search).get('f')).toBeTruthy();
    });
  });

  it("Fitting: Simulate says so when the new Fitting can't be encoded", async () => {
    vi.mocked(encodeFittingShare).mockResolvedValueOnce({ ok: false, reason: 'too-large' });
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Fitting' }));
    await user.click(within(dialog).getByRole('button', { name: 'Simulate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Couldn't open this hull in the editor."
    );
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/ships\/tree$/);
    expect(within(dialog).getByRole('button', { name: 'Simulate' })).toBeEnabled();
  });

  it('Fitting: a Popular fit opens in the editor', async () => {
    const HULL_ID = 603;
    usePopularFitsMock.mockReturnValue({
      ok: true,
      fits: [
        {
          key: '100,200,300',
          count: 4,
          lastSeen: null,
          value: null,
          killmailIds: [9],
          parts: {
            hullTypeId: HULL_ID,
            modules: [
              { slot: 'high' as const, slotIndex: 0, typeId: 100, state: 'active' as const },
            ],
            drones: [],
            cargo: [],
            unresolved: [],
          },
        },
      ],
    });
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Fitting' }));
    expect(usePopularFitsMock.mock.lastCall?.[0]).toBe(HULL_ID);
    expect(within(dialog).getByText('4 losses')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toMatch(/\?f=/);
    });
    expect(vi.mocked(encodeFittingShare)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modules: expect.objectContaining({ high: [expect.objectContaining({ typeId: 100 })] }),
      })
    );
  });

  it('Fitting: a Tech III hull says its slots come from subsystems', async () => {
    const { user, dialog } = await openShip(/^Tengu/);
    await user.click(within(dialog).getByRole('tab', { name: 'Fitting' }));
    expect(within(dialog).getByText(/come from the subsystems/)).toBeVisible();
    expect(within(dialog).queryByText('High slots')).not.toBeInTheDocument();
  });

  it('Skills & Mastery: required skills, the tiers, and Add tier N to plan', async () => {
    const { user, dialog } = await openShip(/^Crow/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    expect(within(dialog).getByText('Required Skills')).toBeVisible();
    expect(within(dialog).getByText('You have no Mastery Level yet')).toBeVisible();
    const tiers = within(dialog).getByRole('group', { name: 'Mastery tiers' });
    expect(within(tiers).getAllByRole('button')).toHaveLength(5);

    await user.click(within(tiers).getByRole('button', { name: 'Tier II' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add tier II to plan' }));
    expect(target.addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: INTERCEPTORS, targetLevel: 3 }],
      'Crow'
    );
    expect(await screen.findByText(/Added 1 skill to Crow/)).toBeVisible();
  });

  it('Skills & Mastery: a tier already covered by the target Skill Plan shows In plan, not a no-op Add', async () => {
    target.plans = [
      {
        id: 'p1',
        characterId: 1,
        name: 'Crow plan',
        entries: [{ skillTypeID: INTERCEPTORS, targetLevel: 3 }],
        remapCount: 0,
        updatedAt: 1,
      },
    ];
    target.targetPlanId = 'p1';
    const { user, dialog } = await openShip(/^Crow/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    // The tier button itself says so before it's even selected.
    await user.click(within(dialog).getByRole('button', { name: 'Tier II, in plan' }));
    // The row shows a "Planned" badge; the footer reads "In plan" for the tier as a whole.
    expect(within(dialog).getByText('Planned')).toBeVisible();
    expect(within(dialog).getByText('In plan')).toBeVisible();
    // No button left to click that would silently no-op.
    expect(
      within(dialog).queryByRole('button', { name: 'Add tier II to plan' })
    ).not.toBeInTheDocument();
    expect(target.addEntries).not.toHaveBeenCalled();
  });

  it('Skills & Mastery: a tier lists only the skills it asks a level of', async () => {
    const { user, dialog } = await openShip(/^Crow/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    await user.click(within(dialog).getByRole('button', { name: 'Tier I' }));
    expect(within(dialog).queryByText(/Gallente Frigate/)).not.toBeInTheDocument();
  });

  it('Skills & Mastery: Show missing hides what the pilot already has trained', async () => {
    const { user, dialog } = await openShip(/^Crow/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    expect(within(dialog).getByText('Caldari Frigate')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Show missing' }));
    expect(within(dialog).getByRole('button', { name: 'Show missing' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Caldari Frigate IV is trained; Interceptors isn't, in the required list or tier I.
    expect(within(dialog).queryByText('Caldari Frigate')).not.toBeInTheDocument();
    expect(within(dialog).getAllByText(/^Interceptors/).length).toBeGreaterThan(0);
  });

  it('Skills & Mastery: Show missing on a fully trained hull says there is nothing left', async () => {
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    await user.click(within(dialog).getByRole('button', { name: 'Show missing' }));
    expect(within(dialog).getByText('All required skills trained.')).toBeVisible();
    expect(within(dialog).getByText('Every skill in this tier is trained.')).toBeVisible();
  });

  it('Skills & Mastery: no Show missing without a Character', async () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    expect(within(dialog).queryByRole('button', { name: 'Show missing' })).not.toBeInTheDocument();
  });

  it('Skills & Mastery: each untrained skill shows a training time, and the tier a total', async () => {
    const { user, dialog } = await openShip(/^Crow/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    await user.click(within(dialog).getByRole('button', { name: 'Tier II' }));

    // Interceptors III, untrained, gets a real duration rather than staying blank.
    expect(within(dialog).getByText(/^\d+d \d+h \d+m$|^\d+h \d+m$|^\d+m$/)).toBeVisible();
    // The footer totals the same training the tier's own row(s) still need.
    expect(within(dialog).getByText(/^Total /)).toBeVisible();
  });

  it('Skills & Mastery: a fully trained hull checks every tier', async () => {
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    expect(within(dialog).getByText('You have Mastery Level V')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Tier V, complete' })).toBeVisible();
    expect(within(dialog).getByText('All trained')).toBeVisible();
  });

  it('Blueprint: where to get one, what the pilot owns, and a Build Plan for the hull', async () => {
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Blueprint' }));
    expect(await within(dialog).findByText('Merlin Blueprint')).toBeVisible();
    expect(await within(dialog).findByText('You own an original · You own 2 copies')).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Find a copy' })).toHaveAttribute(
      'href',
      bpcSourcingHref(MERLIN_BLUEPRINT)
    );
    expect(within(dialog).getByRole('link', { name: 'View in Market' })).toHaveAttribute(
      'href',
      `/market/browser?type=${MERLIN_BLUEPRINT}`
    );
    expect(within(dialog).getByRole('link', { name: 'Plan to build it' })).toHaveAttribute(
      'href',
      `${industryTabHref('plans')}?product=${MERLIN}`
    );
  });

  it("Blueprint: says so when the blueprint catalog can't be loaded", async () => {
    vi.mocked(loadBlueprintCatalog).mockRejectedValueOnce(new Error('offline'));
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Blueprint' }));
    expect(await within(dialog).findByText("Couldn't load blueprint data.")).toBeVisible();
  });

  it('Blueprint: a hull nothing manufactures says so', async () => {
    const { user, dialog } = await openShip(/^Crow/);
    await user.click(within(dialog).getByRole('tab', { name: 'Blueprint' }));
    expect(
      await within(dialog).findByText("No blueprint — this hull isn't manufactured.")
    ).toBeVisible();
  });

  it('Blueprint: with no character, planning a build is disabled with a hint', async () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
    const { user, dialog } = await openShip(/^Merlin/);
    await user.click(within(dialog).getByRole('tab', { name: 'Blueprint' }));
    expect(await within(dialog).findByRole('button', { name: 'Plan to build it' })).toBeDisabled();
    expect(within(dialog).getByText('Log in with a character to plan a build.')).toBeVisible();
    expect(within(dialog).queryByText(/You own/)).not.toBeInTheDocument();
  });
});

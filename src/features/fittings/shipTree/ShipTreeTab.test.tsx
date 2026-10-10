import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { hullCountsFor, layoutShipTree } from '@/engine/shipTree/layout';
import { classNeedsOmega } from '@/engine/shipTree/rules';
import { CALDARI_FACTION_ID, treeFor } from '@/engine/shipTree/templates';
import { loadShipTree } from '@/sde/loadSde';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  CATALOG,
  CROW,
  HOOKBILL,
  IBIS,
  MERLIN,
  SHIP_TREE,
  TENGU,
  WORM,
} from './__fixtures__/shipTreeFixture';
import { clearShipTreeCatalogCache } from './shipTreeCatalogs';
import { ShipTreeTab } from './ShipTreeTab';
import { useShipTreeViewPreference } from './shipTreeViewPreference';

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
/** Whether the mocked /skills read has answered yet (usePlanEditorData's `trainedSkillsKnown`). */
const skills = vi.hoisted(() => ({ known: true }));
vi.mock('@/features/skills/planner/usePlanEditorData', async () => {
  const f = await import('./__fixtures__/shipTreeFixture');
  return {
    usePlanEditorData: (characterId: number | null) => ({
      catalog: characterId === null || !skills.known ? null : f.CATALOG,
      trainedSkills: characterId === null || !skills.known ? NO_TRAINED : f.TRAINED,
      trainedSkillsKnown: characterId !== null && skills.known,
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderTab(path = '/ships/tree') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
}

const tile = (container: HTMLElement, typeID: number) =>
  container.querySelector<HTMLElement>(`[data-ship="${typeID}"]`)!;

beforeEach(async () => {
  clearShipTreeCatalogCache();
  skills.known = true;
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  await useShipTreeViewPreference.getState().setValue(null);
});

describe('ShipTreeTab — map', () => {
  it('opens on the Caldari map by default, with every faction in the bar', async () => {
    renderTab();
    const map = await screen.findByRole('region', { name: 'Caldari State ship tree' });
    expect(map).toBeVisible();
    // 100% on open, not shrunk to fit the viewport.
    expect(screen.getByTestId('ship-tree-map')).toHaveAttribute('data-zoom', '1.00');
    // The faction panel and the legend sit inside the canvas, as in game.
    const bar = within(map).getByRole('group', { name: 'Factions' });
    expect(
      within(within(map).getByTestId('ship-tree-legend')).getByText('Mastery V')
    ).toBeVisible();
    expect(within(bar).getByRole('button', { name: /Caldari State/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(bar).getByRole('button', { name: /Guristas Pirates/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merlin — Can fly' })).toBeInTheDocument();
    expect(screen.getByText('4 / 5 hulls flyable')).toBeInTheDocument();
  });

  it('sets the artwork credit in a readable colour, not the decorative faint one', async () => {
    renderTab();
    await screen.findByRole('region', { name: 'Caldari State ship tree' });
    const credit = screen.getByText(/EVE Online artwork/);
    expect(credit).toHaveClass('text-text-dim');
    expect(credit).not.toHaveClass('text-text-faint');
  });

  it('marks each tile with its tone and tech corner', async () => {
    const { container } = renderTab();
    await screen.findByRole('region', { name: 'Caldari State ship tree' });
    expect(tile(container, MERLIN).dataset.tone).toBe('elite');
    expect(tile(container, IBIS).dataset.tone).toBe('canFly');
    expect(tile(container, CROW).dataset.tone).toBe('locked');
    expect(tile(container, CROW).querySelector('[data-tech]')?.textContent).toBe('II');
    expect(tile(container, TENGU).querySelector('[data-tech]')?.textContent).toBe('III');
    expect(tile(container, HOOKBILL).querySelector('[data-tech]')?.textContent).toBe('◇');
    expect(tile(container, IBIS).querySelector('[data-tech]')).toBeNull();
    // Merlin's badge reads V; a hull with no Mastery keeps an empty ring.
    expect(tile(container, MERLIN).querySelector('.ring')?.textContent).toBe('V');
    expect(tile(container, IBIS).querySelector('.ring')?.textContent).toBe('');
  });

  it('draws one Ω, before the Interceptor, and dims the locked class', async () => {
    const { container } = renderTab();
    await screen.findByRole('region', { name: 'Caldari State ship tree' });
    expect(container.querySelectorAll('[data-omega]')).toHaveLength(1);
    expect(container.querySelector('[data-class="10"]')).toHaveAttribute('data-unlocked', 'false');
    expect(container.querySelector('[data-class="8"]')).toHaveAttribute('data-unlocked', 'true');
  });

  it('shows the hover card with the bonuses grouped as in game', async () => {
    renderTab();
    fireEvent.mouseEnter(await screen.findByRole('button', { name: 'Merlin — Can fly' }));
    const card = screen.getByTestId('ship-tree-hover-card');
    expect(within(card).getByText('Caldari Frigate bonuses (per skill level):')).toBeVisible();
    expect(within(card).getByText('Role bonus:')).toBeVisible();
    expect(within(card).getByText('5%')).toBeVisible();
  });

  it('resets to 100% on a faction switch, even after the reader zoomed', async () => {
    const user = userEvent.setup();
    renderTab();
    const map = await screen.findByTestId('ship-tree-map');
    fireEvent.wheel(map, { deltaY: -300 });
    expect(map).not.toHaveAttribute('data-zoom', '1.00');
    await user.click(await screen.findByRole('button', { name: /Guristas Pirates/ }));
    expect(await screen.findByRole('region', { name: 'Guristas Pirates ship tree' })).toBeVisible();
    expect(screen.getByTestId('ship-tree-map')).toHaveAttribute('data-zoom', '1.00');
  });

  it('switches faction from the bar and keeps it in the URL', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('button', { name: /Guristas Pirates/ }));
    expect(await screen.findByRole('region', { name: 'Guristas Pirates ship tree' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/ships/tree?faction=500010');
    // Pirate classes link to both parent empires.
    expect(screen.getByRole('button', { name: 'Switch to Caldari State' })).toBeInTheDocument();
  });

  it('reads the faction from the URL and falls back to Caldari for one it lacks', async () => {
    const { unmount } = renderTab('/ships/tree?faction=500010');
    expect(await screen.findByRole('region', { name: 'Guristas Pirates ship tree' })).toBeVisible();
    unmount();
    renderTab('/ships/tree?faction=123');
    expect(await screen.findByRole('region', { name: 'Caldari State ship tree' })).toBeVisible();
  });

  it("searches every faction: picking another faction's hull switches to it and opens it", async () => {
    const user = userEvent.setup();
    renderTab();
    const search = await screen.findByRole('searchbox', { name: 'Search hulls in every faction' });
    await user.type(search, 'wor{Enter}');
    expect(await screen.findByRole('region', { name: 'Guristas Pirates ship tree' })).toBeVisible();
    expect(await screen.findByRole('dialog', { name: 'Worm' })).toBeVisible();
  });
});

describe('ShipTreeTab — loading', () => {
  it("says so when the tree can't be loaded, rather than spinning forever", async () => {
    vi.mocked(loadShipTree).mockRejectedValueOnce(new Error('offline'));
    renderTab();
    expect(await screen.findByText("Couldn't load the ship tree")).toBeVisible();
    expect(screen.queryByText('Loading the ship tree…')).not.toBeInTheDocument();
  });

  it("marks nothing flyable until the Character's skills have been read", async () => {
    skills.known = false;
    const { container } = renderTab();
    await screen.findByRole('region', { name: 'Caldari State ship tree' });
    // Not even the Corvette, which needs no skills: no status yet, not "can fly".
    for (const id of [MERLIN, IBIS, CROW]) expect(tile(container, id).dataset.tone).toBe('locked');
    expect(screen.queryByRole('button', { name: /Can fly|to fly/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merlin' })).toBeInTheDocument();
    expect(screen.getByText('0 / 5 hulls flyable')).toBeVisible();
  });
});

describe('ShipTreeTab — view switch', () => {
  it('switches to the ladder and back, remembering the choice', async () => {
    const user = userEvent.setup();
    const { container } = renderTab();
    const views = await screen.findByRole('group', { name: 'Ship tree view' });
    await user.click(within(views).getByRole('button', { name: 'Ladder' }));
    expect(screen.queryByRole('region', { name: /ship tree$/ })).not.toBeInTheDocument();
    expect(container.querySelector('details[data-class="8"]')).toBeInTheDocument();
    expect(useShipTreeViewPreference.getState().value).toBe('ladder');

    await user.click(
      within(screen.getByRole('group', { name: 'Ship tree view' })).getByRole('button', {
        name: 'Map',
      })
    );
    expect(screen.getByRole('region', { name: 'Caldari State ship tree' })).toBeVisible();
    expect(useShipTreeViewPreference.getState().value).toBe('map');
  });
});

describe('ShipTreeTab — ladder', () => {
  beforeEach(async () => {
    await useShipTreeViewPreference.getState().setValue('ladder');
  });

  it('carries the map marks: class counts, Ω chip, tech corners, tone and badge', async () => {
    const { container } = renderTab();
    await screen.findByRole('button', { name: /Merlin/ });
    const frigate = container.querySelector<HTMLElement>('details[data-class="8"]')!;
    expect(within(frigate.querySelector('summary')!).getByText('1/1 flyable')).toBeVisible();
    const interceptor = container.querySelector<HTMLElement>('details[data-class="10"]')!;
    expect(interceptor.querySelector('[data-omega]')).not.toBeNull();
    expect(container.querySelectorAll('[data-omega]')).toHaveLength(1);
    expect(interceptor).toHaveAttribute('data-unlocked', 'false');

    const crow = container.querySelector<HTMLElement>(`button[data-ship="${CROW}"]`)!;
    expect(crow.querySelector('[data-tech]')?.textContent).toBe('II');
    expect(crow.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'locked');
    expect(crow).toHaveTextContent(/to fly/);
    const merlin = container.querySelector<HTMLElement>(`button[data-ship="${MERLIN}"]`)!;
    expect(merlin.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'elite');
    expect(merlin.querySelector('.ring')?.textContent).toBe('V');
    expect(merlin).toHaveTextContent('Can fly');
  });

  it("chips exactly the classes the map's layout puts an Ω before", async () => {
    const { container } = renderTab();
    await screen.findByRole('button', { name: /Merlin/ });
    const chips = [...container.querySelectorAll('[data-omega]')].map((el) =>
      Number(el.closest<HTMLElement>('details')!.dataset.class)
    );
    const factionID = CALDARI_FACTION_ID;
    const counts = hullCountsFor(SHIP_TREE, factionID);
    const alphaMax = (id: number) => CATALOG.engineSkills.get(id)?.alphaMaxLevel ?? 0;
    const layout = layoutShipTree({
      factionID,
      defs: treeFor(factionID, new Set(counts.keys())),
      hullCounts: counts,
      needsOmega: (id) => classNeedsOmega(SHIP_TREE.groups[String(id)], factionID, alphaMax),
      parentEmpires: () => [],
    });
    expect(layout.omegas.length).toBeGreaterThan(0);
    expect(chips.sort()).toEqual(layout.omegas.map((o) => o.classId).sort());
  });

  it('opens every section while searching, even one the reader collapsed', async () => {
    const user = userEvent.setup();
    const { container } = renderTab();
    await screen.findByRole('button', { name: /Merlin/ });
    const frigate = container.querySelector<HTMLDetailsElement>('details[data-class="8"]')!;
    expect(frigate.open).toBe(true);
    frigate.open = false;
    fireEvent(frigate, new Event('toggle'));
    await waitFor(() => expect(frigate.open).toBe(false));
    expect(screen.getByRole('button', { name: /Merlin/ })).not.toBeVisible();

    await user.type(
      screen.getByRole('searchbox', { name: "Search this faction's hulls" }),
      'Merlin'
    );
    await waitFor(() => expect(frigate.open).toBe(true));
    expect(screen.getByRole('button', { name: /Merlin/ })).toBeVisible();

    // Clearing the search restores what the reader chose.
    await user.clear(screen.getByRole('searchbox', { name: "Search this faction's hulls" }));
    await waitFor(() => expect(frigate.open).toBe(false));
  });

  it('nests specialised classes under their parent', async () => {
    const { container } = renderTab();
    await screen.findByRole('button', { name: /Merlin/ });
    const frigate = container.querySelector('details[data-class="8"]')!;
    expect(frigate.querySelector('details[data-class="9"]')).not.toBeNull();
    expect(frigate.querySelector('details[data-class="10"]')).not.toBeNull();
  });

  it('filters to the hulls the pilot can fly', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('button', { name: /Crow/ });
    await user.click(screen.getByRole('checkbox', { name: 'Only ones I can fly' }));
    expect(screen.queryByRole('button', { name: /Crow/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merlin/ })).toBeInTheDocument();
  });

  it('offers other factions as chips while searching, switching on a tap', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(
      await screen.findByRole('searchbox', { name: "Search this faction's hulls" }),
      'worm'
    );
    expect(screen.getByText('No hulls match.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Worm' }));
    expect(screen.getByTestId('location')).toHaveTextContent('faction=500010');
    expect(await screen.findByRole('dialog', { name: 'Worm' })).toBeVisible();
  });

  it("links a pirate class to its parent empires' trees", async () => {
    const user = userEvent.setup();
    renderTab('/ships/tree?faction=500010');
    expect(await screen.findByText('Needs:')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Switch to Gallente Federation' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('faction=500004'));
  });

  it('opens the Ship Info window on a tap', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('button', { name: /Merlin/ }));
    expect(await screen.findByRole('dialog', { name: 'Merlin' })).toBeVisible();
  });
});

describe('ShipTreeTab — no character', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  });

  it('renders the whole tree dim without crashing, and says why', async () => {
    const { container } = renderTab();
    await screen.findByRole('region', { name: 'Caldari State ship tree' });
    expect(screen.getByText(/No character selected/)).toBeVisible();
    for (const id of [MERLIN, HOOKBILL, CROW, TENGU]) {
      expect(tile(container, id).dataset.tone).toBe('locked');
    }
    // The Corvette asks for no skills at all, so it stays flyable.
    expect(tile(container, IBIS).dataset.tone).toBe('canFly');
    expect(screen.getByText('1 / 5 hulls flyable')).toBeVisible();
    expect(container.querySelectorAll('[data-omega]')).toHaveLength(1);
    // Nothing on the map is lit.
    expect(container.querySelector('[data-lit="true"]')).toBeNull();
    expect(tile(container, WORM)).toBeNull();
  });

  it('opens a hull with nothing to add to a plan', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('button', { name: /^Crow/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Crow' });
    await user.click(within(dialog).getByRole('tab', { name: 'Skills & Mastery' }));
    expect(within(dialog).getAllByText('Interceptors').length).toBeGreaterThan(0);
    expect(within(dialog).queryByRole('button', { name: /Add/ })).not.toBeInTheDocument();
  });
});

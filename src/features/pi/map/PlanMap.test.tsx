import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { buildPlanAdvice, hubBooks, type PlanAdvice } from '../planAdviceModel';
import { planPicks } from '../planPicks';
import { usePlanPreference } from '../planTicksPref';
import { adviceInput, pi } from './mapFixtures.testutil';
import { MAP_HINT_KEY } from './mapHintPref';
import { buildMapGraph, DOCK_MIN_PANEL_WIDTH, productFigure } from './mapModel';
import { PlanMap, type PlanMapProps } from './PlanMap';

// The finder reads the SDE and the stargate graph; its own behaviour is not under test here.
vi.mock('./PlanetFinder', () => ({
  PlanetFinder: ({ types }: { types: readonly string[] }) => (
    <div data-testid="finder">finder for {types.join(',')}</div>
  ),
}));

const graph = buildMapGraph(pi);
let advice: PlanAdvice;
let adviceNone: PlanAdvice;

beforeAll(() => {
  advice = buildPlanAdvice(adviceInput('lean'));
  adviceNone = buildPlanAdvice(adviceInput('none'));
});

const withWhatIf = (kind: 'lean' | 'none') => (type: PlanetType) =>
  buildPlanAdvice(adviceInput(kind, { whatIfTypes: [type] }));

function props(overrides: Partial<PlanMapProps> = {}): PlanMapProps {
  return {
    graph,
    advice,
    adviceWithWhatIf: withWhatIf('lean'),
    colonies: [{ planetId: 40000001, type: 'temperate', name: 'Hek VIII' }],
    finder: { systemId: 30000142, name: 'Jita', security: 0.9 },
    ...overrides,
  };
}

function renderMap(overrides: Partial<PlanMapProps> = {}, entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PlanMap {...props(overrides)} />
    </MemoryRouter>
  );
}

/** Resize observers the component created, so a test can report a width the way a browser would. */
const observers: { cb: ResizeObserverCallback; el: Element }[] = [];
function reportWidth(width: number) {
  act(() => {
    for (const { cb, el } of observers) {
      cb([{ target: el, contentRect: { width } } as unknown as ResizeObserverEntry], {} as never);
    }
  });
}

function stubPhone(phone: boolean) {
  window.matchMedia = ((media: string) =>
    ({
      media,
      matches: phone && media.includes('max-width'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function stubCoarse() {
  window.matchMedia = ((media: string) =>
    ({
      media,
      matches: media.includes('pointer: coarse'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  observers.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element) {
        observers.push({ cb: this.cb, el });
      }
      unobserve() {}
      disconnect() {}
    }
  );
  stubPhone(false);
});
afterEach(() => vi.unstubAllGlobals());

// A product tile is a link to its PI detail (`?product=`), not a button.
const product = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}\\. `) });
const maybeProduct = (name: string) =>
  screen.queryByRole('link', { name: new RegExp(`^${name}\\. `) });
const planet = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name} planet`) });

describe('PlanMap: planet toggles', () => {
  it("pre-marks the planet types of the pilot's colonies and nothing else", () => {
    renderMap();
    expect(planet('Temperate')).toHaveAttribute('aria-pressed', 'true');
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(planet('Barren')).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters the map to the ticked types, leaving ghost slots, and brings it back', async () => {
    const user = userEvent.setup();
    renderMap();
    // Autotrophs are a Temperate-only raw.
    expect(product('Autotrophs')).toBeInTheDocument();
    expect(maybeProduct('Felsic Magma')).toBeNull();
    const slots = () => document.querySelectorAll('[data-tier="2"] > ul > li').length;
    const before = slots();
    await user.click(planet('Temperate'));
    expect(planet('Temperate')).toHaveAttribute('aria-pressed', 'false');
    expect(maybeProduct('Autotrophs')).toBeNull();
    // A hidden product leaves an empty slot: the layout does not jump.
    expect(slots()).toBe(before);
    expect(document.querySelectorAll('[data-tier="2"] > ul > li[aria-hidden="true"]').length).toBe(
      before
    );
    await user.click(planet('Temperate'));
    expect(product('Autotrophs')).toBeInTheDocument();
  });

  it('ticks every type for a pilot with no colonies', () => {
    renderMap({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') });
    for (const name of [
      'Barren',
      'Gas',
      'Ice',
      'Lava',
      'Oceanic',
      'Plasma',
      'Storm',
      'Temperate',
    ]) {
      expect(planet(name)).toHaveAttribute('aria-pressed', 'true');
    }
  });
});

describe('PlanMap: what if I add a planet', () => {
  it('lights up what a planet type you do not have would unlock, with a non-colour mark', async () => {
    const user = userEvent.setup();
    renderMap();
    expect(maybeProduct('Felsic Magma')).toBeNull();
    await user.hover(planet('Lava'));
    expect(screen.getByText('What if I add a Lava planet?')).toBeInTheDocument();
    expect(screen.getByText(/Unlocks \d+ products? on the map/)).toBeInTheDocument();
    // The mark is in the tile's accessible name, not only a colour.
    expect(
      screen.getByRole('link', { name: /^Felsic Magma\. .*Unlocked by adding a Lava planet/ })
    ).toBeInTheDocument();
    await user.unhover(planet('Lava'));
    expect(maybeProduct('Felsic Magma')).toBeNull();
    expect(screen.queryByText('What if I add a Lava planet?')).toBeNull();
  });

  it('previews on a mouse pointer, clears on leave, and ignores a touch pointer', () => {
    renderMap();
    const lava = planet('Lava');
    fireEvent.pointerEnter(lava, { pointerType: 'touch' });
    expect(screen.queryByText('What if I add a Lava planet?')).toBeNull();
    fireEvent.pointerEnter(lava, { pointerType: 'mouse' });
    expect(screen.getByText('What if I add a Lava planet?')).toBeInTheDocument();
    // A touch leave must not clear a preview a mouse set.
    fireEvent.pointerLeave(lava, { pointerType: 'touch' });
    expect(screen.getByText('What if I add a Lava planet?')).toBeInTheDocument();
    fireEvent.pointerLeave(lava, { pointerType: 'mouse' });
    expect(screen.queryByText('What if I add a Lava planet?')).toBeNull();
  });

  it('keeps the preview, and the focused tile, when ArrowRight leaves an unowned planet', async () => {
    const user = userEvent.setup();
    renderMap();
    act(() => planet('Lava').focus());
    await user.keyboard('{ArrowRight}');
    const active = document.activeElement as HTMLElement;
    expect(active.dataset.mapKey).toMatch(/^p:/);
    expect(active.isConnected).toBe(true);
    expect(screen.getByText('What if I add a Lava planet?')).toBeInTheDocument();
    // Focus leaving the board ends the preview.
    act(() => (document.activeElement as HTMLElement).blur());
    expect(screen.queryByText('What if I add a Lava planet?')).toBeNull();
  });

  it('also previews on keyboard focus', () => {
    renderMap();
    act(() => planet('Plasma').focus());
    expect(screen.getByText('What if I add a Plasma planet?')).toBeInTheDocument();
  });
});

// A product link on Plan or Colonies opens the drawer by URL: the link is gone
// with its tab, so focus goes to the product on the map, never the page body.
describe('PlanMap: focus after a drawer another tab opened', () => {
  const COOLANT = 9832;

  it('lands on the product tile on Escape', async () => {
    const user = userEvent.setup();
    renderMap({}, `/planetary-industry/map?product=${COOLANT}`);
    await screen.findByRole('dialog', { name: 'How to make Coolant' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-map-key', `p:${COOLANT}`)
    );
  });

  it('lands on the product tile on Close', async () => {
    const user = userEvent.setup();
    renderMap({}, `/planetary-industry/map?product=${COOLANT}`);
    const dialog = await screen.findByRole('dialog', { name: 'How to make Coolant' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-map-key', `p:${COOLANT}`)
    );
  });

  it("lands on the product's row in a phone's sheet", async () => {
    stubPhone(true);
    const user = userEvent.setup();
    renderMap({}, `/planetary-industry/map?product=${COOLANT}`);
    await screen.findByRole('dialog', { name: 'How to make Coolant' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toHaveAttribute('data-map-key', `p:${COOLANT}`);
  });
});

describe('PlanMap: trace', () => {
  it('joins parallel inputs with commas, and an arrow only steps up a tier', () => {
    // Coolant (P2) from Electrolytes and Water, opened by URL.
    renderMap({}, '/planetary-industry/map?product=9832');
    const dialog = screen.getByRole('dialog', { name: 'How to make Coolant' });
    expect(
      within(dialog).getAllByText(
        (_, el) =>
          el?.tagName === 'P' &&
          /^In words: .+ → (Electrolytes, Water|Water, Electrolytes) → Coolant\.$/.test(
            el.textContent ?? ''
          )
      )
    ).toHaveLength(1);
  });

  it('says a P4 is made from its direct inputs side by side, a P1 beside its P3s', () => {
    // Nano-Factory takes Reactive Metals (P1) next to two P3s.
    renderMap({}, '/planetary-industry/map?product=2869');
    const dialog = screen.getByRole('dialog', { name: 'How to make Nano-Factory' });
    const words = within(dialog).getByText(
      (_, el) => el?.tagName === 'P' && /^In words: /.test(el.textContent ?? '')
    );
    expect(words.textContent).toMatch(/: [^→]+ → [^→]+ → Nano-Factory\.$/);
    expect(words.textContent).toMatch(/Reactive Metals/);
  });

  it('traces a product: marks it current, announces it and writes the chain in words', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(product('Biofuels'));
    expect(product('Biofuels')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/Tracing Biofuels\. Needs Temperate/);
    const dialog = screen.getByRole('dialog', { name: 'How to make Biofuels' });
    // Any planet hosts the factory, so the facility line names no planets.
    expect(within(dialog).getByText('Made in a Basic Industry Facility.')).toBeInTheDocument();
    // The chain, planets to product, as text a screen reader can read.
    expect(
      within(dialog).getByText(
        (_, el) =>
          /^In words: Temperate → .*Carbon Compounds.*→ .*Biofuels\.$/.test(
            el?.textContent ?? ''
          ) && el?.tagName === 'P'
      )
    ).toBeInTheDocument();
    // Every other product named in the words is a link to its own detail.
    expect(
      within(dialog).getAllByRole('link', { name: 'Carbon Compounds' }).length
    ).toBeGreaterThan(1);
    // Its own name is plain text in its own detail; Market is one step away.
    expect(within(dialog).queryByRole('link', { name: 'Biofuels' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'View in Market' })).toHaveAttribute(
      'href',
      expect.stringContaining('/market/browser')
    );
    expect(product('Biofuels')).toHaveAttribute('href', expect.stringContaining('product=2396'));
    // Moving the trace moves `aria-current`.
    await user.click(product('Proteins'));
    expect(product('Proteins')).toHaveAttribute('aria-current', 'true');
    expect(product('Biofuels')).not.toHaveAttribute('aria-current');
  });

  it('starts with the first pick traced, without dimming the rest', () => {
    renderMap();
    const first = planPicks(advice).picks[0];
    const name = graphName(first.typeId);
    expect(product(name)).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// Ownership rules: PlanMap's header, "Who owns what".
describe('PlanMap: a product click toggles its trace; ticks stay the pilot’s', () => {
  function Search() {
    const location = useLocation();
    return <output data-testid="search">{location.pathname + location.search}</output>;
  }
  function renderWithSearch(entry = '/planetary-industry/map') {
    return render(
      // A page before the map: a clear that went Back twice would land there.
      <MemoryRouter initialEntries={['/planetary-industry/plan', entry]} initialIndex={1}>
        <PlanMap {...props()} />
        <Search />
      </MemoryRouter>
    );
  }
  const search = () => screen.getByTestId('search').textContent;
  const productDialog = () =>
    screen.queryByRole('dialog', { name: /^(How to make|Where to get) / });

  it('clears the trace on a second click once its drawer is closed, and traces it on a third', async () => {
    const user = userEvent.setup();
    renderWithSearch();
    await user.click(product('Biofuels'));
    expect(productDialog()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(productDialog()).toBeNull());
    // Closing the drawer is not clearing the trace.
    expect(product('Biofuels')).toHaveAttribute('aria-current', 'true');
    expect(search()).toBe('/planetary-industry/map');
    await user.click(product('Biofuels'));
    expect(product('Biofuels')).not.toHaveAttribute('aria-current');
    expect(productDialog()).toBeNull();
    expect(search()).toBe('/planetary-industry/map');
    expect(screen.getByText('Trace cleared.')).toBeInTheDocument();
    await user.click(product('Biofuels'));
    expect(product('Biofuels')).toHaveAttribute('aria-current', 'true');
    expect(productDialog()).toBeInTheDocument();
  });

  it('docked: a second click clears the trace and takes ?product= off the URL', async () => {
    const user = userEvent.setup();
    renderWithSearch();
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    await user.click(product('Proteins'));
    expect(search()).toMatch(/product=/);
    await user.click(product('Proteins'));
    await waitFor(() => expect(search()).toBe('/planetary-industry/map'));
    expect(product('Proteins')).not.toHaveAttribute('aria-current');
  });

  it('docked: clearing a product a link opened replaces the URL', async () => {
    const user = userEvent.setup();
    renderWithSearch('/planetary-industry/map?product=9832');
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    expect(product('Coolant')).toHaveAttribute('aria-current', 'true');
    await user.click(product('Coolant'));
    await waitFor(() => expect(search()).toBe('/planetary-industry/map'));
    // Lit only for the planets its trace needed: with the trace gone, so is the tile.
    expect(maybeProduct('Coolant')).toBeNull();
    expect(screen.getByText('Trace cleared.')).toBeInTheDocument();
  });

  it('Enter and Space on the traced tile clear it', async () => {
    const user = userEvent.setup();
    renderMap();
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    act(() => product('Proteins').focus());
    await user.keyboard('{Enter}');
    expect(product('Proteins')).toHaveAttribute('aria-current', 'true');
    await user.keyboard('{Enter}');
    expect(product('Proteins')).not.toHaveAttribute('aria-current');
    await user.keyboard(' ');
    expect(product('Proteins')).toHaveAttribute('aria-current', 'true');
    await user.keyboard(' ');
    expect(product('Proteins')).not.toHaveAttribute('aria-current');
  });

  it('on a phone, tapping the traced row again clears it', async () => {
    stubPhone(true);
    const user = userEvent.setup();
    renderMap();
    await user.click(
      within(screen.getByRole('group', { name: 'Product tier' })).getByRole('button', {
        name: 'P1',
      })
    );
    const row = () => screen.getByRole('link', { name: /^Biofuels/ });
    await user.click(row());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(row()).toHaveAttribute('aria-current', 'true');
    await user.click(row());
    expect(row()).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a planet type you ticked through picking and clearing a product', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(planet('Barren'));
    await user.keyboard('{Escape}');
    expect(planet('Barren')).toHaveAttribute('aria-pressed', 'true');
    await user.click(product('Biofuels'));
    expect(planet('Barren')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('What if I add a Barren planet?')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(product('Biofuels'));
    expect(product('Biofuels')).not.toHaveAttribute('aria-current');
    expect(planet('Barren')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('What if I add a Barren planet?')).toBeInTheDocument();
  });

  it('docked: the panel goes back to the ticked planet once the product is cleared', async () => {
    const user = userEvent.setup();
    renderMap();
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    await user.click(planet('Barren'));
    expect(
      screen.getByRole('complementary', { name: 'Where to put a new Barren colony' })
    ).toBeInTheDocument();
    await user.click(product('Biofuels'));
    expect(
      screen.getByRole('complementary', { name: /^(How to make|Where to get) / })
    ).toBeInTheDocument();
    await user.click(product('Biofuels'));
    expect(
      screen.getByRole('complementary', { name: 'Where to put a new Barren colony' })
    ).toBeInTheDocument();
    expect(planet('Barren')).toHaveAttribute('aria-pressed', 'true');
  });
});

function graphName(typeId: number): string {
  return graph.byId.get(typeId)!.name;
}

describe('PlanMap: the same numbers as Plan', () => {
  it('shows picks #1 to #3 exactly as the shared Plan picks selector lists them', () => {
    renderMap();
    const picks = planPicks(advice);
    expect(picks.picks.length).toBeGreaterThan(0);
    const strip = screen.getByRole('group', { name: 'Your picks' });
    const buttons = within(strip)
      .getAllByRole('link')
      .filter((b) => /^#\d/.test(b.textContent ?? ''));
    expect(buttons).toHaveLength(picks.picks.length);
    picks.picks.forEach((pick, i) => {
      expect(buttons[i]).toHaveTextContent(`#${i + 1}`);
      expect(buttons[i]).toHaveTextContent(pick.name);
      expect(buttons[i]).toHaveTextContent(`+${formatIskCompact(pick.perDay)}/day`);
    });
  });

  it('prints a losing rebuild pick with one minus and the loss tone, never "+-"', () => {
    const losing = {
      ...advice,
      colonies: advice.colonies.map((c) =>
        c.rebuild.status === 'change'
          ? { ...c, rebuild: { ...c.rebuild, gainPerDay: -756_000 } }
          : c
      ),
    } as PlanAdvice;
    renderMap({ advice: losing });
    const strip = screen.getByRole('group', { name: 'Your picks' });
    expect(strip.textContent).not.toContain('+-');
    expect(strip.textContent).toMatch(/-[\d.]+[KM]\/day/);
    expect(strip.querySelector('.text-isk-neg')).not.toBeNull();
  });

  it('lists the best one-planet recipes when there are no colonies', () => {
    renderMap({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') });
    const picks = planPicks(adviceNone);
    expect(picks.kind).toBe('recipes');
    const strip = screen.getByRole('group', { name: 'Your picks' });
    expect(strip).toHaveTextContent('Best one-planet recipes');
    for (const pick of picks.picks) expect(strip).toHaveTextContent(pick.name);
  });

  it("puts the model's figure and verdict in a product's accessible name", () => {
    renderMap({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') });
    const recipe = adviceNone.recipes.recipes[0];
    const fig = productFigure(adviceNone, recipe.typeId, graph);
    expect(fig.kind).toBe('ranked');
    const tile = product(recipe.name);
    expect(tile.getAttribute('aria-label')).toContain(
      `About ${formatIsk(recipe.iskPerDay, 0)} ISK a day from one`
    );
    if (recipe.comparison?.verdict === 'better') {
      expect(tile.getAttribute('aria-label')).toContain('Better than');
    }
  });

  it('shows no per-planet figure for a specialized or advanced product', () => {
    renderMap({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') });
    const p3 = graph.tiers[3][0];
    expect(product(p3.name).getAttribute('aria-label')).toContain('no per-planet figure');
  });
});

describe('PlanMap: structure and keyboard', () => {
  it('has a heading and a list per tier, so the map reads without sight', () => {
    renderMap();
    for (const name of ['Raw', 'Processed', 'Refined', 'Specialized', 'Advanced', 'Planets']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    const board = screen.getByRole('group', { name: /^Planet map/ });
    expect(within(board).getAllByRole('list').length).toBeGreaterThanOrEqual(6);
  });

  it('keeps the wires out of the accessibility tree', () => {
    const { container } = renderMap();
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });

  it('is one tab stop, and the arrow keys walk it', async () => {
    const user = userEvent.setup();
    renderMap();
    const board = screen.getByRole('group', { name: /^Planet map/ });
    const stops = within(board)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('tabindex') === '0' && b.hasAttribute('data-map-key'));
    expect(stops).toHaveLength(1);
    act(() => stops[0].focus());
    await user.keyboard('{ArrowDown}');
    expect(planet('Gas')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('data-map-key')).toMatch(/^p:/);
    // Enter traces.
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('dialog', { name: /^(How to make|Where to get) / })
    ).toBeInTheDocument();
  });
});

describe('PlanMap: the detail drawer', () => {
  it('opens on a click, closes on Escape and the close button, and gives focus back', async () => {
    const user = userEvent.setup();
    renderMap();
    const tile = product('Biofuels');
    await user.click(tile);
    const dialog = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(tile).toHaveFocus());

    // Biofuels is still traced, so a click on it would clear it: open another.
    const other = product('Proteins');
    await user.click(other);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(other).toHaveFocus());
  });

  it('opens "Add a Lava planet" for a type you do not have: unlocks, best recipe, slots, finder', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(planet('Lava'));
    const dialog = screen.getByRole('dialog', { name: 'Where to put a new Lava colony' });
    expect(within(dialog).getByText('Add a Lava planet')).toBeInTheDocument();
    expect(within(dialog).getByText(/Unlocks \d+ products/)).toBeInTheDocument();
    // Assistive tech gets the product names, not only the count.
    expect(within(dialog).getByText(/^Unlocked products: .*Plasmoids.*\.$/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Best one-planet recipe:/)).toBeInTheDocument();
    expect(
      within(dialog).getByText("You're using 1 of 4 planets: room for 3 more.")
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('finder')).toHaveTextContent('finder for lava');
    // Pressed while it is open, and the highlight stays after the drawer closes.
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('What if I add a Lava planet?')).toBeInTheDocument();
  });

  it('keeps a traced product on screen when you untick, hover or click a planet it needs', async () => {
    const user = userEvent.setup();
    renderMap();
    // Felsic Magma is a Lava product; the pilot has no Lava colony. It shows
    // on the map once Lava is a what-if, and tracing it keeps that tick.
    await user.click(planet('Lava'));
    await user.keyboard('{Escape}');
    await user.click(product('Felsic Magma'));
    const dialog = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // A click on the ticked what-if unticks it, even though the trace needs it.
    await user.click(planet('Lava'));
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(product('Felsic Magma')).toHaveAttribute('aria-current', 'true');
    await user.hover(planet('Lava'));
    // No what-if preview: the trace already shows the chain, pink wires would bury it.
    expect(screen.queryByText('What if I add a Lava planet?')).toBeNull();
    await user.click(planet('Lava'));
    expect(
      screen.getByRole('dialog', { name: /^(How to make|Where to get) / })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Where to put a new Lava colony' })).toBeNull();
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
  });

  it('tracing the best recipe from the add-planet drawer keeps the opener and the what-if', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(planet('Lava'));
    const dialog = screen.getByRole('dialog', { name: 'Where to put a new Lava colony' });
    await user.click(within(dialog).getByRole('link', { name: /Best one-planet recipe:/ }));
    expect(
      screen.getByRole('dialog', { name: /^(How to make|Where to get) / })
    ).toBeInTheDocument();
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('What if I add a Lava planet?')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(planet('Lava')).toHaveFocus());
  });

  it('writes no dead "find one" text beside a planet you do not have', async () => {
    const user = userEvent.setup();
    renderMap({ colonies: [] });
    await user.click(product('Biofuels'));
    const dialog = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    expect(within(dialog).getAllByText(/Temperate/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/find one/i)).toBeNull();
    expect(within(dialog).queryByText(/✕/)).toBeNull();
  });

  it('gives focus back after Clear trace in the drawer', async () => {
    const user = userEvent.setup();
    renderMap();
    const tile = product('Biofuels');
    await user.click(tile);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear trace' })
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(tile).toHaveFocus());
  });

  it.each([
    [
      { used: 6, allowed: 6, free: 0, canTrainMore: false },
      /6 of 6 planets, the most there are: replace one/,
    ],
    [
      { used: 4, allowed: 4, free: 0, canTrainMore: true },
      /4 of 4 planets: train Interplanetary Consolidation or replace one/,
    ],
    [{ used: 1, allowed: 1, free: 0, canTrainMore: true, assumed: true }, /skill hasn't loaded/],
  ])('says the right thing about slots (%j)', async (slots, text) => {
    const user = userEvent.setup();
    renderMap({ advice: { ...advice, slots: { ...advice.slots, ...slots } } });
    await user.click(planet('Lava'));
    expect(within(screen.getByRole('dialog')).getByText(text)).toBeInTheDocument();
  });

  it('has a drawer that explains the map, with legend and EVE University links', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(screen.getByRole('button', { name: 'How to use the map' }));
    const dialog = screen.getByRole('dialog', { name: 'How to use the map' });
    expect(within(dialog).getByRole('heading', { name: 'Legend' })).toBeInTheDocument();
    const link = within(dialog).getByRole('link', { name: /EVE University: Planetary Industry/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', expect.stringContaining('wiki.eveuniversity.org'));
    const helpButton = screen.getByRole('button', { name: 'How to use the map', hidden: true });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(helpButton).toHaveFocus());
  });
});

describe("PlanMap: docked or drawer, by the map panel's own width", () => {
  it('is a drawer below the dock width and docks at or above it', async () => {
    const user = userEvent.setup();
    const { container } = renderMap();
    const layout = container.querySelector('[data-detail-mode]')!;
    reportWidth(DOCK_MIN_PANEL_WIDTH - 1);
    expect(layout).toHaveAttribute('data-detail-mode', 'drawer');
    await user.click(product('Biofuels'));
    expect(
      screen.getByRole('dialog', { name: /^(How to make|Where to get) / })
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');

    reportWidth(DOCK_MIN_PANEL_WIDTH);
    expect(layout).toHaveAttribute('data-detail-mode', 'docked');
    await user.click(product('Proteins'));
    expect(screen.queryByRole('dialog')).toBeNull();
    const aside = screen.getByRole('complementary', { name: /^(How to make|Where to get) / });
    expect(within(aside).getByText('Proteins', { selector: 'div' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: 'View in Market' })).toBeInTheDocument();

    // And back, without a stale panel.
    reportWidth(1200);
    expect(layout).toHaveAttribute('data-detail-mode', 'drawer');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('observes the layout box, which does not change size when the panel docks', () => {
    const { container } = renderMap();
    const layout = container.querySelector('[data-detail-mode]')!;
    expect(observers.some((o) => o.el === layout)).toBe(true);
  });
});

describe('PlanMap: starting state follows the data until the pilot acts', () => {
  const firstPickName = (a: PlanAdvice) => graphName(planPicks(a).picks[0].typeId);

  it('re-derives the starting trace and ticks when the picks and colonies change', () => {
    const view = renderMap();
    expect(product(firstPickName(advice))).toHaveAttribute('aria-current', 'true');
    view.rerender(
      <MemoryRouter>
        <PlanMap
          {...props({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') })}
        />
      </MemoryRouter>
    );
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    expect(product(firstPickName(adviceNone))).toHaveAttribute('aria-current', 'true');
  });

  it('never overrides what the pilot chose', async () => {
    const user = userEvent.setup();
    const view = renderMap();
    await user.click(planet('Temperate'));
    await user.click(planet('Temperate'));
    await user.click(product('Proteins'));
    await user.keyboard('{Escape}');
    view.rerender(
      <MemoryRouter>
        <PlanMap
          {...props({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') })}
        />
      </MemoryRouter>
    );
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(product('Proteins')).toHaveAttribute('aria-current', 'true');
  });
});

describe('PlanMap: first-visit hint', () => {
  it('shows once, and a dismissal is remembered on this device', async () => {
    const user = userEvent.setup();
    const first = renderMap();
    expect(
      screen.getByText('Click a planet type to filter, or a product to trace it.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Click a planet type to filter/)).toBeNull();
    expect(localStorage.getItem(MAP_HINT_KEY)).toBe('1');
    first.unmount();
    renderMap();
    expect(screen.queryByText(/Click a planet type to filter/)).toBeNull();
  });

  it('keeps "Got it" on one line', () => {
    renderMap();
    expect(screen.getByRole('button', { name: 'Got it' })).toHaveClass('whitespace-nowrap');
  });

  it('says Tap, not Click or Hover, on a coarse pointer', () => {
    stubCoarse();
    renderMap();
    expect(
      screen.getByText('Tap a planet type to filter, or a product to trace it.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^Tap a planet type you don't have \(/)).toBeInTheDocument();
    expect(screen.queryByText(/Hover|Click/)).toBeNull();
  });

  it('still shows when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderMap();
    expect(screen.getByText(/Click a planet type to filter/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('PlanMap: phone', () => {
  it('shows a tier switcher and list, opens a bottom sheet, and keeps the full map behind a button', async () => {
    stubPhone(true);
    const user = userEvent.setup();
    renderMap();
    expect(screen.queryByRole('group', { name: /^Planet map/ })).toBeNull();
    const switcher = screen.getByRole('group', { name: 'Product tier' });
    await user.click(within(switcher).getByRole('button', { name: 'P1' }));
    // The row's title carries the accent cue at rest, before any tap (DESIGN.md §6c "Phone cards").
    expect(
      within(screen.getByRole('link', { name: /^Biofuels/ })).getByText('Biofuels')
    ).toHaveClass('text-accent');
    await user.click(screen.getByRole('link', { name: /^Biofuels/ }));
    const sheet = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    expect(within(sheet).getByRole('link', { name: 'View in Market' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Show full map' }));
    expect(screen.getByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide full map' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});

describe('PlanMap: the picks note says what is shared with Plan', () => {
  afterEach(async () => {
    await usePlanPreference.getState().setValue('isk');
  });

  it.each([
    ['isk', 'ranked by most ISK'],
    ['haul', 'ranked by least hauling'],
  ] as const)('names the %s preference', async (preference, text) => {
    await usePlanPreference.getState().setValue(preference);
    renderMap();
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
  });

  it('says the recipe list is shown before the Plan tab filters', () => {
    renderMap({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') });
    expect(screen.getByText(/before the Plan tab's filters/)).toBeInTheDocument();
  });
});

// A colony's richness override is the URL's `?planet=`, in the same drawer as a product.
describe('PlanMap richness drawer', () => {
  it("opens a colony's richness chips from ?planet= on a phone", async () => {
    stubPhone(true);
    renderMap({}, '/planetary-industry/map?planet=40000001');
    expect(
      await screen.findByRole('group', { name: 'Resources you would pull here' })
    ).toBeVisible();
    expect(screen.getByText('Optional')).toBeVisible();
  });

  it('shows it in the docked panel too, with a way back', async () => {
    renderMap({}, '/planetary-industry/map?planet=40000001');
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    const aside = await screen.findByRole('complementary', { name: 'Resources on Hek VIII' });
    expect(
      within(aside).getByRole('group', { name: 'Resources you would pull here' })
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(aside).getByRole('button', { name: 'Back to the map' })).toBeVisible();
  });

  it('keeps only the drawer it shows when the URL names a planet and a product', async () => {
    stubPhone(true);
    function Search() {
      return <output data-testid="search">{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/planetary-industry/map?planet=40000001&product=9832']}>
        <PlanMap {...props()} />
        <Search />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole('group', { name: 'Resources you would pull here' })
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent(/^\?planet=40000001$/)
    );
  });

  it('ignores a planet the pilot has no colony on', async () => {
    stubPhone(true);
    renderMap({}, '/planetary-industry/map?planet=123');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('group', { name: 'Resources you would pull here' })).toBeNull();
  });
});

describe('PlanMap with hub prices unreadable', () => {
  it('does not claim the planets already make their best product', () => {
    const unpriced = buildPlanAdvice(
      adviceInput('lean', { books: hubBooks({ prices: {}, buyPrices: {} }, 5) })
    );
    renderMap({ advice: unpriced, pricesFailed: true });
    expect(screen.queryByText(/already make their best product/)).not.toBeInTheDocument();
    expect(screen.getByText(/Picks need hub prices/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Planet map|^Planets$/ })).toBeInTheDocument();
  });
});

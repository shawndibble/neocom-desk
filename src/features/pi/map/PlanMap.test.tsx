import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { formatIskCompact } from '@/lib/isk';
import { buildPlanAdvice, type PlanAdvice } from '../planAdviceModel';
import { planPicks } from '../planPicks';
import { adviceInput, pi } from './mapFixtures';
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
    colonies: [{ type: 'temperate', name: 'Hek VIII' }],
    finder: { systemId: 30000142, name: 'Jita' },
    ...overrides,
  };
}

function renderMap(overrides: Partial<PlanMapProps> = {}) {
  return render(
    <MemoryRouter>
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

const product = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\. `) });
const maybeProduct = (name: string) =>
  screen.queryByRole('button', { name: new RegExp(`^${name}\\. `) });
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
      screen.getByRole('button', { name: /^Felsic Magma\. .*Unlocked by adding a Lava planet/ })
    ).toBeInTheDocument();
    await user.unhover(planet('Lava'));
    expect(maybeProduct('Felsic Magma')).toBeNull();
    expect(screen.queryByText('What if I add a Lava planet?')).toBeNull();
  });

  it('also previews on keyboard focus', () => {
    renderMap();
    act(() => planet('Plasma').focus());
    expect(screen.getByText('What if I add a Plasma planet?')).toBeInTheDocument();
  });
});

describe('PlanMap: trace', () => {
  it('traces a product: marks it current, announces it and writes the chain in words', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(product('Biofuels'));
    expect(product('Biofuels')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/Tracing Biofuels\. Needs Temperate/);
    const dialog = screen.getByRole('dialog', { name: 'How to make it' });
    // The chain, planets to product, as text a screen reader can read.
    expect(
      within(dialog).getByText(/In words: Temperate → .*Carbon Compounds.*→ .*Biofuels/)
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Biofuels' })).toHaveAttribute(
      'href',
      expect.stringContaining('/market/browser')
    );
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
      .getAllByRole('button')
      .filter((b) => /^#\d/.test(b.textContent ?? ''));
    expect(buttons).toHaveLength(picks.picks.length);
    picks.picks.forEach((pick, i) => {
      expect(buttons[i]).toHaveTextContent(`#${i + 1}`);
      expect(buttons[i]).toHaveTextContent(pick.name);
      expect(buttons[i]).toHaveTextContent(`+${formatIskCompact(pick.perDay)}/day`);
    });
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
      `About ${formatIskCompact(recipe.iskPerDay)} ISK a day from one`
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
    expect(screen.getByRole('dialog', { name: 'How to make it' })).toBeInTheDocument();
  });
});

describe('PlanMap: the detail drawer', () => {
  it('opens on a click, closes on Escape and the close button, and gives focus back', async () => {
    const user = userEvent.setup();
    renderMap();
    const tile = product('Biofuels');
    await user.click(tile);
    const dialog = screen.getByRole('dialog', { name: 'How to make it' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(tile).toHaveFocus());

    await user.click(tile);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(tile).toHaveFocus());
  });

  it('opens "Add a Lava planet" for a type you do not have: unlocks, best recipe, slots, finder', async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(planet('Lava'));
    const dialog = screen.getByRole('dialog', { name: 'Where to put a new colony' });
    expect(within(dialog).getByText('Add a Lava planet')).toBeInTheDocument();
    expect(within(dialog).getByText(/Unlocks \d+ products/)).toBeInTheDocument();
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
    expect(screen.getByRole('dialog', { name: 'How to make it' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    reportWidth(DOCK_MIN_PANEL_WIDTH);
    expect(layout).toHaveAttribute('data-detail-mode', 'docked');
    await user.click(product('Proteins'));
    expect(screen.queryByRole('dialog')).toBeNull();
    const aside = screen.getByRole('complementary', { name: 'How to make it' });
    expect(within(aside).getByRole('link', { name: 'Proteins' })).toBeInTheDocument();

    // And back, without a stale panel.
    reportWidth(1200);
    expect(layout).toHaveAttribute('data-detail-mode', 'drawer');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('observes the layout box, which does not change size when the panel docks', () => {
    const { container } = renderMap();
    const layout = container.querySelector('[data-detail-mode]')!;
    expect(observers.some((o) => o.el === layout)).toBe(true);
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
    await user.click(screen.getByRole('button', { name: /^Biofuels/ }));
    const sheet = screen.getByRole('dialog', { name: 'How to make it' });
    expect(within(sheet).getByRole('link', { name: 'Biofuels' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Show full map' }));
    expect(screen.getByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide full map' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { type PlanAdvice } from '@/features/pi/planAdviceModel';
import { planPicks } from '@/features/pi/planPicks';
import { productFigure } from '@/features/pi/map/mapModel';
vi.mock('@/features/pi/useBiggerChains', () => ({
  NO_WHAT_IF_CHAINS: { byType: new Map(), pending: false },
  useWhatIfChains: () => ({ byType: new Map(), pending: false }),
}));
import {
  advice,
  adviceNone,
  graph,
  graphName,
  installPlanMapHarness,
  maybeProduct,
  planet,
  product,
  renderMap,
  stubPhone,
  withWhatIf,
} from '@/test/planMap';

// The finder reads the SDE and the stargate graph; its own behaviour is not under test here.
vi.mock('@/features/pi/map/PlanetFinder', () => ({
  PlanetFinder: ({ types }: { types: readonly string[] }) => (
    <div data-testid="finder">finder for {types.join(',')}</div>
  ),
}));

installPlanMapHarness();

describe('PlanMap: planet toggles', () => {
  it("pre-marks the planet types of the pilot's colonies and nothing else", () => {
    renderMap();
    expect(planet('Temperate')).toHaveAttribute('aria-pressed', 'true');
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(planet('Barren')).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters the map to the ticked types, leaving ghost slots, and brings it back', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
    renderMap({}, `/planetary-industry/map?product=${COOLANT}`);
    await screen.findByRole('dialog', { name: 'How to make Coolant' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-map-key', `p:${COOLANT}`)
    );
  });

  it('lands on the product tile on Close', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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

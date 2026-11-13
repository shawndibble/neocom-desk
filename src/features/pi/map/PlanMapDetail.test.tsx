import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DOCK_MIN_PANEL_WIDTH } from '@/features/pi/map/mapModel';
vi.mock('@/features/pi/useBiggerChains', () => ({
  NO_WHAT_IF_CHAINS: { byType: new Map(), pending: false },
  useWhatIfChains: () => ({ byType: new Map(), pending: false }),
}));
import {
  advice,
  installPlanMapHarness,
  observedElements,
  planet,
  product,
  renderMap,
  reportWidth,
} from '@/test/planMap';

// The finder reads the SDE and the stargate graph; its own behaviour is not under test here.
vi.mock('@/features/pi/map/PlanetFinder', () => ({
  PlanetFinder: ({ types }: { types: readonly string[] }) => (
    <div data-testid="finder">finder for {types.join(',')}</div>
  ),
}));

installPlanMapHarness();

describe('PlanMap: the detail drawer', () => {
  it('opens on a click, closes on Escape and the close button, and gives focus back', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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

  // Felsic Magma is a Lava product; the pilot has no Lava colony. It shows on
  // the map once Lava is a what-if, and tracing it keeps that tick. Kept as
  // short tests: each map click re-renders the whole map (~0.5s).
  async function traceFelsicMagmaWithLavaWhatIf() {
    const user = userEvent.setup({ delay: null });
    renderMap();
    await user.click(planet('Lava'));
    await user.keyboard('{Escape}');
    // Escape hands focus back to the Lava planet on the next animation frame.
    // Let that frame run (frames fire in request order): on a loaded runner it
    // could otherwise land after the click below and pull focus out of the
    // product drawer it opens.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(planet('Lava')).toHaveFocus();
    await user.click(product('Felsic Magma'));
    return user;
  }

  it('keeps the what-if ticked while its product is traced, and focuses the drawer', async () => {
    await traceFelsicMagmaWithLavaWhatIf();
    const dialog = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    // The drawer takes focus as it opens, in the same act as the click.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('unticks the what-if on a click even though the trace needs it, keeping the trace', async () => {
    const user = await traceFelsicMagmaWithLavaWhatIf();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(planet('Lava'));
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(product('Felsic Magma')).toHaveAttribute('aria-current', 'true');
  });

  it('previews no what-if on a needed planet while tracing, and a click opens the trace', async () => {
    const user = await traceFelsicMagmaWithLavaWhatIf();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(planet('Lava'));
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
    renderMap({ colonies: [] });
    await user.click(product('Biofuels'));
    const dialog = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    expect(within(dialog).getAllByText(/Temperate/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/find one/i)).toBeNull();
    expect(within(dialog).queryByText(/✕/)).toBeNull();
  });

  it('gives focus back after Clear trace in the drawer', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
    renderMap({ advice: { ...advice, slots: { ...advice.slots, ...slots } } });
    await user.click(planet('Lava'));
    expect(within(screen.getByRole('dialog')).getByText(text)).toBeInTheDocument();
  });

  it('has a drawer that explains the map, with legend and EVE University links', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    expect(observedElements().includes(layout)).toBe(true);
  });
});

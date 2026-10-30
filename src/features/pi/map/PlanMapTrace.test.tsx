import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { DOCK_MIN_PANEL_WIDTH } from '@/features/pi/map/mapModel';
import { PlanMap } from '@/features/pi/map/PlanMap';
vi.mock('@/features/pi/useBiggerChains', () => ({
  NO_WHAT_IF_CHAINS: { byType: new Map(), pending: false },
  useWhatIfChains: () => ({ byType: new Map(), pending: false }),
}));
import {
  installPlanMapHarness,
  maybeProduct,
  planet,
  product,
  props,
  renderMap,
  reportWidth,
  stubPhone,
} from '@/test/planMap';

// The finder reads the SDE and the stargate graph; its own behaviour is not under test here.
vi.mock('@/features/pi/map/PlanetFinder', () => ({
  PlanetFinder: ({ types }: { types: readonly string[] }) => (
    <div data-testid="finder">finder for {types.join(',')}</div>
  ),
}));

installPlanMapHarness();

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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
    renderWithSearch();
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    await user.click(product('Proteins'));
    expect(search()).toMatch(/product=/);
    await user.click(product('Proteins'));
    await waitFor(() => expect(search()).toBe('/planetary-industry/map'));
    expect(product('Proteins')).not.toHaveAttribute('aria-current');
  });

  it('docked: clearing a product a link opened replaces the URL', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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

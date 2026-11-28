import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { FittingCompare } from './FittingCompare';

vi.mock('@/sde/loadSde', () => ({ loadTypes: async () => ({}), loadSkills: async () => [] }));
vi.mock('@/features/fittings/fittingPrice', () => ({ loadFittingPrice: async () => null }));
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({
  readyDogmaEngine: () => null,
  subscribeDogmaEngine: () => () => {},
  warmDogmaEngine: () => {},
  computeFittingStats: () => Promise.reject(new Error('no dogma engine in tests')),
}));
const cache = vi.hoisted(() => new Map<string, readonly unknown[]>());
vi.mock('@/features/fittings/useCompareFittings', () => ({
  useCompareFittings: (codes: readonly string[]) => {
    const key = codes.join(',');
    if (!cache.has(key)) {
      cache.set(
        key,
        codes.map((code) => ({
          code,
          fitting: {
            name: code === 'abc' ? 'Brawler' : `Fit ${code}`,
            shipTypeId: 1,
            modules: [],
            drones: [],
            cargo: [],
          },
          shareError: null,
        }))
      );
    }
    return cache.get(key);
  },
}));

describe('FittingCompare column header', () => {
  it('names the fitting with a link to open it in the editor', async () => {
    render(
      <MemoryRouter initialEntries={['/ships/fittings/compare?f=abc']}>
        <Routes>
          <Route path="/ships/fittings/compare" element={<FittingCompare />} />
        </Routes>
      </MemoryRouter>
    );
    const link = await screen.findByRole('link', { name: 'Brawler' });
    expect(link.getAttribute('href')).toContain('f=abc');
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
  });
});

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderWith(path: string, state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/ships/fittings/compare', search: path, state }]}>
      <Routes>
        <Route
          path="/ships/fittings/compare"
          element={
            <>
              <FittingCompare />
              <Search />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('FittingCompare cards', () => {
  it('links back to the editor it came from and marks Saved and Your edits', async () => {
    renderWith('?f=one&f=two', {
      from: 'fitting-editor',
      name: 'L3 Kiter',
      back: '/ships/fittings/edit?f=two',
      savedCode: 'one',
      editedCode: 'two',
    });
    const back = await screen.findByRole('link', { name: /L3 Kiter/ });
    expect(back).toHaveAttribute('href', '/ships/fittings/edit?f=two');
    const [saved, edited] = await screen.findAllByTestId('compare-card');
    expect(within(saved!).getByText('Saved')).toBeInTheDocument();
    expect(within(edited!).getByText('Your edits')).toBeInTheDocument();
  });

  it('shows no back link without an editor origin', async () => {
    renderWith('?f=one');
    await screen.findByTestId('compare-card');
    expect(screen.queryByRole('link', { name: /L3 Kiter/ })).toBeNull();
  });

  it('moves a Fitting to the front with Compare others to this', async () => {
    const user = userEvent.setup();
    renderWith('?f=one&f=two');
    await user.click(await screen.findByRole('button', { name: 'Actions for Fit two' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Compare others to this' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?f=two&f=one');
  });

  it('offers no Compare others to this on the first Fitting', async () => {
    const user = userEvent.setup();
    renderWith('?f=one&f=two');
    await user.click(await screen.findByRole('button', { name: 'Actions for Fit one' }));
    expect(await screen.findByRole('menuitem', { name: 'Replace with' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Compare others to this' })).toBeNull();
  });

  it('opens the picker titled for the Fitting it replaces', async () => {
    const user = userEvent.setup();
    renderWith('?f=one&f=two');
    await user.click(await screen.findByRole('button', { name: 'Actions for Fit two' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Replace with' }));
    expect(await screen.findByRole('dialog', { name: 'Replace Fit two' })).toBeInTheDocument();
  });
});

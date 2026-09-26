import { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TabRoute } from '@/app/TabRoute';
import { routePatternFor } from '@/app/pageTabs';
import { SHIPS_TABS } from '@/features/fittings/shipsTabs';
import { LegacyShipsRedirect } from '@/features/fittings/LegacyShipsRedirect';
import { Ships } from './Ships';
import '@/i18n';

// Stands in for the real Fittings page: counts its mounts, so a test can tell
// "the same instance carried on" from "unmounted and started over".
const mounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('./Fittings', () => ({
  Fittings: function FittingsProbe() {
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return <p>fittings page</p>;
  },
}));
vi.mock('@/features/fittings/shipTree/ShipTreeTab', () => ({
  ShipTreeTab: () => <p>ship tree</p>,
}));

const router = { navigate: (() => {}) as ReturnType<typeof useNavigate> };
function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    router.navigate = navigate;
  }, [navigate]);
  return (
    <output data-testid="at">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

/** The routes as `App.tsx` mounts them: the tabbed page at `/ships/*`, Compare nested, the old paths. */
function renderAt(path: string) {
  mounts.count = 0;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route
          path={routePatternFor('/ships')}
          element={
            <TabRoute page={SHIPS_TABS}>
              <Ships />
            </TabRoute>
          }
        />
        <Route path="/ships/fittings/compare" element={<p>compare page</p>} />
        <Route path="/fittings/*" element={<LegacyShipsRedirect />} />
        <Route path="/skills/ships" element={<LegacyShipsRedirect />} />
      </Routes>
    </MemoryRouter>
  );
}

const at = () => screen.getByTestId('at').textContent;

describe('Ships', () => {
  it('opens on the Fittings tab', () => {
    renderAt('/ships');
    expect(at()).toBe('/ships/fittings');
    expect(screen.getByText('fittings page')).toBeInTheDocument();
  });

  it('keeps the editor as the same mounted page as the library, not a tab to rewrite', () => {
    renderAt('/ships/fittings');
    expect(mounts.count).toBe(1);

    act(() => router.navigate('/ships/fittings/edit?f=1.abc'));
    expect(at()).toBe('/ships/fittings/edit?f=1.abc');
    expect(screen.getByText('fittings page')).toBeInTheDocument();
    expect(mounts.count).toBe(1);

    act(() => router.navigate(-1));
    expect(at()).toBe('/ships/fittings');
    expect(mounts.count).toBe(1);
  });

  it('gives Compare its own route under the Fittings tab', () => {
    renderAt('/ships/fittings/compare?f=1.a&f=1.b');
    expect(at()).toBe('/ships/fittings/compare?f=1.a&f=1.b');
    expect(screen.getByText('compare page')).toBeInTheDocument();
  });

  it('shows the Tree tab under one Ships header, and its tabs switch back to Fittings', async () => {
    renderAt('/ships/tree');
    expect(screen.getByRole('heading', { level: 1, name: 'Ships' })).toBeInTheDocument();
    expect(screen.getByText('ship tree')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Fittings', 'Tree']);

    await userEvent.click(screen.getByRole('tab', { name: 'Fittings' }));
    expect(at()).toBe('/ships/fittings');
    expect(screen.getByText('fittings page')).toBeInTheDocument();
  });

  it('sends an unknown segment to the Fittings tab', () => {
    renderAt('/ships/nope?q=1');
    expect(at()).toBe('/ships/fittings?q=1');
  });
});

describe('the Ships section’s old paths', () => {
  it('opens an old Share Link in the editor', () => {
    renderAt('/fittings?f=1.abc');
    expect(at()).toBe('/ships/fittings/edit?f=1.abc');
    expect(screen.getByText('fittings page')).toBeInTheDocument();
  });

  it.each([
    ['/fittings', '/ships/fittings'],
    ['/fittings#top', '/ships/fittings#top'],
    ['/fittings/edit?f=1.abc', '/ships/fittings/edit?f=1.abc'],
    ['/fittings/edit', '/ships/fittings'],
    ['/fittings/compare?f=1.a&f=1.b', '/ships/fittings/compare?f=1.a&f=1.b'],
    ['/skills/ships', '/ships/tree'],
  ])('%s lands on %s', (from, to) => {
    renderAt(from);
    expect(at()).toBe(to);
  });
});

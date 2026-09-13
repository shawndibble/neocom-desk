import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { BuildPlanContextMenu } from './BuildPlanContextMenu';
import type { BlueprintMap } from '@/sde/types';

const loadBlueprints = vi.fn();
vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: () => loadBlueprints() as Promise<BlueprintMap>,
}));

const BLUEPRINTS: BlueprintMap = {
  // Rifter Blueprint -> Rifter
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderMenu(
  typeId: number,
  seed?: { me: number; te: number; runs: number },
  itemName?: string
) {
  return render(
    <MemoryRouter initialEntries={['/bpc-contracts']}>
      <BuildPlanContextMenu
        typeId={typeId}
        {...(seed ? { seed } : {})}
        {...(itemName ? { itemName } : {})}
        trigger={
          <button type="button" data-testid="row">
            Rifter Blueprint
          </button>
        }
      />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadBlueprints.mockReset();
  loadBlueprints.mockResolvedValue(BLUEPRINTS);
});

describe('BuildPlanContextMenu', () => {
  it('navigates to a Build Plan for the item a blueprint makes, not the blueprint itself', async () => {
    renderMenu(638);
    fireEvent.contextMenu(screen.getByTestId('row'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    // 587 (Rifter), not 638 (its blueprint) — `/industry?product=` looks the
    // typeID up in the catalog's `byProductTypeID`, so the blueprint's own ID
    // would silently resolve to nothing.
    expect(await screen.findByTestId('location')).toHaveTextContent('/industry?product=587');
  });

  it('plans a plain manufacturable item as itself', async () => {
    renderMenu(587);
    fireEvent.contextMenu(screen.getByTestId('row'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/industry?product=587');
  });

  it('disables the action, with a reason, for an item nothing builds', async () => {
    renderMenu(34);
    fireEvent.contextMenu(screen.getByTestId('row'));

    const item = await screen.findByRole('menuitem', { name: 'No blueprint options' });
    expect(item).toHaveAttribute('data-disabled');
  });

  it("carries a listing's own ME, TE and runs through to the plan (#637)", async () => {
    renderMenu(638, { me: 10, te: 20, runs: 5 });
    fireEvent.contextMenu(screen.getByTestId('row'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/industry?product=587&me=10&te=20&runs=5'
    );
  });

  it('seeds an unresearched copy as 0/0 rather than dropping the numbers', async () => {
    renderMenu(638, { me: 0, te: 0, runs: 1 });
    fireEvent.contextMenu(screen.getByTestId('row'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/industry?product=587&me=0&te=0&runs=1'
    );
  });

  it('offers one label whether or not the row carries a seed', async () => {
    // Per the decision recorded with #636: one action, one vocabulary — a
    // seeded row must not grow a second, differently-worded Build Plan entry
    // beside the plain one.
    renderMenu(638, { me: 10, te: 20, runs: 5 });
    fireEvent.contextMenu(screen.getByTestId('row'));

    const buildPlanItems = (await screen.findAllByRole('menuitem')).filter((entry) =>
      entry.textContent?.includes('Build Plan')
    );
    expect(buildPlanItems).toHaveLength(1);
  });

  it('offers the market and clipboard actions a bare type ID is enough for', async () => {
    renderMenu(638);
    fireEvent.contextMenu(screen.getByTestId('row'));

    expect(await screen.findByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    // No name was passed, so there is nothing to copy or to compare by.
    expect(screen.queryByRole('menuitem', { name: 'Copy name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Add to Compare' })).not.toBeInTheDocument();
  });

  it('adds the name-bearing actions once the surface knows what the row is called', async () => {
    renderMenu(638, undefined, 'Rifter Blueprint');
    fireEvent.contextMenu(screen.getByTestId('row'));

    expect(await screen.findByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
  });

  it('does not load the 1.4MB blueprint file until the menu is actually opened', async () => {
    renderMenu(638);
    expect(loadBlueprints).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByTestId('row'));
    await screen.findByRole('menuitem', { name: 'Build Plan' });
    expect(loadBlueprints).toHaveBeenCalled();
  });
});

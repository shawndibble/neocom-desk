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

function renderMenu(typeId: number, seed?: { me: number; te: number; runs: number }) {
  return render(
    <MemoryRouter initialEntries={['/bpc-contracts']}>
      <BuildPlanContextMenu
        typeId={typeId}
        {...(seed ? { seed } : {})}
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
    // seeded row must not grow a second, differently-worded menu entry.
    renderMenu(638, { me: 10, te: 20, runs: 5 });
    fireEvent.contextMenu(screen.getByTestId('row'));

    expect(await screen.findAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByRole('menuitem')).toHaveTextContent('Build Plan');
  });

  it('does not load the 1.4MB blueprint file until the menu is actually opened', async () => {
    renderMenu(638);
    expect(loadBlueprints).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByTestId('row'));
    await screen.findByRole('menuitem', { name: 'Build Plan' });
    expect(loadBlueprints).toHaveBeenCalled();
  });
});

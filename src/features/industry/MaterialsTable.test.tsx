import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { MaterialsTable } from './MaterialsTable';
import type { EffectiveMaterial } from '@/engine/industry/types';

const MATERIALS: EffectiveMaterial[] = [
  { typeID: 34, baseQuantity: 100, quantity: 100 },
  { typeID: 9840, baseQuantity: 10, quantity: 10 },
];
const NAMES: Record<number, string> = { 34: 'Tritanium', 9840: 'Mechanical Parts' };
const nameFor = (typeID: number) => NAMES[typeID] ?? `#${typeID}`;

function renderTable(props: Partial<React.ComponentProps<typeof MaterialsTable>> = {}) {
  return render(
    <MemoryRouter>
      <MaterialsTable
        materials={MATERIALS}
        nameFor={nameFor}
        hubPrices={{ 34: 10 }}
        pricesReady
        {...props}
      />
    </MemoryRouter>
  );
}

/** Mirrors BuildPlanDetail's wiring: the catalog is already in hand, so `blueprintTypeID` is never the "checking…" undefined. */
function menuFor(blueprintByProduct: Record<number, number>, handlers = {}) {
  return function rowContextMenu(material: EffectiveMaterial, tr: React.ReactElement) {
    return (
      <ItemContextMenu
        typeId={material.typeID}
        itemName={nameFor(material.typeID)}
        blueprintTypeID={blueprintByProduct[material.typeID] ?? null}
        onAddToQuickbar={vi.fn()}
        quickbarAvailable
        onShowInfo={vi.fn()}
        {...handlers}
      >
        {tr}
      </ItemContextMenu>
    );
  };
}

describe('MaterialsTable', () => {
  it('renders a row per material with quantity, unit price and line total', () => {
    renderTable();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Tritanium')).toBeInTheDocument();
    expect(within(rows[0]).getByText('100')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Mechanical Parts')).toBeInTheDocument();
  });

  it('flags a material with no hub price rather than showing a bogus total', () => {
    renderTable();
    const row = screen.getByText('Mechanical Parts').closest('tr');
    expect(within(row!).getByText('No price')).toBeInTheDocument();
  });

  it('renders rows unwrapped, and stays focus-inert, when no row menu is supplied', () => {
    renderTable();
    const row = screen.getByText('Tritanium').closest('tr');
    expect(row).not.toHaveAttribute('tabindex');
    fireEvent.contextMenu(row!);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  describe('row context menu', () => {
    it('opens on right-click with the shared item actions', () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      row!.focus();
      fireEvent.contextMenu(row!);

      expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    });

    it('never shows the "checking…" Build Plan label — Industry already holds the catalog', () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      fireEvent.contextMenu(row!);
      expect(screen.getByRole('menuitem', { name: 'Build Plan' })).toBeEnabled();
      expect(
        screen.queryByRole('menuitem', { name: 'Build Plan (checking…)' })
      ).not.toBeInTheDocument();
    });

    it('disables the Build Plan action for a material nothing manufactures', () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Tritanium').closest('tr');
      fireEvent.contextMenu(row!);
      expect(screen.getByRole('menuitem', { name: 'No blueprint options' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    });

    it('targets the right-clicked material, not the first row', async () => {
      const user = userEvent.setup();
      const onShowInfo = vi.fn();
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }, { onShowInfo }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      fireEvent.contextMenu(row!);
      await user.click(screen.getByRole('menuitem', { name: 'Show info' }));
      expect(onShowInfo).toHaveBeenCalledWith(9840, 'Mechanical Parts');
    });
  });
});

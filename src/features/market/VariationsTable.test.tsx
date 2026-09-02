import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { VariationsTable, type VariationsTableProps } from './VariationsTable';
import type { VariationRow } from './variations';
import type { OrderBookSummary } from '@/engine/market/orderBook';

const ROWS: VariationRow[] = [
  { typeId: 588, name: 'Republic Fleet Rifter', tier: 'T2' },
  { typeId: 587, name: 'Rifter', tier: 'T1' },
  { typeId: 589, name: "Vherokior's Slasher", tier: 'Faction' },
];

function summary(bestSell: number | null, bestBuy: number | null): OrderBookSummary {
  return { bestSell, bestBuy, spread: null, availableVolume: 0 };
}

function defaultProps(overrides: Partial<VariationsTableProps> = {}): VariationsTableProps {
  return {
    rows: ROWS,
    totalCount: ROWS.length,
    truncated: false,
    prices: new Map(),
    onSelect: vi.fn(),
    onCompare: vi.fn(),
    blueprintCatalog: null,
    onRequestBlueprintCatalog: vi.fn(),
    onAddToQuickbar: vi.fn(),
    quickbarAvailable: true,
    onShowInfo: vi.fn(),
    ...overrides,
  };
}

/** ItemContextMenu (wired to every row) calls useNavigate/useLocation unconditionally, so any non-empty render needs a Router ancestor. */
function renderTable(overrides: Partial<VariationsTableProps> = {}) {
  return render(
    <MemoryRouter>
      <VariationsTable {...defaultProps(overrides)} />
    </MemoryRouter>
  );
}

describe('VariationsTable', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(
      <VariationsTable {...defaultProps({ rows: [], totalCount: 0 })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Name/Tier/Sell/Buy for each row and defaults to Sell ascending', () => {
    renderTable({
      prices: new Map([
        [588, summary(200, 190)],
        [587, summary(100, 90)],
        [589, summary(300, 290)],
      ]),
    });
    const rowEls = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rowEls[0]).getByText('Rifter')).toBeInTheDocument();
    expect(within(rowEls[0]).getByText('T1')).toBeInTheDocument();
    expect(within(rowEls[1]).getByText('Republic Fleet Rifter')).toBeInTheDocument();
    expect(within(rowEls[2]).getByText("Vherokior's Slasher")).toBeInTheDocument();
  });

  it('shows an em dash for a sibling-fallback row with no tier', () => {
    renderTable({ rows: [{ typeId: 34, name: 'Tritanium', tier: null }], totalCount: 1 });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a loading state until a row price arrives', () => {
    renderTable({ rows: [ROWS[0]], totalCount: 1 });
    expect(screen.getAllByText('Loading').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the sell-side empty state when only a buy order exists, and vice versa', () => {
    renderTable({ rows: [ROWS[0]], totalCount: 1, prices: new Map([[588, summary(null, 90)]]) });
    expect(screen.getByText('No sell orders')).toBeInTheDocument();
    expect(screen.getByText('90.00')).toBeInTheDocument();
  });

  it('shows the shared "no orders" fallback when neither side has an order', () => {
    renderTable({ rows: [ROWS[0]], totalCount: 1, prices: new Map([[588, summary(null, null)]]) });
    expect(screen.getAllByText('No orders')).toHaveLength(2);
  });

  it('re-anchors on the clicked row via onSelect, anywhere in the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTable({ onSelect });
    const rifterRow = screen.getByText('Rifter').closest('tr');
    if (!rifterRow) throw new Error('expected a Rifter row');
    await user.click(rifterRow);
    expect(onSelect).toHaveBeenCalledWith(587);
  });

  it('calls onCompare when the Compare button is clicked', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    renderTable({ onCompare });
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('shows the truncated warning with the shown/total counts', () => {
    renderTable({ totalCount: 40, truncated: true });
    expect(screen.getByText('Showing 3 of 40')).toBeInTheDocument();
  });

  it('re-sorts Sell descending on a second header click', async () => {
    const user = userEvent.setup();
    renderTable({
      prices: new Map([
        [588, summary(200, 190)],
        [587, summary(100, 90)],
        [589, summary(300, 290)],
      ]),
    });
    await user.click(screen.getByRole('button', { name: /Sell/ }));
    const rowEls = screen.getAllByRole('row').slice(1);
    expect(within(rowEls[0]).getByText("Vherokior's Slasher")).toBeInTheDocument();
  });

  it('sorts by Name on header click', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: /Name/ }));
    const rowEls = screen.getAllByRole('row').slice(1);
    expect(within(rowEls[0]).getByText('Republic Fleet Rifter')).toBeInTheDocument();
    expect(within(rowEls[1]).getByText('Rifter')).toBeInTheDocument();
    expect(within(rowEls[2]).getByText("Vherokior's Slasher")).toBeInTheDocument();
  });

  it('sorts by Buy on header click', async () => {
    const user = userEvent.setup();
    renderTable({
      prices: new Map([
        [588, summary(200, 190)],
        [587, summary(100, 90)],
        [589, summary(300, 290)],
      ]),
    });
    await user.click(screen.getByRole('button', { name: /Buy/ }));
    const rowEls = screen.getAllByRole('row').slice(1);
    expect(within(rowEls[0]).getByText('Rifter')).toBeInTheDocument();
  });

  describe('row context menu (issue #147)', () => {
    it('opens on right-click with the standard six actions plus Compare Variations', async () => {
      renderTable();
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      row.focus();
      fireEvent.contextMenu(row);

      expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Compare Variations' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
      expect(
        await screen.findByRole('menuitem', { name: 'Build Plan (checking…)' })
      ).toBeInTheDocument();
    });

    it('requests the blueprint catalog when the menu opens, same as the tree', () => {
      const onRequestBlueprintCatalog = vi.fn();
      renderTable({ onRequestBlueprintCatalog });
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      fireEvent.contextMenu(row);
      expect(onRequestBlueprintCatalog).toHaveBeenCalledTimes(1);
    });

    it('adds the right-clicked row to the Quickbar via Add to Quickbar', async () => {
      const user = userEvent.setup();
      const onAddToQuickbar = vi.fn();
      renderTable({ onAddToQuickbar });
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      fireEvent.contextMenu(row);
      await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));
      expect(onAddToQuickbar).toHaveBeenCalledWith(587, 'Rifter');
    });

    it('shows info for the right-clicked row via Show info', async () => {
      const user = userEvent.setup();
      const onShowInfo = vi.fn();
      renderTable({ onShowInfo });
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      fireEvent.contextMenu(row);
      await user.click(screen.getByRole('menuitem', { name: 'Show info' }));
      expect(onShowInfo).toHaveBeenCalledWith(587, 'Rifter');
    });

    it('opens the compare modal for the whole table via the row-level Compare Variations action', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn();
      renderTable({ onCompare });
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      fireEvent.contextMenu(row);
      await user.click(screen.getByRole('menuitem', { name: 'Compare Variations' }));
      expect(onCompare).toHaveBeenCalledTimes(1);
    });

    it('right-click opens the menu without also selecting the row (left/right-click non-interference)', () => {
      const onSelect = vi.fn();
      renderTable({ onSelect });
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      fireEvent.contextMenu(row);
      expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('left-click still selects the row while the menu is available', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      renderTable({ onSelect });
      const row = screen.getByText('Rifter').closest('tr');
      if (!row) throw new Error('expected a Rifter row');
      await user.click(row);
      expect(onSelect).toHaveBeenCalledWith(587);
      expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { VariationsTable } from './VariationsTable';
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

describe('VariationsTable', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(
      <VariationsTable
        rows={[]}
        totalCount={0}
        truncated={false}
        prices={new Map()}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Name/Tier/Sell/Buy for each row and defaults to Sell ascending', () => {
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={3}
        truncated={false}
        prices={
          new Map([
            [588, summary(200, 190)],
            [587, summary(100, 90)],
            [589, summary(300, 290)],
          ])
        }
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    const rowEls = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rowEls[0]).getByText('Rifter')).toBeInTheDocument();
    expect(within(rowEls[0]).getByText('T1')).toBeInTheDocument();
    expect(within(rowEls[1]).getByText('Republic Fleet Rifter')).toBeInTheDocument();
    expect(within(rowEls[2]).getByText("Vherokior's Slasher")).toBeInTheDocument();
  });

  it('shows an em dash for a sibling-fallback row with no tier', () => {
    render(
      <VariationsTable
        rows={[{ typeId: 34, name: 'Tritanium', tier: null }]}
        totalCount={1}
        truncated={false}
        prices={new Map()}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a loading state until a row price arrives', () => {
    render(
      <VariationsTable
        rows={[ROWS[0]]}
        totalCount={1}
        truncated={false}
        prices={new Map()}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    expect(screen.getAllByText('Loading').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the sell-side empty state when only a buy order exists, and vice versa', () => {
    render(
      <VariationsTable
        rows={[ROWS[0]]}
        totalCount={1}
        truncated={false}
        prices={new Map([[588, summary(null, 90)]])}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    expect(screen.getByText('No sell orders')).toBeInTheDocument();
    expect(screen.getByText('90.00')).toBeInTheDocument();
  });

  it('shows the shared "no orders" fallback when neither side has an order', () => {
    render(
      <VariationsTable
        rows={[ROWS[0]]}
        totalCount={1}
        truncated={false}
        prices={new Map([[588, summary(null, null)]])}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    expect(screen.getAllByText('No orders')).toHaveLength(2);
  });

  it('re-anchors on the clicked row via onSelect, anywhere in the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={3}
        truncated={false}
        prices={new Map()}
        onSelect={onSelect}
        onCompare={vi.fn()}
      />
    );
    const rifterRow = screen.getByText('Rifter').closest('tr');
    if (!rifterRow) throw new Error('expected a Rifter row');
    await user.click(rifterRow);
    expect(onSelect).toHaveBeenCalledWith(587);
  });

  it('calls onCompare when the Compare button is clicked', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={3}
        truncated={false}
        prices={new Map()}
        onSelect={vi.fn()}
        onCompare={onCompare}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('shows the truncated warning with the shown/total counts', () => {
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={40}
        truncated={true}
        prices={new Map()}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    expect(screen.getByText('Showing 3 of 40')).toBeInTheDocument();
  });

  it('re-sorts Sell descending on a second header click', async () => {
    const user = userEvent.setup();
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={3}
        truncated={false}
        prices={
          new Map([
            [588, summary(200, 190)],
            [587, summary(100, 90)],
            [589, summary(300, 290)],
          ])
        }
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /Sell/ }));
    const rowEls = screen.getAllByRole('row').slice(1);
    expect(within(rowEls[0]).getByText("Vherokior's Slasher")).toBeInTheDocument();
  });

  it('sorts by Name on header click', async () => {
    const user = userEvent.setup();
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={3}
        truncated={false}
        prices={new Map()}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /Name/ }));
    const rowEls = screen.getAllByRole('row').slice(1);
    expect(within(rowEls[0]).getByText('Republic Fleet Rifter')).toBeInTheDocument();
    expect(within(rowEls[1]).getByText('Rifter')).toBeInTheDocument();
    expect(within(rowEls[2]).getByText("Vherokior's Slasher")).toBeInTheDocument();
  });

  it('sorts by Buy on header click', async () => {
    const user = userEvent.setup();
    render(
      <VariationsTable
        rows={ROWS}
        totalCount={3}
        truncated={false}
        prices={
          new Map([
            [588, summary(200, 190)],
            [587, summary(100, 90)],
            [589, summary(300, 290)],
          ])
        }
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /Buy/ }));
    const rowEls = screen.getAllByRole('row').slice(1);
    expect(within(rowEls[0]).getByText('Rifter')).toBeInTheDocument();
  });
});

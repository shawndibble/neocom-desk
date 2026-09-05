import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@/i18n';
import { PriceHistoryPanel } from './PriceHistoryPanel';
import { loadPriceHistory } from './priceHistory';

// Every fixed-date fixture below is well within 30 days of this, so the
// panel's default range never has to change per test just to keep a point visible.
const FIXED_NOW = new Date('2026-08-05T00:00:00Z');

vi.mock('./priceHistory', () => ({
  loadPriceHistory: vi.fn(),
}));

vi.mock('./PriceHistoryChart', () => ({
  default: ({ points, itemName }: { points: unknown[]; itemName: string }) => (
    <div data-testid="chart">
      {itemName}: {points.length} points
    </div>
  ),
}));

const mockedLoad = vi.mocked(loadPriceHistory);

afterEach(() => {
  vi.clearAllMocks();
});

describe('PriceHistoryPanel', () => {
  it('shows a loading state while the request is in flight', () => {
    mockedLoad.mockReturnValue(new Promise(() => {}));
    render(<PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an empty state, not the chart, when ESI has no history for the item', async () => {
    mockedLoad.mockResolvedValue({ points: [], fetchedAt: 1_000_000 });
    render(<PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" />);
    expect(await screen.findByText('No price history')).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('shows a distinct error state, not the empty state, when the fetch fails', async () => {
    mockedLoad.mockRejectedValue(new Error('network down'));
    render(<PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" />);
    expect(await screen.findByText("Couldn't load price history")).toBeInTheDocument();
    expect(screen.queryByText('No price history')).not.toBeInTheDocument();
  });

  it('renders the lazy chart once history points arrive', async () => {
    mockedLoad.mockResolvedValue({
      points: [{ date: '2026-08-01', average: 5, volume: 50 }],
      fetchedAt: 1_000_000,
    });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    expect(screen.getByTestId('chart')).toHaveTextContent('Tritanium: 1 points');
  });

  it('re-fetches when the region or type changes', async () => {
    mockedLoad.mockResolvedValue({ points: [], fetchedAt: 1_000_000 });
    const { rerender } = render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(1));
    rerender(
      <PriceHistoryPanel regionId={10000043} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(2));
    expect(mockedLoad).toHaveBeenLastCalledWith(10000043, 34);
  });

  it('shows a hi/lo/median summary line above the chart', async () => {
    mockedLoad.mockResolvedValue({
      points: [
        { date: '2026-08-01', average: 10, volume: 5 },
        { date: '2026-08-02', average: 30, volume: 5 },
        { date: '2026-08-03', average: 20, volume: 5 },
      ],
      fetchedAt: 1_000_000,
    });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    expect(screen.getByText(/High: 30.00/)).toBeInTheDocument();
    expect(screen.getByText(/Low: 10.00/)).toBeInTheDocument();
    expect(screen.getByText(/Median: 20.00/)).toBeInTheDocument();
  });

  it('narrows the chart to the selected date range', async () => {
    mockedLoad.mockResolvedValue({
      points: [
        { date: '2026-07-20', average: 5, volume: 50 }, // within 30d (default) but outside 7d
        { date: '2026-08-04', average: 6, volume: 50 }, // within 7d
      ],
      fetchedAt: 1_000_000,
    });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    expect(screen.getByTestId('chart')).toHaveTextContent('Tritanium: 2 points');

    fireEvent.change(screen.getByLabelText('Range'), { target: { value: '7d' } });
    expect(screen.getByTestId('chart')).toHaveTextContent('Tritanium: 1 points');
  });
});

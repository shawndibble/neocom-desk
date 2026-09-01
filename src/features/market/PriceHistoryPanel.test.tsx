import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { PriceHistoryPanel } from './PriceHistoryPanel';
import { loadPriceHistory } from './priceHistory';

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
    render(<PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" />);
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    expect(screen.getByTestId('chart')).toHaveTextContent('Tritanium: 1 points');
  });

  it('re-fetches when the region or type changes', async () => {
    mockedLoad.mockResolvedValue({ points: [], fetchedAt: 1_000_000 });
    const { rerender } = render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" />
    );
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(1));
    rerender(<PriceHistoryPanel regionId={10000043} typeId={34} itemName="Tritanium" />);
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(2));
    expect(mockedLoad).toHaveBeenLastCalledWith(10000043, 34);
  });
});

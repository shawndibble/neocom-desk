import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { PriceHistoryPanel } from './PriceHistoryPanel';
import { loadPriceHistory } from './priceHistory';
import {
  usePriceHistoryRange,
  DEFAULT_PRICE_HISTORY_RANGE,
  PRICE_HISTORY_RANGE_KEY,
} from './priceHistoryRangePref';

// Every fixed-date fixture below is well within 30 days of this, so the
// panel's default range never has to change per test just to keep a point visible.
const FIXED_NOW = new Date('2026-08-05T00:00:00Z');

vi.mock('./priceHistory', () => ({
  loadPriceHistory: vi.fn(),
}));

vi.mock('./PriceHistoryChart', () => ({
  default: ({
    points,
    itemName,
    movingAverage,
  }: {
    points: unknown[];
    itemName: string;
    movingAverage?: unknown[];
  }) => (
    <div data-testid="chart">
      {itemName}: {points.length} points, {movingAverage?.length ?? 0} ma points
    </div>
  ),
}));

const mockedLoad = vi.mocked(loadPriceHistory);

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(async () => {
  await db.settings.clear();
  // Module-scope store: without a reset, the range one test picks is the
  // window the next one opens on.
  usePriceHistoryRange.setState({ value: DEFAULT_PRICE_HISTORY_RANGE, hydrated: false });
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
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('combobox', { name: 'Range' }));
    await user.click(await screen.findByRole('option', { name: '7 days' }));
    expect(screen.getByTestId('chart')).toHaveTextContent('Tritanium: 1 points');
  });

  /**
   * The panel is remounted per item, so before this a trader comparing a run
   * of prices across several items re-picked their window on every one. The
   * range slices points already fetched, so remembering it costs nothing.
   */
  it('opens the next item on the range last chosen, not back at 30 days', async () => {
    const user = userEvent.setup();
    mockedLoad.mockResolvedValue({
      points: [
        { date: '2026-07-20', average: 5, volume: 50 }, // within 30d, outside 7d
        { date: '2026-08-04', average: 6, volume: 50 }, // within 7d
      ],
      fetchedAt: 1_000_000,
    });
    const { unmount } = render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    await user.click(screen.getByRole('combobox', { name: 'Range' }));
    await user.click(await screen.findByRole('option', { name: '7 days' }));
    unmount();

    usePriceHistoryRange.setState({ hydrated: false });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={35} itemName="Pyerite" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('7 days');
    });
    expect(screen.getByTestId('chart')).toHaveTextContent('Pyerite: 1 points');
    expect((await db.settings.get(PRICE_HISTORY_RANGE_KEY))?.value).toBe('7d');
  });

  it('passes no moving-average points when the item has fewer real days than the window', async () => {
    mockedLoad.mockResolvedValue({
      points: [
        { date: '2026-08-03', average: 10, volume: 5 },
        { date: '2026-08-04', average: 12, volume: 5 },
      ],
      fetchedAt: 1_000_000,
    });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    expect(screen.getByTestId('chart')).toHaveTextContent('0 ma points');
  });

  it('computes the moving average over the full unfiltered series, not the filtered range', async () => {
    // 10 real days of history: the default 30d range keeps all of them, and
    // a correct 7-day window (computed pre-filter) yields 4 MA points
    // (days 7-10). Computing after filtering would still yield 4 here since
    // 30d keeps everything — the 7d-range assertion below is what actually
    // distinguishes pre- vs post-filter computation.
    const points = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-07-${String(20 + i).padStart(2, '0')}`,
      average: 10 + i,
      volume: 5,
    }));
    mockedLoad.mockResolvedValue({ points, fetchedAt: 1_000_000 });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    expect(screen.getByTestId('chart')).toHaveTextContent('4 ma points');
  });

  it('uses a shorter window on the 7d range so it never collapses to a single point', async () => {
    const user = userEvent.setup();
    // 7 real days ending today: a 7-day window here would produce exactly 1
    // MA point (a restatement of the summary), which is the defect the
    // ticket calls out. The 7d range must use a shorter window instead.
    const points = [
      { date: '2026-07-30', average: 10, volume: 5 },
      { date: '2026-07-31', average: 11, volume: 5 },
      { date: '2026-08-01', average: 12, volume: 5 },
      { date: '2026-08-02', average: 13, volume: 5 },
      { date: '2026-08-03', average: 14, volume: 5 },
      { date: '2026-08-04', average: 15, volume: 5 },
      { date: '2026-08-05', average: 16, volume: 5 },
    ];
    mockedLoad.mockResolvedValue({ points, fetchedAt: 1_000_000 });
    render(
      <PriceHistoryPanel regionId={10000002} typeId={34} itemName="Tritanium" now={FIXED_NOW} />
    );
    await waitFor(() => expect(screen.getByTestId('chart')).toBeInTheDocument());
    await user.click(screen.getByRole('combobox', { name: 'Range' }));
    await user.click(await screen.findByRole('option', { name: '7 days' }));
    expect(screen.getByTestId('chart')).toHaveTextContent('5 ma points');
  });
});

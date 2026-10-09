import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MAX_LINE_WIDTH } from '@/engine/survey/chatMessage';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { configureClipboard } from '@/lib/clipboard';
import { useIsPhone } from '@/lib/useIsPhone';
import { SurveyBoard } from './SurveyBoard';

// Recharts needs a real layout; the chart has its own concerns.
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: vi.fn(() => false) }));
// Rocks are valued at market; the hook's own lookup has its own concerns.
vi.mock('./useOrePrices', () => ({
  useOrePrices: () => ({
    prices: new Map([
      ['Clear Icicle', 200_000],
      ['Scordite', 1],
      ['Veldspar', 1],
      ['Pyroxeres', 1],
    ]),
    hub: { id: 'jita', name: 'Jita IV - Moon 4', systemName: 'Jita' },
    compressed: true,
  }),
}));
vi.mock('./SurveyCharts', () => ({ SurveyCharts: () => <div data-testid="charts" /> }));

const FIRST = [
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km',
  'Clear Icicle\t29\t29,000 m3\t5,940,000.00 ISK\t7,222 m',
  'Clear Icicle\t38\t38,000 m3\t7,790,000.00 ISK\t7,459 m',
  'Clear Icicle\t48\t48,000 m3\t9,840,000.00 ISK\t8,246 m',
  'Clear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km',
].join('\n');
const SECOND = FIRST.replace(
  'Clear Icicle\t29\t29,000 m3\t5,940,000.00',
  'Clear Icicle\t3\t3,000 m3\t615,000.00'
);

const T0 = Date.UTC(2026, 9, 8, 18, 0, 0);
const SCANS = [
  { at: T0, rocks: parseSurveyScan(FIRST)! },
  { at: T0 + 10 * 60_000, rocks: parseSurveyScan(SECOND)! },
];
const URL = 'https://neocomdesk.test/share/abc123XYZ';

afterEach(() => {
  cleanup();
  vi.mocked(useIsPhone).mockReturnValue(false);
  configureClipboard(null);
});

describe('SurveyBoard', () => {
  it('with no scans shows the empty state and a paste box', () => {
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} onAdd={async () => 'ok'} />);
    expect(screen.getByText('No survey yet')).toBeTruthy();
    expect(screen.getByLabelText('Survey scan')).toBeTruthy();
  });

  it('shows progress, pace and rocks left for two scans', async () => {
    render(
      <SurveyBoard
        scans={SCANS}
        url={URL}
        expiresAt={Date.UTC(2026, 9, 15)}
        onAdd={async () => 'ok'}
      />
    );
    expect(screen.getByText('13% mined')).toBeTruthy();
    expect(screen.getByText('2 scans')).toBeTruthy();
    expect(screen.getByText('43.3 m³/s')).toBeTruthy();
    // 169,000 of the 195,000 m³ the scans have shown of this ore is left.
    expect(screen.getByText(/87% left/)).toBeTruthy();
    // 169 units left at the market price, summed (the scanner's own ISK is ignored).
    // The figure is an `IskAmount`: shorthand on screen, the exact value one hover away.
    expect(screen.getByText('ISK left').parentElement?.textContent).toMatch(/33\.\d+M/);
    expect(await screen.findByTestId('charts')).toBeTruthy();
  });

  it('copies a four-line chat message ending in the link, each line within the width', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} onAdd={async () => 'ok'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy chat message' }));
    await waitFor(() => expect(written).toHaveLength(1));

    const lines = written[0].split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^Rocks cracking · done <b>\d\d:\d\d EVE<\/b> \(~/);
    expect(lines[1]).toBe('▕██░░░░░░░░░░░░░░░░░░▏ 13%');
    expect(lines[2]).toBe('Left: 5 Clear Icicle');
    expect(lines[3]).toBe(URL);
    for (const line of lines.slice(0, 3)) {
      expect(line.replace(/<\/?b>/g, '').length).toBeLessThanOrEqual(MAX_LINE_WIDTH);
    }
    await screen.findByText('Copied');
  });

  it('copies the link alone from the caret next to the chat button', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} onAdd={async () => 'ok'} />);
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More copy options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() => expect(written).toEqual([URL]));
    // The one button that flashed is the main one, so the outcome shows where the pilot is looking.
    await screen.findByRole('button', { name: 'Link copied' });
  });

  it('adds a scan pasted into the box without a button press', () => {
    const onAdd = vi.fn(async () => 'ok' as const);
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} onAdd={onAdd} />);
    fireEvent.paste(screen.getByLabelText('Survey scan'), {
      clipboardData: { getData: () => FIRST },
    });
    expect(onAdd).toHaveBeenCalledWith(FIRST);
  });

  it('processes anything pasted into the box at once, and says so when it is not a scan', async () => {
    const onAdd = vi.fn(async () => 'not-a-scan' as const);
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} onAdd={onAdd} />);
    fireEvent.paste(screen.getByLabelText('Survey scan'), {
      clipboardData: { getData: () => 'hello' },
    });
    expect(onAdd).toHaveBeenCalledWith('hello');
    expect((await screen.findByRole('alert')).textContent).toContain("isn't a Survey Scanner copy");
  });

  it('has no Add scan button, and typing into the box does nothing', () => {
    const onAdd = vi.fn(async () => 'ok' as const);
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} onAdd={onAdd} />);
    expect(screen.queryByRole('button', { name: 'Add scan' })).toBeNull();
    const box = screen.getByLabelText('Survey scan') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'typed' } });
    expect(box.value).toBe('');
    expect(onAdd).not.toHaveBeenCalled();
  });
  describe('value colours and layout', () => {
    // Priced at 1 ISK a unit by the mocked market, so units are the ISK.
    const row = (ore: string, volume: number, units: number) => ({ ore, volume, units });
    // ISK per m3: Scordite 108, Veldspar 93, Pyroxeres 77, so orange, yellow and blue against the richest.
    const richScans = [
      {
        at: T0,
        rocks: [
          row('Scordite', 5274, 570_000),
          row('Veldspar', 8260, 772_000),
          row('Pyroxeres', 1842, 141_000),
        ],
      },
    ];

    it('colours each ore bar by its ISK per m3 left, and says what the colours mean', () => {
      render(<SurveyBoard scans={richScans} url={URL} expiresAt={null} onAdd={async () => 'ok'} />);
      const tierOf = (ore: string) =>
        screen
          .getByText(ore, { selector: 'span' })
          .closest('li')
          ?.querySelector('[data-value-tier]')
          ?.getAttribute('data-value-tier');
      expect(tierOf('Scordite')).toBe('orange');
      expect(tierOf('Veldspar')).toBe('yellow');
      expect(tierOf('Pyroxeres')).toBe('blue');
      expect(screen.getByText('Bar colour is ISK per m³ left · Jita buy, compressed')).toBeTruthy();
      // Colour is never the only signal: each row also says its tier in words for a screen reader.
      expect(screen.getByText(/highest value per m³/)).toBeTruthy();
      expect(screen.getByText(/low value per m³/)).toBeTruthy();
    });

    it('shows each ore with its rocks and the ISK left in it', () => {
      render(<SurveyBoard scans={richScans} url={URL} expiresAt={null} onAdd={async () => 'ok'} />);
      const row = screen.getByText('Scordite', { selector: 'span' }).closest('li');
      expect(row?.textContent).toMatch(/1 rock · 5\.3K m³ · .*570K.* ISK · 100% left/);
    });

    it('has one Copy chat message button, in the header on a desktop and under the chart on a phone', () => {
      const { unmount } = render(
        <SurveyBoard scans={SCANS} url={URL} expiresAt={null} onAdd={async () => 'ok'} />
      );
      expect(screen.getAllByRole('button', { name: 'Copy chat message' })).toHaveLength(1);
      unmount();
      vi.mocked(useIsPhone).mockReturnValue(true);
      render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} onAdd={async () => 'ok'} />);
      expect(screen.getAllByRole('button', { name: 'Copy chat message' })).toHaveLength(1);
    });

    it('explains the chart: a swatch per ore, the rate and the projection', () => {
      render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} onAdd={async () => 'ok'} />);
      expect(screen.getByText('Mining rate')).toBeTruthy();
      expect(screen.getByText('Dashed: finish at the current pace')).toBeTruthy();
      expect(screen.getAllByText('Clear Icicle').length).toBeGreaterThan(0);
    });
  });
});

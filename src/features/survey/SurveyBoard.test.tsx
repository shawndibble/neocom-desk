import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { textWidth } from '@/engine/survey/chatFont';
import { MAX_ROW_PX } from '@/engine/survey/chatMessage';
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
      ['Scordite', 100],
      ['Veldspar', 80],
      ['Pyroxeres', 40],
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

describe('SurveyBoard footer actions', () => {
  it('puts a dot between each of the bottom-right actions', () => {
    render(
      <SurveyBoard
        scans={SCANS}
        url={URL}
        expiresAt={Date.UTC(2026, 9, 15)}
        owned
        onFinish={async () => true}
        footerActions={[<button key="a">Change owner</button>, <button key="b">New survey</button>]}
      />
    );
    const row = screen.getByRole('button', { name: 'Mark field cleared' }).parentElement!;
    expect(row.textContent).toBe('Mark field cleared·Change owner·New survey');
    expect(row.querySelectorAll('[aria-hidden]')).toHaveLength(2);
  });

  it('adds no dot for a lone action', () => {
    render(
      <SurveyBoard
        scans={SCANS}
        url={URL}
        expiresAt={null}
        footerActions={<button>New survey</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'New survey' }).parentElement?.textContent).toBe(
      'New survey'
    );
  });
});

describe('SurveyBoard', () => {
  it('with no scans shows the empty state, and no paste box', () => {
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} />);
    expect(screen.getByText('No survey yet')).toBeTruthy();
    expect(screen.queryByLabelText('Survey scan')).toBeNull();
  });

  it('shows progress, pace and rocks left for two scans', async () => {
    render(<SurveyBoard scans={SCANS} url={URL} expiresAt={Date.UTC(2026, 9, 15)} />);
    expect(screen.getByText('13% mined')).toBeTruthy();
    expect(screen.getByText('2 scans')).toBeTruthy();
    expect(screen.getByText('43.3')).toBeTruthy();
    // 169,000 of the 195,000 m³ the scans have shown of this ore is left.
    expect(screen.getByText(/87% left/)).toBeTruthy();
    // 169 units left at the market price, summed (the scanner's own ISK is ignored).
    // The figure is an `IskAmount`: shorthand on screen, the exact value one hover away.
    expect(screen.getByText('ISK left').parentElement?.textContent).toMatch(/33\.\d+M/);
    expect(await screen.findByTestId('charts')).toBeTruthy();
  });

  it('with one scan shows a dash for done at, and asks for another scan where the chart goes', () => {
    render(<SurveyBoard scans={SCANS.slice(0, 1)} url={URL} expiresAt={null} />);
    expect(screen.getByText('Add another scan to see the chart')).toBeTruthy();
    expect(screen.queryByTestId('charts')).toBeNull();
    expect(screen.getByText('Done at').nextElementSibling?.textContent).toBe('–');
  });

  it('copies a heading and a four-row box with the link on the bottom rail, each row within the width', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy chat message' }));
    await waitFor(() => expect(written).toHaveLength(1));

    const [heading, ...lines] = written[0].split('\n');
    expect(heading).toBe('Neocom Desk Report');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^┌─*\[ ETA: \d\d:\d\d EVE \(~.*\]─*╌┄┈$/);
    expect(lines[1]).toMatch(/^│ █+░+ 13%$/);
    expect(lines[2]).toBe('│ Left: 5 Clear Icicle');
    expect(lines[3]).toContain(`[ ${URL} ]`);
    // The link's rail can run past the cap (a link cannot be shortened); the ore line cannot.
    expect(textWidth(lines[2])).toBeLessThanOrEqual(MAX_ROW_PX);
    await screen.findByText('Copied');
  });

  it('copies the link alone from the caret next to the chat button', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} />);
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More copy options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() => expect(written).toEqual([URL]));
    // The one button that flashed is the main one, so the outcome shows where the pilot is looking.
    await screen.findByRole('button', { name: 'Link copied' });
  });

  describe('value colours and layout', () => {
    // Priced by the mocked market at 100, 80 and 40 ISK a unit: the unit counts below are chosen so
    // the ISK left is round.
    const row = (ore: string, volume: number, units: number) => ({ ore, volume, units });
    // Unit price: Scordite 100, Veldspar 80, Pyroxeres 40, so orange, yellow and gray down the range.
    const richScans = [
      {
        at: T0,
        rocks: [
          row('Scordite', 5274, 5_700),
          row('Veldspar', 8260, 9_650),
          row('Pyroxeres', 1842, 3_525),
        ],
      },
    ];

    it('colours each ore bar by its unit price, dearest orange, cheapest gray, and says what the colours mean', () => {
      render(<SurveyBoard scans={richScans} url={URL} expiresAt={null} />);
      const tierOf = (ore: string) =>
        screen
          .getByText(ore, { selector: 'span' })
          .closest('li')
          ?.querySelector('[data-value-tier]')
          ?.getAttribute('data-value-tier');
      expect(tierOf('Scordite')).toBe('orange');
      expect(tierOf('Veldspar')).toBe('yellow');
      expect(tierOf('Pyroxeres')).toBe('gray');
      expect(
        screen.getByText('Bar colour is the price of one unit · Jita buy, compressed')
      ).toBeTruthy();
      // Colour is never the only signal: each row also says its tier in words for a screen reader.
      expect(screen.getByText(/highest price/)).toBeTruthy();
      expect(screen.getByText(/lowest price/)).toBeTruthy();
    });

    it('shows each ore with its rocks and the ISK left in it', () => {
      render(<SurveyBoard scans={richScans} url={URL} expiresAt={null} />);
      const row = screen.getByText('Scordite', { selector: 'span' }).closest('li');
      expect(row?.textContent).toMatch(/1 rock · 5\.3K m³ · .*570K.* ISK · 100% left/);
    });

    it('has one Copy chat message button, in the header, on a phone too', () => {
      const { unmount } = render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} />);
      expect(screen.getAllByRole('button', { name: 'Copy chat message' })).toHaveLength(1);
      unmount();
      vi.mocked(useIsPhone).mockReturnValue(true);
      render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} />);
      expect(screen.getAllByRole('button', { name: 'Copy chat message' })).toHaveLength(1);
    });

    it('explains the chart: a swatch per ore, and the rate', () => {
      render(<SurveyBoard scans={SCANS} url={URL} expiresAt={null} />);
      expect(screen.getByText('Mining rate')).toBeTruthy();
      expect(screen.getAllByText('Clear Icicle').length).toBeGreaterThan(0);
    });
  });

  describe('removing a scan', () => {
    const WITH_IDS = SCANS.map((s, i) => ({ ...s, id: `scan${i}` }));

    it('shows the scan list only when the caller offers removal, and as the last thing on the page', () => {
      const { container, unmount } = render(
        <SurveyBoard scans={WITH_IDS} url={URL} expiresAt={null} />
      );
      expect(container.querySelector('details')).toBeNull();
      unmount();
      const owner = render(
        <SurveyBoard scans={WITH_IDS} url={URL} expiresAt={null} onSetIgnored={() => {}} />
      );
      const list = screen.getByText('2 scans', { selector: 'summary' }).closest('details');
      expect(list).toBeTruthy();
      expect(owner.container.querySelector('details')).toBe(list);
      expect(owner.container.firstElementChild?.lastElementChild).toBe(list);
    });

    it('removes a scan from the list with its Remove button', async () => {
      const onSetIgnored = vi.fn();
      render(
        <SurveyBoard scans={WITH_IDS} url={URL} expiresAt={null} onSetIgnored={onSetIgnored} />
      );
      await userEvent.click(screen.getByText('2 scans', { selector: 'summary' }));
      // Newest first.
      await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
      expect(onSetIgnored).toHaveBeenCalledWith('scan1', true);
    });

    it('leaves a removed scan out of the totals, and offers to restore it', async () => {
      const onSetIgnored = vi.fn();
      render(
        <SurveyBoard
          scans={WITH_IDS}
          ignored={new Set(['scan1'])}
          url={URL}
          expiresAt={null}
          onSetIgnored={onSetIgnored}
        />
      );
      // One counted scan: nothing mined yet, no chart.
      expect(screen.getByText('0% mined')).toBeTruthy();
      expect(screen.queryByTestId('charts')).toBeNull();
      expect(screen.getByText('2 scans · 1 removed', { selector: 'summary' })).toBeTruthy();
      await userEvent.click(screen.getByText(/^2 scans/, { selector: 'summary' }));
      await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
      expect(onSetIgnored).toHaveBeenCalledWith('scan1', false);
    });

    it('still offers Restore when every scan has been removed', async () => {
      const onSetIgnored = vi.fn();
      render(
        <SurveyBoard
          scans={WITH_IDS}
          ignored={new Set(['scan0', 'scan1'])}
          url={URL}
          expiresAt={null}
          onSetIgnored={onSetIgnored}
        />
      );
      expect(screen.getByText('No survey yet')).toBeTruthy();
      await userEvent.click(screen.getByText(/^2 scans/, { selector: 'summary' }));
      await userEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]);
      expect(onSetIgnored).toHaveBeenCalledWith('scan1', false);
    });

    it('a visitor with no removal offered still gets the totals without the removed scan', () => {
      render(
        <SurveyBoard scans={WITH_IDS} ignored={new Set(['scan1'])} url={URL} expiresAt={null} />
      );
      expect(screen.getByText('0% mined')).toBeTruthy();
      expect(screen.queryByText(/removed/)).toBeNull();
    });
  });

  describe('marking the field cleared', () => {
    // Relative to the real clock: the button reads it. Pace is 43 m³/s, so 169,000 m³ left is over an hour away.
    const recent = (offsetMs = 0) => [
      { at: Date.now() - 10 * 60_000 + offsetMs, rocks: parseSurveyScan(FIRST)! },
      { at: Date.now() + offsetMs, rocks: parseSurveyScan(SECOND)! },
    ];
    const BUTTON = 'Mark field cleared';

    it('offers nothing when the board has no finish action', () => {
      render(<SurveyBoard scans={recent()} url={URL} expiresAt={null} owned />);
      expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    });

    it('offers the owner the button at any point, and runs the action', async () => {
      const onFinish = vi.fn().mockResolvedValue(true);
      render(<SurveyBoard scans={recent()} url={URL} expiresAt={null} owned onFinish={onFinish} />);
      await userEvent.click(screen.getByRole('button', { name: BUTTON }));
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('keeps it from anyone else while the field is well under way', () => {
      render(<SurveyBoard scans={recent()} url={URL} expiresAt={null} onFinish={vi.fn()} />);
      expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    });

    it('offers anyone the button once the Done at time has passed', () => {
      // Scanned long enough ago that the estimate is behind us.
      render(
        <SurveyBoard
          scans={recent(-3 * 60 * 60_000)}
          url={URL}
          expiresAt={null}
          onFinish={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
    });

    it('offers anyone the button at 99% mined', () => {
      const nearly = [
        { at: Date.now() - 10 * 60_000, rocks: parseSurveyScan(FIRST)! },
        { at: Date.now(), rocks: [{ ore: 'Clear Icicle', volume: 1_500 }] },
      ];
      render(<SurveyBoard scans={nearly} url={URL} expiresAt={null} onFinish={vi.fn()} />);
      expect(screen.getByText('99% mined')).toBeTruthy();
      expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
    });

    it('is gone once the field is finished, owner or not', () => {
      const done = [...recent(), { at: Date.now() + 60_000, rocks: [] }];
      render(<SurveyBoard scans={done} url={URL} expiresAt={null} owned onFinish={vi.fn()} />);
      expect(screen.queryByText('Field cleared')).toBeNull();
      expect(screen.getByText('Done at')).toBeTruthy();
      expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    });

    it('says so when the field could not be marked cleared', async () => {
      const onFinish = vi.fn().mockResolvedValue(false);
      render(<SurveyBoard scans={recent()} url={URL} expiresAt={null} owned onFinish={onFinish} />);
      await userEvent.click(screen.getByRole('button', { name: BUTTON }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't mark/);
    });
  });
});

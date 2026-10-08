import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { MAX_LINE_WIDTH } from '@/engine/survey/chatMessage';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { configureClipboard } from '@/lib/clipboard';
import { SurveyBoard } from './SurveyBoard';

// Recharts needs a real layout; the chart has its own concerns.
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

  it('adds a scan pasted into the box without a button press', () => {
    const onAdd = vi.fn(async () => 'ok' as const);
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} onAdd={onAdd} />);
    fireEvent.paste(screen.getByLabelText('Survey scan'), {
      clipboardData: { getData: () => FIRST },
    });
    expect(onAdd).toHaveBeenCalledWith(FIRST);
  });

  it('says so when text typed into the box is not a scan', async () => {
    const onAdd = vi.fn(async () => 'not-a-scan' as const);
    render(<SurveyBoard scans={[]} url={null} expiresAt={null} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Survey scan'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add scan' }));
    expect((await screen.findByRole('alert')).textContent).toContain("isn't a Survey Scanner copy");
  });
});

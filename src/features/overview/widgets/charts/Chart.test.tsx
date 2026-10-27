import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './Chart';
import type { ChartModel } from './types';

const MODELS: Record<string, ChartModel> = {
  area: {
    kind: 'area',
    values: [3, 4, 5, 4],
    low: 'low 3',
    high: 'high 5',
    rangeLabel: '30 days',
    summary: 'Balance rose from 3 to 4.',
  },
  bars: {
    kind: 'bars',
    values: [1, 3, 2],
    max: 'max 3 jobs',
    xStart: 'now',
    xEnd: '+12h',
    note: 'Jobs finishing each hour',
    summary: 'Six jobs finish in the next 12 hours.',
  },
  gains: {
    kind: 'bars',
    values: [200, -50, 0, 300],
    gains: true,
    barLabels: ['+200', '-50', '', '+300'],
    max: 'max 300',
    xStart: '3 weeks ago',
    xEnd: 'this week',
    note: 'Last 21 days',
    summary: 'Net +450.',
    tips: [
      { title: '3 weeks ago', rows: [{ label: 'Net', value: '+200', tone: 'good' }] },
      { title: '2 weeks ago', rows: [{ label: 'Net', value: '-50', tone: 'bad' }] },
      { title: 'Last week', rows: [{ label: 'Net', value: '0' }] },
      { title: 'This week', rows: [{ label: 'Net', value: '+300', tone: 'good' }] },
    ],
  },
  hbars: {
    kind: 'hbars',
    rows: [
      { key: 'a', label: 'Income', share: 1, text: '292M', color: 'iskPos' },
      { key: 'b', label: 'Spending', share: 0.2, text: '60M', color: 'iskNeg' },
    ],
    summary: 'Income 292M against spending 60M.',
  },
  gantt: {
    kind: 'gantt',
    rows: [
      { key: 'a', label: 'Rifter', startMs: 0, endMs: 5, text: 'Ready', color: 'warning' },
      { key: 'b', label: 'Hurricane', startMs: 4, endMs: 40, text: '5h 2m', color: 'accent' },
    ],
    axis: { from: 0, to: 14, now: 7 },
    labels: { from: '7h ago', now: 'Now', to: 'in 7h' },
    note: 'Jobs on a time axis',
    summary: 'Rifter ready; Hurricane 5h 2m left.',
    fallback: {
      kind: 'hbars',
      rows: [{ key: 'a', label: 'Rifter', share: 1, text: 'Ready', color: 'warning' }],
      summary: 'unused',
    },
  },
  donut: {
    kind: 'donut',
    parts: [
      { key: 'ok', label: 'Not undercut', value: 17, color: 'neutral' },
      { key: 'under', label: 'Undercut', value: 21, color: 'warning' },
    ],
    centre: '38',
    centreNote: 'open',
    summary: '21 of 38 open orders are undercut.',
  },
  stack: {
    kind: 'stack',
    parts: [
      { key: 'assets', label: 'Assets', value: 29, text: '29B', color: 's1' },
      { key: 'isk', label: 'Wallet', value: 4, text: '4B', color: 's3' },
    ],
    summary: 'Assets 29B, wallet 4B.',
  },
  stackedArea: {
    kind: 'stackedArea',
    layers: [
      { key: 'assets', values: [29, 30], color: 's1' },
      { key: 'isk', values: [3, 4], color: 's3' },
    ],
    parts: [
      { key: 'assets', label: 'Assets', value: 30, text: '30B', color: 's1' },
      { key: 'isk', label: 'Wallet', value: 4, text: '4B', color: 's3' },
    ],
    max: 'max 34B',
    xStart: '30 days ago',
    xEnd: 'today',
    summary: 'Net worth rose to 34B.',
  },
  stackRows: {
    kind: 'stackRows',
    rows: [
      {
        key: 'jita',
        label: 'Jita IV',
        parts: [
          { key: 'out', value: 1, color: 'warning' },
          { key: 'ok', value: 3, color: 'accent' },
        ],
        text: '1 short',
      },
      {
        key: 'amarr',
        label: 'Amarr',
        parts: [{ key: 'ok', value: 2, color: 'accent' }],
        text: 'OK',
      },
    ],
    legend: [
      { key: 'out', label: 'Out', value: 1, text: '1', color: 'warning' },
      { key: 'ok', label: 'OK', value: 5, text: '5', color: 'accent' },
    ],
    summary: 'Jita IV: 1 out, 3 ok.',
  },
  spark: {
    kind: 'spark',
    rows: [{ key: 'trit', label: 'Tritanium', values: [4, 5, 3], text: '4.18' }],
    summary: 'Tritanium 4.18.',
  },
};

describe('Chart', () => {
  it.each(Object.entries(MODELS))(
    'draws %s aria-hidden with a visually hidden summary',
    (_n, model) => {
      const { container } = render(<Chart model={model} size="M" />);
      const summary = container.querySelector('p.sr-only');
      expect(summary?.textContent).toBe(model.summary);
      // The drawing is the first child and hidden from assistive tech; the text is not.
      expect(container.firstElementChild?.firstElementChild?.getAttribute('aria-hidden')).toBe(
        'true'
      );
      expect(summary?.closest('[aria-hidden="true"]')).toBeNull();
    }
  );

  it('draws a Gantt with its axis labels, a now marker and overflow arrows from Medium up', () => {
    const { container } = render(<Chart model={MODELS.gantt!} size="M" />);
    expect(container.textContent).toContain('7h ago');
    expect(container.textContent).toContain('Now');
    expect(container.textContent).toContain('in 7h');
    expect(container.textContent).toContain('Ready');
    expect(container.querySelector('[data-overflow="end"]')).not.toBeNull();
    expect(container.querySelector('[data-overflow="start"]')).toBeNull();
    expect(container.querySelectorAll('.border-dashed')).toHaveLength(2);
  });

  it('falls back to progress bars at Small, where a Gantt has no width', () => {
    const { container } = render(<Chart model={MODELS.gantt!} size="S" />);
    expect(container.textContent).not.toContain('Now');
    expect(container.textContent).toContain('Rifter');
    expect(container.textContent).toContain('Ready');
  });

  it('shows at most five Gantt rows at Medium', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      key: String(i),
      label: 'Job ' + i,
      startMs: 0,
      endMs: 5,
      text: 'x',
      color: 'accent' as const,
    }));
    const model = { ...(MODELS.gantt as Extract<ChartModel, { kind: 'gantt' }>), rows };
    expect(render(<Chart model={model} size="M" />).container.textContent).not.toContain('Job 5');
    expect(render(<Chart model={model} size="L" />).container.textContent).toContain('Job 7');
  });

  it('prints the figures and labels a legend needs so colour is never the only signal', () => {
    const { container } = render(<Chart model={MODELS.donut!} size="M" />);
    expect(container.textContent).toContain('Not undercut');
    expect(container.textContent).toContain('Undercut');
    expect(container.textContent).toContain('38');
  });

  it('labels the max and the time range on bars, and draws the peak differently', () => {
    const { container } = render(<Chart model={MODELS.bars!} size="L" />);
    expect(container.textContent).toContain('max 3 jobs');
    expect(container.textContent).toContain('now');
    expect(container.textContent).toContain('+12h');
    const bars = [...container.querySelectorAll('i')];
    expect(bars).toHaveLength(3);
    expect(bars[1]!.className).toContain('bg-accent');
    expect(bars[1]!.className).not.toContain('bg-accent/55');
    expect(bars[0]!.className).toContain('bg-accent/55');
    expect(container.textContent).toContain('Jobs finishing each hour');
  });

  it('draws gains green above the axis and losses red below it, each with its figure', () => {
    const { container } = render(<Chart model={MODELS.gains!} size="M" />);
    const bars = [...container.querySelectorAll<HTMLElement>('span > i')];
    expect(bars).toHaveLength(4);
    expect(bars[0]!.style.backgroundColor).toContain('isk-pos');
    expect(bars[1]!.style.backgroundColor).toContain('isk-neg');
    expect(bars[0]!.className).not.toContain('opacity-55');
    for (const figure of ['+200', '-50', '+300']) expect(container.textContent).toContain(figure);
    expect(container.textContent).toContain('3 weeks ago');
    // The labels replace the max line.
    expect(container.textContent).not.toContain('max 300');
  });

  it('reads a bar out on hover and clears when the pointer leaves', () => {
    const { container, getAllByText, queryAllByText } = render(
      <Chart model={MODELS.gains!} size="M" />
    );
    const plot = container.querySelector<HTMLElement>('.touch-pan-y')!;
    plot.getBoundingClientRect = () => ({ left: 0, width: 400 }) as DOMRect;
    expect(queryAllByText('Last week')).toHaveLength(0);
    // Four columns of 100px: x=250 is the third.
    fireEvent.pointerMove(plot, { clientX: 250, pointerType: 'mouse' });
    expect(getAllByText('Last week').length).toBeGreaterThan(0);
    fireEvent.pointerLeave(plot, { pointerType: 'mouse' });
    expect(queryAllByText('Last week')).toHaveLength(0);
  });

  it('draws the height the size asks for', () => {
    const small = render(<Chart model={MODELS.bars!} size="S" />);
    const large = render(<Chart model={MODELS.bars!} size="L" />);
    expect(small.container.querySelector<HTMLElement>('.border-b')?.style.height).toBe('44px');
    expect(large.container.querySelector<HTMLElement>('.border-b')?.style.height).toBe('100px');
  });

  it('draws layers over time at Medium and only the latest day as one bar at Small', () => {
    const medium = render(<Chart model={MODELS.stackedArea!} size="M" />).container;
    expect(medium.querySelectorAll('polygon')).toHaveLength(2);
    expect(medium.textContent).toContain('max 34B');
    expect([...medium.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Assets 30B',
      'Wallet 4B',
    ]);
    const small = render(<Chart model={MODELS.stackedArea!} size="S" />).container;
    expect(small.querySelectorAll('polygon')).toHaveLength(0);
    expect([...small.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Assets 30B',
      'Wallet 4B',
    ]);
  });

  it('splits each row by its own total, leaving a zero part out, with the legend totals below', () => {
    const { container } = render(<Chart model={MODELS.stackRows!} size="M" />);
    const bars = [...container.querySelectorAll<HTMLElement>('span.flex > i')];
    expect(bars.map((bar) => bar.style.width)).toEqual(['25%', '75%', '100%']);
    expect(container.textContent).toContain('1 short');
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Out 1',
      'OK 5',
    ]);
  });

  it('keeps stack segments in legend order', () => {
    const { container } = render(<Chart model={MODELS.stack!} size="M" />);
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['Assets 29B', 'Wallet 4B']);
  });

  it('shows no more hbar rows than the size allows', () => {
    const rows = Array.from({ length: 8 }, (_v, i) => ({
      key: String(i),
      label: `Row ${i}`,
      share: 1 - i / 10,
      text: String(i),
    }));
    const model: ChartModel = { kind: 'hbars', rows, summary: 'x' };
    expect(render(<Chart model={model} size="S" />).container.querySelectorAll('i')).toHaveLength(
      3
    );
    expect(render(<Chart model={model} size="M" />).container.querySelectorAll('i')).toHaveLength(
      6
    );
  });
});

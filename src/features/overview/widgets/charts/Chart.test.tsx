import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './Chart';
import { showsInNumberView } from './sizing';
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
  hbars: {
    kind: 'hbars',
    rows: [
      { key: 'a', label: 'Income', share: 1, text: '292M', color: 'iskPos' },
      { key: 'b', label: 'Spending', share: 0.2, text: '60M', color: 'iskNeg' },
    ],
    summary: 'Income 292M against spending 60M.',
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

  it('draws the height the size asks for', () => {
    const small = render(<Chart model={MODELS.bars!} size="S" />);
    const large = render(<Chart model={MODELS.bars!} size="L" />);
    expect(small.container.querySelector<HTMLElement>('.border-b')?.style.height).toBe('44px');
    expect(large.container.querySelector<HTMLElement>('.border-b')?.style.height).toBe('100px');
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

describe('showsInNumberView', () => {
  it('keeps the donut for the Chart view only', () => {
    expect(showsInNumberView(MODELS.donut!)).toBe(false);
    expect(showsInNumberView(MODELS.bars!)).toBe(true);
    expect(showsInNumberView(MODELS.stack!)).toBe(true);
  });
});

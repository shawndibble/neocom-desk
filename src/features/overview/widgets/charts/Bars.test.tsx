import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './Chart';
import type { BarsChartModel } from './types';

const base: BarsChartModel = {
  kind: 'bars',
  values: [10, -4, 6],
  max: 'max 10',
  xStart: '3 weeks ago',
  xEnd: 'this week',
  note: 'ISK profit per week',
  summary: 'Profit by week: 10, -4, 6.',
};

describe('Bars on a zero axis', () => {
  it('hangs a loss below the axis in the loss colour', () => {
    const { container } = render(<Chart model={base} size="M" />);
    const bars = [...container.querySelectorAll<HTMLElement>('span > i')];
    expect(bars).toHaveLength(3);
    // The loss starts at the floor and is the only bar in the negative hue.
    expect(bars[1]!.style.bottom).toBe('0%');
    expect(bars[1]!.style.backgroundColor).toContain('isk-neg');
    expect(bars[0]!.style.backgroundColor).toContain('accent');
    expect(parseFloat(bars[0]!.style.bottom)).toBeGreaterThan(0);
  });

  it('draws the reference line and labels it beside the max', () => {
    const model: BarsChartModel = { ...base, values: [4, 6, 8], ref: { value: 6, label: 'avg 6' } };
    const { container, getByText } = render(<Chart model={model} size="M" />);
    expect(getByText('avg 6')).toBeTruthy();
    expect(container.querySelector('i.border-dashed')).not.toBeNull();
  });

  it('keeps the plain bars when there is no loss and no reference', () => {
    const { container } = render(<Chart model={{ ...base, values: [1, 2, 3] }} size="M" />);
    expect(container.querySelector('i.border-dashed')).toBeNull();
    expect([...container.querySelectorAll('i')]).toHaveLength(3);
  });
});

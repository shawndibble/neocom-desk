import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './Chart';
import type { LinesChartModel } from './types';

const model: LinesChartModel = {
  kind: 'lines',
  summary: 'Two items over 7 days.',
  series: [
    { key: 'a', label: 'Tritanium', color: 'accent', end: '+8.4%', values: [0, 4, null, 8.4] },
    { key: 'b', label: 'PLEX', color: 's1', end: '-2.1%', values: [0, -1, -3, -2.1] },
  ],
};

describe('Lines chart', () => {
  const lines = (container: HTMLElement) => [...container.querySelectorAll('polyline')];

  it('names every line with where it ends, and keeps the summary for screen readers', () => {
    render(<Chart model={model} size="M" />);
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('+8.4%')).toBeInTheDocument();
    expect(screen.getByText('PLEX')).toBeInTheDocument();
    expect(screen.getByText('Two items over 7 days.')).toBeInTheDocument();
  });

  it('draws several lines thin and undashed, with no low/high row when the model omits it', () => {
    const { container } = render(<Chart model={model} size="M" />);
    expect(lines(container).every((p) => !p.hasAttribute('stroke-dasharray'))).toBe(true);
    expect(lines(container).every((p) => Number(p.getAttribute('stroke-width')) < 1.6)).toBe(true);
    expect(screen.queryByText('-3%')).toBeNull();
    expect(container.querySelector('polygon')).toBeNull();
  });

  it('brings a focused legend entry to full weight and dims the other lines', () => {
    const { container } = render(<Chart model={model} size="M" />);
    const entry = screen.getByText('PLEX').closest('li')!;
    fireEvent.focus(entry);
    const [a, b] = lines(container);
    expect(a!.getAttribute('opacity')).toBe('0.25');
    expect(b!.getAttribute('opacity')).toBe('1');
    expect(Number(b!.getAttribute('stroke-width'))).toBeGreaterThan(
      Number(a!.getAttribute('stroke-width'))
    );
    expect(entry).toHaveAttribute('data-active', 'true');
    fireEvent.blur(entry);
    expect(lines(container).every((p) => p.getAttribute('opacity') === '1')).toBe(true);
  });

  it('highlights on pointer hover too, and the legend is reachable by keyboard', () => {
    const { container } = render(<Chart model={model} size="M" />);
    const entry = screen.getByText('Tritanium').closest('li')!;
    expect(entry).toHaveAttribute('tabindex', '0');
    fireEvent.pointerEnter(entry);
    expect(lines(container)[1]!.getAttribute('opacity')).toBe('0.25');
  });

  it('fills a single line with a gradient and drops the legend and low/high row', () => {
    const single: LinesChartModel = { ...model, series: [model.series[0]!] };
    const { container } = render(<Chart model={single} size="M" />);
    const fill = container.querySelector('polygon')!;
    const id = container.querySelector('linearGradient')!.id;
    expect(fill.getAttribute('fill')).toBe(`url(#${id})`);
    expect(container.querySelector('li')).toBeNull();
    expect(screen.queryByText('+8.4%')).toBeNull();
    expect(screen.getByText('Two items over 7 days.')).toBeInTheDocument();
  });

  it('gives each single-line chart its own gradient id', () => {
    const single: LinesChartModel = { ...model, series: [model.series[0]!] };
    const { container } = render(
      <>
        <Chart model={single} size="M" />
        <Chart model={single} size="M" />
      </>
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});

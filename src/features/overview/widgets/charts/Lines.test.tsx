import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './Chart';
import type { LinesChartModel } from './types';

const model: LinesChartModel = {
  kind: 'lines',
  summary: 'Two items over 7 days.',
  low: '-3%',
  high: '+9%',
  rangeLabel: '7 days',
  series: [
    { key: 'a', label: 'Tritanium', color: 'accent', end: '+8.4%', values: [0, 4, null, 8.4] },
    { key: 'b', label: 'PLEX', color: 's1', end: '-2.1%', values: [0, -1, -3, -2.1] },
  ],
};

describe('Lines chart', () => {
  it('names every line with where it ends, and keeps the summary for screen readers', () => {
    render(<Chart model={model} size="M" />);
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('+8.4%')).toBeInTheDocument();
    expect(screen.getByText('PLEX')).toBeInTheDocument();
    expect(screen.getByText('Two items over 7 days.')).toBeInTheDocument();
    expect(screen.getByText('7 days · +9%')).toBeInTheDocument();
  });

  it('draws a dashed second line so colour is not the only cue', () => {
    const { container } = render(<Chart model={model} size="M" />);
    const dashes = [...container.querySelectorAll('polyline')].map((p) =>
      p.getAttribute('stroke-dasharray')
    );
    expect(dashes).toContain('4 2');
  });
});

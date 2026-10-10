import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { summarizeSurvey, type SurveyScan } from '@/engine/survey/series';
import { SurveyCharts } from './SurveyCharts';

const scan = (at: number, volumes: [string, number][]): SurveyScan => ({
  at,
  rocks: volumes.map(([ore, volume]) => ({ ore, volume })),
});

describe('SurveyCharts text version', () => {
  const summary = summarizeSurvey([
    scan(0, [
      ['Veldspar', 1000],
      ['Scordite', 500],
    ]),
    scan(60_000, [
      ['Veldspar', 800],
      ['Scordite', 400],
    ]),
    scan(120_000, [
      ['Veldspar', 500],
      ['Scordite', 400],
    ]),
  ])!;

  it('gives each chart a table inside its figure, one row per scan or interval', () => {
    render(<SurveyCharts summary={summary} />);
    const volume = screen.getByRole('table', { name: /volume left/i });
    const rate = screen.getByRole('table', { name: /mining rate/i });
    expect(within(volume).getAllByRole('row')).toHaveLength(1 + 3);
    expect(within(rate).getAllByRole('row')).toHaveLength(1 + 2);
    expect(within(volume).getByRole('columnheader', { name: 'Veldspar' })).toBeInTheDocument();
    expect(volume.closest('figure')).not.toBeNull();
    expect(volume.closest('.sr-only')).not.toBeNull();
    expect(rate.closest('figure')).not.toBeNull();
    expect(rate.closest('[role="img"]')).toBeNull();
  });
});

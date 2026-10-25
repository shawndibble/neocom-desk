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

describe('SurveyCharts views', () => {
  const priced = (at: number, rows: [string, number, number | undefined][]): SurveyScan => ({
    at,
    rocks: rows.map(([ore, volume, isk]) => ({ ore, volume, isk })),
  });
  const summary = summarizeSurvey(
    [
      priced(0, [
        ['Veldspar', 1000, 1000],
        ['Scordite', 500, undefined],
      ]),
      priced(60_000, [
        ['Veldspar', 800, 800],
        ['Scordite', 400, undefined],
      ]),
    ],
    new Map([['Veldspar', 1]])
  )!;

  it('depletion view draws a percent table per scan, with an All ore column', () => {
    render(<SurveyCharts summary={summary} view="depletion" />);
    const table = screen.getByRole('table', { name: /ore left by percent/i });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    expect(within(table).getByRole('columnheader', { name: 'All ore' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Scordite' })).toBeInTheDocument();
    expect(table.closest('figure')).not.toBeNull();
  });

  it('isk view tabulates priced ores only', () => {
    render(<SurveyCharts summary={summary} view="isk" />);
    const table = screen.getByRole('table', { name: /isk left/i });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    expect(within(table).getByRole('columnheader', { name: 'Veldspar' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Scordite' })).toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'ISK mined' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /mining rate/i })).toBeNull();
  });

  it('default view keeps the Ore left tables', () => {
    render(<SurveyCharts summary={summary} />);
    expect(screen.getByRole('table', { name: /volume left/i })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /isk left/i })).toBeNull();
  });
});

describe('SurveyCharts pace panel', () => {
  const summary = summarizeSurvey([
    scan(0, [
      ['Veldspar', 1000],
      ['Scordite', 500],
    ]),
    scan(60_000, [
      ['Veldspar', 700],
      ['Scordite', 440],
    ]),
  ])!;

  it('Ore left ends with the Total pace chart and no toggle', () => {
    render(<SurveyCharts summary={summary} />);
    expect(screen.getByRole('table', { name: /^mining rate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /mining rate by ore/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'By ore' })).toBeNull();
  });

  it('Depletion ends with the by-ore pace chart and table, no toggle', () => {
    render(<SurveyCharts summary={summary} view="depletion" />);
    expect(screen.getByRole('table', { name: /ore left by percent/i })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /mining rate by ore/i });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 1);
    expect(within(table).getByRole('columnheader', { name: 'Veldspar' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '5 m³/s' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /^mining rate$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'By ore' })).toBeNull();
  });

  it('draws no pace panel with a single scan', () => {
    const one = summarizeSurvey([scan(0, [['Veldspar', 1000]])])!;
    render(<SurveyCharts summary={one} view="depletion" />);
    expect(screen.queryByRole('table', { name: /mining rate/i })).toBeNull();
  });
});

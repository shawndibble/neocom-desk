import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@/i18n';
import type { SurveySummary } from '@/engine/survey/series';
import { SurveyLegend } from './SurveyLegend';

afterEach(cleanup);

const summary = { oreNames: ['Veldspar', 'Scordite'] } as SurveySummary;

describe('SurveyLegend', () => {
  it('lists each ore and the mining rate by default', () => {
    render(<SurveyLegend summary={summary} />);
    expect(screen.getByText('Veldspar')).toBeInTheDocument();
    expect(screen.getByText('Mining rate')).toBeInTheDocument();
  });

  it('drops the mining rate swatch when showRate is false', () => {
    render(<SurveyLegend summary={summary} showRate={false} />);
    expect(screen.getByText('Scordite')).toBeInTheDocument();
    expect(screen.queryByText('Mining rate')).toBeNull();
  });
});

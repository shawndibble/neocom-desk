import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { paceShareSeries } from '@/engine/survey/chartViews';
import { summarizeSurvey } from '@/engine/survey/series';
import { PaceTipBody } from './SurveyViewCharts';

describe('PaceTipBody', () => {
  const at = (m: number, rocks: [string, number][]) => ({
    at: Date.UTC(2026, 9, 8, 16, 40) + m * 60_000,
    rocks: rocks.map(([ore, volume]) => ({ ore, volume })),
  });
  const summary = summarizeSurvey([
    at(0, [
      ['Veldspar', 1000],
      ['Scordite', 500],
      ['Omber', 100],
    ]),
    // Veldspar 10% of its start, Scordite 40%, Omber idle.
    at(5, [
      ['Veldspar', 900],
      ['Scordite', 300],
      ['Omber', 100],
    ]),
  ])!;

  it('ranks mined ores by share, largest first, and leaves idle ores out', () => {
    const pace = paceShareSeries(summary);
    render(
      <PaceTipBody
        interval={pace.intervals[0]}
        activeOres={pace.activeOres}
        toneIndex={pace.toneIndex}
      />
    );
    expect(screen.getByText(/5 min|between scans/i)).toBeInTheDocument();
    expect(screen.getByText(/of the field mined this scan/i)).toBeInTheDocument();
    const rows = screen.getAllByText(/^[0-9.<]+% of [A-Z]/).map((n) => n.textContent);
    expect(rows).toEqual(['40% of Scordite', '10% of Veldspar']);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.queryByText(/Omber/)).toBeNull();
  });
});

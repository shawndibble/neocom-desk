import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { BuildResult } from '@/engine/industry/types';
import { ResultsSummary } from './ResultsSummary';

const RESULT: BuildResult = {
  materials: [],
  seconds: 3600,
  jobFee: { eiv: 1000, grossCost: 50, sccSurcharge: 10, facilityTax: 5, total: 65 },
  materialCost: 500,
  totalCost: 565,
  buyCost: 1000,
  revenue: 1000,
  salesTax: 10,
  brokerFee: 5,
  profit: 435,
  marginPct: 77,
  iskPerHour: 435,
  unpricedMaterials: [],
  unpriceable: false,
  recommendation: 'build',
};

function renderSummary(overrides: Partial<Parameters<typeof ResultsSummary>[0]> = {}) {
  return render(
    <ResultsSummary
      result={RESULT}
      pricesReady={true}
      systemCostIndex={0.023}
      productName="Rifter"
      productUnitPrice={100000}
      costIndexSystemName="Jita"
      {...overrides}
    />
  );
}

describe('ResultsSummary: jargon tooltips (UX-REVIEW #8)', () => {
  it('gives EIV and SCC surcharge chips an accessible tooltip', () => {
    renderSummary();
    const eivButton = screen.getByRole('button', { name: /about eiv/i });
    const eivTooltipId = eivButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(eivTooltipId)?.textContent).not.toBe('');

    const sccButton = screen.getByRole('button', { name: /about scc surcharge/i });
    const sccTooltipId = sccButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(sccTooltipId)?.textContent).not.toBe('');
  });

  it('gives the ISK/hour chip an accessible tooltip explaining its basis (UX-REVIEW #13)', () => {
    renderSummary();
    const iskPerHourButton = screen.getByRole('button', { name: /about isk\/hour/i });
    const tooltipId = iskPerHourButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(tooltipId)?.textContent).not.toBe('');
  });

  it('makes the cost-index system explicit in its label, distinct per trade hub', () => {
    renderSummary({ costIndexSystemName: 'Jita' });
    expect(screen.getByText('Cost index (Jita)')).toBeInTheDocument();

    renderSummary({ costIndexSystemName: 'Amarr' });
    expect(screen.getByText('Cost index (Amarr)')).toBeInTheDocument();
  });
});

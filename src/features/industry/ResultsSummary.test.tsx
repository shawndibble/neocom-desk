import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('gives EIV and SCC surcharge rows an accessible tooltip once Job Fee is expanded', async () => {
    renderSummary();
    await userEvent.click(screen.getByRole('button', { name: /job fee/i }));

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

describe('ResultsSummary: Costs stack (#116)', () => {
  it('renders Material Cost, Job Fee, Total Cost, Time, and Cost Index as a stacked list', () => {
    renderSummary();

    expect(screen.getByText('Material cost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /job fee/i })).toBeInTheDocument();
    expect(screen.getByText('Total cost')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Cost index (Jita)')).toBeInTheDocument();

    // No more flat StatChip wrap for costs: values render as text within stacked row containers.
    const totalCostRow = screen.getByText('Total cost').closest('div')!;
    expect(totalCostRow).toHaveTextContent('565');
  });

  it('renders costs in stack order: Material Cost, Job Fee, Total Cost, Time, Cost Index', () => {
    const { container } = renderSummary();
    const text = container.textContent ?? '';
    const materialIdx = text.indexOf('Material cost');
    const jobFeeIdx = text.indexOf('Job fee');
    const totalIdx = text.indexOf('Total cost');
    const timeIdx = text.indexOf('Time');
    const costIndexIdx = text.indexOf('Cost index');

    expect(materialIdx).toBeGreaterThanOrEqual(0);
    expect(materialIdx).toBeLessThan(jobFeeIdx);
    expect(jobFeeIdx).toBeLessThan(totalIdx);
    expect(totalIdx).toBeLessThan(timeIdx);
    expect(timeIdx).toBeLessThan(costIndexIdx);
  });

  it('keeps the Job Fee row collapsed by default, hiding its breakdown', () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /job fee/i });
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('EIV')).not.toBeInTheDocument();
    expect(screen.queryByText('Cost index fee')).not.toBeInTheDocument();
    expect(screen.queryByText('SCC surcharge')).not.toBeInTheDocument();
    expect(screen.queryByText('Facility tax')).not.toBeInTheDocument();
  });

  it('expands the Job Fee row on click to reveal EIV, Cost Index Fee, SCC Surcharge, and Facility Tax', async () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /job fee/i });

    await userEvent.click(jobFeeButton);

    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByText('EIV').closest('div')).toHaveTextContent('1,000');
    expect(screen.getByText('Cost index fee').closest('div')).toHaveTextContent('50');
    expect(screen.getByText('SCC surcharge').closest('div')).toHaveTextContent('10');
    expect(screen.getByText('Facility tax').closest('div')).toHaveTextContent('5');
  });

  it('collapses the Job Fee row again when re-activated', async () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /job fee/i });

    await userEvent.click(jobFeeButton);
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(jobFeeButton);
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('EIV')).not.toBeInTheDocument();
  });

  it('is keyboard-operable: Enter and Space toggle the Job Fee row', async () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /job fee/i });
    jobFeeButton.focus();

    await userEvent.keyboard('{Enter}');
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard(' ');
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves the Revenue and Verdict rows unchanged from current behavior', () => {
    renderSummary();
    expect(screen.getByText('Product sell price')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toBeInTheDocument();
    expect(screen.getByText('BUILD saves 435 ISK')).toBeInTheDocument();
  });
});

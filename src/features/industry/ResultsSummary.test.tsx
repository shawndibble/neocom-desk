import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
  netRevenue: 985,
  profit: 435,
  marginPct: 77,
  iskPerHour: 435,
  grossProfit: 460,
  grossMargin: 82,
  grossIskPerHour: 460,
  breakEvenPrice: 92.5,
  unpricedMaterials: [],
  unpriceable: false,
  recommendation: 'build',
};

function renderSummary(overrides: Partial<Parameters<typeof ResultsSummary>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/industry']}>
      <Routes>
        <Route
          path="/industry"
          element={
            <ResultsSummary
              result={RESULT}
              pricesReady={true}
              pricesLoading={false}
              systemCostIndex={0.023}
              productName="Rifter"
              productTypeID={587}
              productUnitPrice={100000}
              productQuantity={10}
              costIndexSystemName="Jita"
              {...overrides}
            />
          }
        />
        <Route path="/market" element={<p>Market Browser</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ResultsSummary: jargon tooltips (UX-REVIEW #8)', () => {
  it('gives EIV and SCC surcharge rows an accessible tooltip once Job Fee is expanded', async () => {
    renderSummary();
    await userEvent.click(screen.getByRole('button', { name: /job fee/i }));

    const eivButton = screen.getByRole('button', { name: /about eiv/i });
    fireEvent.focus(eivButton);
    const eivTooltipId = eivButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(eivTooltipId)?.textContent).not.toBe('');

    const sccButton = screen.getByRole('button', { name: /about scc surcharge/i });
    fireEvent.focus(sccButton);
    const sccTooltipId = sccButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(sccTooltipId)?.textContent).not.toBe('');
  });

  it('gives the ISK/hour chip an accessible tooltip explaining its basis (UX-REVIEW #13)', () => {
    renderSummary();
    const iskPerHourButton = screen.getByRole('button', { name: /about isk\/hour/i });
    fireEvent.focus(iskPerHourButton);
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

  it('leaves the Profit and Verdict rows unchanged from current behavior', () => {
    renderSummary();
    expect(screen.getByText('Profit')).toBeInTheDocument();
    expect(screen.getByText('BUILD saves 435 ISK')).toBeInTheDocument();
  });
});

describe('ResultsSummary: split Acquisition Verdict / Sale Profitability, break-even price (#119)', () => {
  it('labels the Acquisition Verdict and Sale Profitability statements separately', () => {
    renderSummary();
    expect(screen.getByText('Acquisition Verdict')).toBeInTheDocument();
    expect(screen.getByText('Sale Profitability')).toBeInTheDocument();
  });

  it('states Sale Profitability from the net profit by default, distinct from the Acquisition Verdict', () => {
    renderSummary();
    expect(screen.getByText('BUILD saves 435 ISK')).toBeInTheDocument();
    expect(screen.getByText('Selling profits 435 ISK')).toBeInTheDocument();
  });

  it('flips Sale Profitability to a loss statement when the toggled figure is negative, independent of the Acquisition Verdict', async () => {
    renderSummary({
      result: { ...RESULT, profit: -50, grossProfit: 460 },
    });
    expect(screen.getByText('BUILD saves 435 ISK')).toBeInTheDocument();
    expect(screen.getByText('Selling loses 50 ISK')).toBeInTheDocument();
  });

  it('tracks Sale Profitability to the Gross/Net toggle', async () => {
    renderSummary({
      result: { ...RESULT, profit: -50, grossProfit: 460 },
    });
    expect(screen.getByText('Selling loses 50 ISK')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gross' }));
    expect(screen.getByText('Selling profits 460 ISK')).toBeInTheDocument();
  });

  it('shows a net break-even price next to Sale Profitability, unaffected by the Gross/Net toggle', async () => {
    renderSummary();
    expect(screen.getByText('Break-even price').closest('div')).toHaveTextContent('93');

    await userEvent.click(screen.getByRole('button', { name: 'Gross' }));
    expect(screen.getByText('Break-even price').closest('div')).toHaveTextContent('93');
  });

  it('shows the current market price alongside break-even price for comparison', () => {
    renderSummary({ productUnitPrice: 100_000 });
    expect(screen.getByText('Current market price').closest('div')).toHaveTextContent('100,000');
  });

  it('shows Sale Profitability and Acquisition Verdict unknown states independently when unpriced', () => {
    renderSummary({
      result: {
        ...RESULT,
        buyCost: null,
        revenue: null,
        salesTax: null,
        brokerFee: null,
        netRevenue: null,
        profit: null,
        marginPct: null,
        iskPerHour: null,
        grossProfit: null,
        grossMargin: null,
        grossIskPerHour: null,
        breakEvenPrice: null,
        unpriceable: true,
        recommendation: 'unknown',
      },
      productUnitPrice: null,
    });

    expect(
      screen.getByText('Not enough price data for a build-vs-buy verdict.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Not enough price data to judge sale profitability.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Break-even price')).not.toBeInTheDocument();
  });
});

describe('ResultsSummary: Revenue block (#117)', () => {
  it('renders the product line as name, qty produced, unit price, and line total', () => {
    renderSummary();

    expect(screen.getByText('Rifter')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // also appears in the break-even section's "Current market price" comparison row
    expect(screen.getAllByText('100,000').length).toBeGreaterThan(0);
    // line total = revenue (1000), not unitPrice x qty (1_000_000) — pulled from the engine, not recomputed
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  it('shows Sales Tax and Broker Fee as negative deductions, then an emphasized Net Revenue total', () => {
    renderSummary();

    const salesTaxRow = screen.getByText('Sales tax').closest('div')!;
    expect(salesTaxRow).toHaveTextContent('-10');
    expect(salesTaxRow.querySelector('.text-isk-neg')).not.toBeNull();

    const brokerFeeRow = screen.getByText('Broker fee').closest('div')!;
    expect(brokerFeeRow).toHaveTextContent('-5');
    expect(brokerFeeRow.querySelector('.text-isk-neg')).not.toBeNull();

    const netRevenueRow = screen.getByText('Net revenue').closest('div')!;
    expect(netRevenueRow).toHaveTextContent('985');
  });

  it('orders Revenue rows: product line, Sales Tax, Broker Fee, Net Revenue', () => {
    const { container } = renderSummary();
    const text = container.textContent ?? '';
    const productIdx = text.indexOf('Rifter');
    const salesTaxIdx = text.indexOf('Sales tax');
    const brokerFeeIdx = text.indexOf('Broker fee');
    const netRevenueIdx = text.indexOf('Net revenue');

    expect(productIdx).toBeGreaterThanOrEqual(0);
    expect(productIdx).toBeLessThan(salesTaxIdx);
    expect(salesTaxIdx).toBeLessThan(brokerFeeIdx);
    expect(brokerFeeIdx).toBeLessThan(netRevenueIdx);
  });

  it('removes the old Product sell price / Sell value chips', () => {
    renderSummary();
    expect(screen.queryByText('Product sell price')).not.toBeInTheDocument();
    expect(screen.queryByText('Sell value')).not.toBeInTheDocument();
  });

  it('hides the Revenue block entirely when the product is unpriced, rather than showing fabricated numbers', () => {
    renderSummary({
      result: {
        ...RESULT,
        buyCost: null,
        revenue: null,
        salesTax: null,
        brokerFee: null,
        netRevenue: null,
        profit: null,
        marginPct: null,
        iskPerHour: null,
        grossProfit: null,
        grossMargin: null,
        grossIskPerHour: null,
        breakEvenPrice: 90,
        unpriceable: true,
        recommendation: 'unknown',
      },
      productUnitPrice: null,
    });

    expect(screen.queryByText('Sales tax')).not.toBeInTheDocument();
    expect(screen.queryByText('Broker fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Net revenue')).not.toBeInTheDocument();
  });
});

describe('ResultsSummary: Gross/Net profit toggle (#118)', () => {
  it('defaults to Net, showing the net profit/margin/ISK-per-hour figures', () => {
    renderSummary();

    const netButton = screen.getByRole('button', { name: 'Net' });
    const grossButton = screen.getByRole('button', { name: 'Gross' });
    expect(netButton).toHaveAttribute('aria-pressed', 'true');
    expect(grossButton).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByText('Profit').closest('div')).toHaveTextContent('435');
    expect(screen.getByText('Margin').closest('div')).toHaveTextContent('77');
    expect(screen.getByText('ISK/hour').closest('div')).toHaveTextContent('435');
  });

  it('switches to gross figures when Gross is clicked, keeping Sales Tax/Broker Fee rows visible', async () => {
    renderSummary();

    await userEvent.click(screen.getByRole('button', { name: 'Gross' }));

    expect(screen.getByRole('button', { name: 'Gross' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Net' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Profit').closest('div')).toHaveTextContent('460');
    expect(screen.getByText('Margin').closest('div')).toHaveTextContent('82');
    expect(screen.getByText('ISK/hour').closest('div')).toHaveTextContent('460');

    // Toggling never hides the fee rows from the Revenue block (#117).
    expect(screen.getByText('Sales tax')).toBeInTheDocument();
    expect(screen.getByText('Broker fee')).toBeInTheDocument();
  });
});

describe('ResultsSummary: fetching vs. unavailable prices (#409)', () => {
  it('shows a distinct fetching state while pricesLoading, not the unavailable warning', () => {
    renderSummary({ pricesReady: false, pricesLoading: true });
    expect(screen.getByRole('status', { name: 'Fetching prices…' })).toBeInTheDocument();
    expect(screen.queryByText('Price data unavailable')).not.toBeInTheDocument();
  });

  it('shows the unavailable warning once loading has finished and prices are genuinely missing', () => {
    renderSummary({ pricesReady: false, pricesLoading: false });
    expect(screen.getByText('Price data unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Fetching prices…')).not.toBeInTheDocument();
  });
});

describe('ResultsSummary: unpriced-product Market link (#409)', () => {
  it('links the unpriced-product warning to Market for that product', async () => {
    renderSummary({
      result: { ...RESULT, buyCost: null, unpriceable: true, unpricedMaterials: [] },
      productTypeID: 587,
    });
    await userEvent.click(screen.getByRole('button', { name: /Rifter has no hub sell price/ }));
    expect(screen.getByText('Market Browser')).toBeInTheDocument();
  });

  it('renders the unpriced-product warning as plain text when there is no productTypeID', () => {
    renderSummary({
      result: { ...RESULT, buyCost: null, unpriceable: true, unpricedMaterials: [] },
      productTypeID: null,
    });
    expect(
      screen.queryByRole('button', { name: /Rifter has no hub sell price/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Rifter has no hub sell price/)).toBeInTheDocument();
  });
});

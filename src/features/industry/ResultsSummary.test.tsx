import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@/i18n';
import type { BuildResult } from '@/engine/industry/types';
import { ResultsSummary } from './ResultsSummary';
import type { BreakdownContext } from './CalculationBreakdown';
import { ownedStockSale } from '@/engine/industry/ownedStockSale';
import type { MaterialCostLine } from '@/engine/industry/types';

/** One material the plan needs 100 of and the player already holds all 100 of. */
const OWNED_MATERIALS: MaterialCostLine[] = [
  {
    typeID: 34,
    baseQuantity: 100,
    quantity: 100,
    ownedQuantity: 100,
    remainingQuantity: 0,
    unitPrice: 1_000,
    lineCost: 0,
    unpriced: false,
  },
];

const OWNED_SALE = {
  instant: ownedStockSale(OWNED_MATERIALS, { 34: 1_000 }, 'instant', {}),
  order: ownedStockSale(OWNED_MATERIALS, { 34: 1_200 }, 'order', {}),
};

const BREAKDOWN: BreakdownContext = {
  hubName: 'Jita',
  materialPriceBasis: 'sell',
  me: 10,
  isReaction: false,
  accountingLevel: 0,
  brokerRelationsLevel: 0,
  systemCostIndex: 0.023,
  costIndexSystemName: 'Jita',
  productName: 'Rifter',
  productQuantity: 10,
  productUnitPrice: 100000,
};

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
              breakdown={BREAKDOWN}
              ownedSale={null}
              nameFor={(typeID) => (typeID === 34 ? 'Tritanium' : `Type ${typeID}`)}
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

describe('ResultsSummary: calculation breakdown', () => {
  it('opens a modal from the results and explains where material and product prices come from', async () => {
    renderSummary();
    await userEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/lowest sell order/i)).toBeTruthy();
    expect(within(dialog).getByText(/Ore, ice and gas are priced the same way/i)).toBeTruthy();
    expect(within(dialog).getByText(/Units marked as owned cost 0 ISK/i)).toBeTruthy();
    expect(within(dialog).getByText(/Rifter is always valued at Jita's lowest sell/i)).toBeTruthy();
  });

  it("names the buy-order basis when that is the plan's basis", async () => {
    renderSummary({ breakdown: { ...BREAKDOWN, materialPriceBasis: 'buy' } });
    await userEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/highest buy order/i)).toBeTruthy();
    // The product never follows the materials onto the buy side.
    expect(within(dialog).getByText(/Rifter is always valued at Jita's lowest sell/i)).toBeTruthy();
  });

  it("quotes the plan's own figures rather than a generic formula", async () => {
    renderSummary();
    await userEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));

    const dialog = screen.getByRole('dialog');
    // Total cost = materials 500 + job fee 65.
    expect(within(dialog).getByText(/Total cost = materials .*500.*65.*565/)).toBeTruthy();
    // Break-even at 0/0 skills: 7.5% sales tax + 3% broker fee = 10.5% of the listing price.
    expect(within(dialog).getByText(/10\.5%/)).toBeTruthy();
    // Revenue: 10 units at the product's own hub sell price.
    expect(within(dialog).getByText(/10 units × .*100,000/)).toBeTruthy();
    // Break-even divides the same total cost across those units.
    expect(within(dialog).getByText(/Total cost .*565.* ÷ \(10 units/)).toBeTruthy();
  });

  it('explains the use-or-sell comparison and its two selling bases', async () => {
    renderSummary();
    await userEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Sell now fills the standing buy orders/i)).toBeTruthy();
    expect(within(dialog).getByText(/no order on the chosen side gets no verdict/i)).toBeTruthy();
  });

  it('drops the material-efficiency wording for a reaction, which has none', async () => {
    renderSummary({ breakdown: { ...BREAKDOWN, isReaction: true } });
    await userEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/no material efficiency/i)).toBeTruthy();
    expect(within(dialog).queryByText(/after ME 10/i)).toBeNull();
  });
});

describe('ResultsSummary: use or sell the owned materials', () => {
  it('stays hidden when the player owns none of the materials', () => {
    renderSummary();
    expect(screen.queryByText(/use or sell your materials/i)).toBeNull();
  });

  it('compares selling the owned stock against building with it, and switches basis', async () => {
    renderSummary({ ownedSale: OWNED_SALE });

    expect(screen.getByText(/use or sell your materials/i)).toBeTruthy();
    // Sell now: 100 x 1,000 gross, less 7.5% sales tax, no broker fee.
    // Shown twice: the totals row and the collapsed per-material disclosure.
    expect(screen.getAllByText('92,500').length).toBeGreaterThan(0);
    // The stock is worth far more than the 435 ISK the build nets.
    expect(screen.getByText(/SELL — selling your materials beats building/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /sell order/i }));
    // Sell order: 100 x 1,200 gross, less 7.5% sales tax and 3% broker fee.
    expect(screen.getAllByText('107,400').length).toBeGreaterThan(0);
  });

  it('breaks the sale down per material behind a disclosure', async () => {
    renderSummary({ ownedSale: OWNED_SALE });
    await userEvent.click(screen.getByRole('button', { name: /per material/i }));

    expect(screen.getByRole('cell', { name: 'Tritanium' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '100' })).toBeTruthy();
  });

  it('calls it for building when the build out-earns the stock', () => {
    renderSummary({
      ownedSale: OWNED_SALE,
      result: { ...RESULT, profit: 500_000 },
    });

    expect(screen.getByText(/BUILD — using your materials beats selling them/i)).toBeTruthy();
  });

  it('gives no verdict when an owned material has no price on the chosen side', () => {
    const unpriced = {
      instant: ownedStockSale(OWNED_MATERIALS, {}, 'instant', {}),
      order: ownedStockSale(OWNED_MATERIALS, {}, 'order', {}),
    };
    renderSummary({ ownedSale: unpriced });

    expect(screen.getByText(/not enough price data to compare/i)).toBeTruthy();
  });
});

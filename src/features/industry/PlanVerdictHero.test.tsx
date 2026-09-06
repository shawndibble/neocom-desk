import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BuildResult } from '@/engine/industry/types';
import { PlanVerdictHero } from './PlanVerdictHero';
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

type HeroOverrides = Partial<
  Omit<Parameters<typeof PlanVerdictHero>[0], 'breakdownOpen' | 'onBreakdownOpenChange'>
>;

/** Owns `breakdownOpen` so the "How is this calculated?" button really opens the modal. */
function Harness(overrides: HeroOverrides = {}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  return (
    <PlanVerdictHero
      result={RESULT}
      pricesReady={true}
      pricesLoading={false}
      productName="Rifter"
      runs={10}
      ownedSale={null}
      breakdown={BREAKDOWN}
      onLogProduction={vi.fn()}
      {...overrides}
      breakdownOpen={breakdownOpen}
      onBreakdownOpenChange={setBreakdownOpen}
    />
  );
}

function renderHero(overrides: HeroOverrides = {}) {
  return render(<Harness {...overrides} />);
}

describe('PlanVerdictHero: verdict labels and prose', () => {
  it('labels the Acquisition Verdict and Sale Profitability statements separately', () => {
    renderHero();
    expect(screen.getByText('Acquisition Verdict')).toBeInTheDocument();
    expect(screen.getByText('Sale Profitability')).toBeInTheDocument();
  });

  it('states Sale Profitability as the one large figure, distinct from the Acquisition Verdict', () => {
    renderHero();
    expect(screen.getByText('BUILD saves 435 ISK')).toBeInTheDocument();
    // The figure is the statement; no pill restates it.
    expect(screen.getByText('Sale Profitability').parentElement).toHaveTextContent('435 ISK');
    expect(screen.queryByText(/Selling profits/)).not.toBeInTheDocument();
  });

  it('keeps the figure signed when profit is negative, independent of the Acquisition Verdict', () => {
    renderHero({ result: { ...RESULT, profit: -50, grossProfit: 460 } });
    expect(screen.getByText('BUILD saves 435 ISK')).toBeInTheDocument();
    expect(screen.getByText('Sale Profitability').parentElement).toHaveTextContent('-50 ISK');
  });

  it('shows Sale Profitability and Acquisition Verdict unknown states independently when unpriced', () => {
    renderHero({
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
      pricesReady: true,
    });

    expect(
      screen.getByText('Not enough price data for a build-vs-buy verdict.')
    ).toBeInTheDocument();
    // The figure has nothing to state, so the qualifier line says so instead.
    expect(screen.getByText('No price data yet')).toBeInTheDocument();
    expect(screen.queryByText(/sale profitability\./)).not.toBeInTheDocument();
  });
});

describe('PlanVerdictHero: the big profit figure and qualifier line', () => {
  it('shows net profit as the big figure', () => {
    renderHero();
    expect(screen.getByText('435 ISK')).toBeInTheDocument();
  });

  it('states the margin in the qualifier line', () => {
    renderHero();
    expect(screen.getByText(/77\.0% margin/)).toBeInTheDocument();
  });
});

describe('PlanVerdictHero: use-or-sell pill', () => {
  it('appears only when owned units are held', () => {
    renderHero();
    expect(screen.queryByText(/use or sell your materials/i)).not.toBeInTheDocument();

    renderHero({ ownedSale: OWNED_SALE });
    expect(screen.getByText('Use or sell your materials?')).toBeInTheDocument();
  });
});

describe('PlanVerdictHero: Log Production', () => {
  it('calls onLogProduction when clicked', async () => {
    const onLogProduction = vi.fn();
    renderHero({ onLogProduction });
    await userEvent.click(screen.getByRole('button', { name: 'Log Production' }));
    expect(onLogProduction).toHaveBeenCalledTimes(1);
  });
});

describe('PlanVerdictHero: calculation breakdown', () => {
  it('opens a modal from the results and explains where material and product prices come from', async () => {
    renderHero();
    await userEvent.click(screen.getByRole('button', { name: 'Calculations?' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/lowest sell order/i)).toBeTruthy();
    expect(within(dialog).getByText(/Ore, ice and gas are priced the same way/i)).toBeTruthy();
    expect(within(dialog).getByText(/Units marked as owned cost 0 ISK/i)).toBeTruthy();
    expect(within(dialog).getByText(/Rifter is always valued at Jita's lowest sell/i)).toBeTruthy();
  });

  it("names the buy-order basis when that is the plan's basis", async () => {
    renderHero({ breakdown: { ...BREAKDOWN, materialPriceBasis: 'buy' } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculations?' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/highest buy order/i)).toBeTruthy();
    // The product never follows the materials onto the buy side.
    expect(within(dialog).getByText(/Rifter is always valued at Jita's lowest sell/i)).toBeTruthy();
  });

  it("quotes the plan's own figures rather than a generic formula", async () => {
    renderHero();
    await userEvent.click(screen.getByRole('button', { name: 'Calculations?' }));

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
    renderHero();
    await userEvent.click(screen.getByRole('button', { name: 'Calculations?' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Sell now fills the standing buy orders/i)).toBeTruthy();
    expect(within(dialog).getByText(/no order on the chosen side gets no verdict/i)).toBeTruthy();
  });

  it('drops the material-efficiency wording for a reaction, which has none', async () => {
    renderHero({ breakdown: { ...BREAKDOWN, isReaction: true } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculations?' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/no material efficiency/i)).toBeTruthy();
    expect(within(dialog).queryByText(/after ME 10/i)).toBeNull();
  });
});

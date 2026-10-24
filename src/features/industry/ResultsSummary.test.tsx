import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@/i18n';
import type { BuildResult } from '@/engine/industry/types';
import { ResultsSummary } from './ResultsSummary';
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
              productUnitPrice={100}
              productQuantity={10}
              costIndexSystemName="Jita"
              ownedSale={null}
              saleBasis="instant"
              onSaleBasisChange={() => {}}
              profitBasis={null}
              profit={RESULT.profit}
              totalVolume={{ volume: 1234.5, anyUnknown: false }}
              hubName="Jita"
              {...overrides}
            />
          }
        />
        <Route path="/market/browser" element={<p>Market Browser</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ResultsSummary: jargon tooltips (UX-REVIEW #8)', () => {
  it('gives EIV and SCC surcharge rows an accessible tooltip once Job Fee is expanded', async () => {
    renderSummary();
    await userEvent.click(screen.getByRole('button', { name: /^total job cost/i }));

    const eivButton = screen.getByRole('button', { name: /about eiv/i });
    fireEvent.focus(eivButton);
    const eivTooltipId = eivButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(eivTooltipId)?.textContent).not.toBe('');

    const sccButton = screen.getByRole('button', { name: /about scc surcharge/i });
    fireEvent.focus(sccButton);
    const sccTooltipId = sccButton.getAttribute('aria-describedby')!;
    expect(document.getElementById(sccTooltipId)?.textContent).not.toBe('');
  });

  it('bounds the Job Fee rounding drift by EIV x half the last cost-index digit ESI keeps', () => {
    renderSummary({ result: { ...RESULT, jobFee: { ...RESULT.jobFee, eiv: 3_737_181 } } });
    const jobFeeButton = screen.getByRole('button', { name: /about total job cost/i });
    fireEvent.focus(jobFeeButton);
    const tooltipId = jobFeeButton.getAttribute('aria-describedby')!;
    // 3,737,181 x 0.00005 = 186.86 -> 187
    expect(document.getElementById(tooltipId)?.textContent).toContain('±187 ISK');
  });
});

describe('ResultsSummary: the ledger', () => {
  it('reads from the sale down to the profit', () => {
    renderSummary();
    const labels = [
      'Rifter sale',
      'Sales tax',
      'Broker fee',
      'Material cost',
      'Total job cost',
      'Profit',
    ].map((label) => screen.getByText(label));
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1].compareDocumentPosition(labels[i])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    }
    expect(screen.getByText('10 × 100')).toBeInTheDocument();
    expect(screen.getByText('Profit').closest('div')?.parentElement).toHaveTextContent('435');
  });

  it('states ISK to spend, the price of buying instead, job time and volume', () => {
    renderSummary();
    expect(screen.getByText('ISK to spend').nextElementSibling).toHaveTextContent('565');
    expect(screen.getByText('Buying Rifter instead').nextElementSibling).toHaveTextContent(
      '+435 more'
    );
    expect(screen.getByText('Main job time').nextElementSibling).toHaveTextContent('1h');
  });

  it("says where the product is priced, and the whole plan's time when it differs", () => {
    renderSummary({ planSeconds: 7200 });
    expect(screen.getByText('Rifter priced at').nextElementSibling).toHaveTextContent(
      'Jita lowest sell'
    );
    expect(screen.getByText('Whole plan, on free slots').nextElementSibling).toHaveTextContent(
      '2h'
    );
  });

  it('has no Net/Gross toggle and no repeated margin or break-even rows', () => {
    renderSummary();
    expect(screen.queryByRole('button', { name: 'Gross' })).not.toBeInTheDocument();
    expect(screen.queryByText('Margin')).not.toBeInTheDocument();
    expect(screen.queryByText(/break-even/i)).not.toBeInTheDocument();
  });

  it('shows the cheaper-system note under the job cost whether or not the breakdown is open', () => {
    renderSummary({ cheaperNearby: 'Sarum Prime (2 jumps) is 4.10%: about 4 ISK less.' });
    expect(screen.getByRole('button', { name: /^total job cost/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByText(/Sarum Prime/)).toBeInTheDocument();
  });
});

describe('ResultsSummary: job cost breakdown (#116)', () => {
  it('keeps the Job Fee row collapsed by default, hiding its breakdown', () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /^total job cost/i });
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('EIV')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cost index · Jita/)).not.toBeInTheDocument();
    expect(screen.queryByText('SCC surcharge')).not.toBeInTheDocument();
    expect(screen.queryByText('Facility tax')).not.toBeInTheDocument();
  });

  it('expands the Job Fee row on click to reveal EIV, Cost Index Fee, SCC Surcharge, and Facility Tax', async () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /^total job cost/i });

    await userEvent.click(jobFeeButton);

    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByText('EIV').closest('div')).toHaveTextContent('1,000');
    expect(screen.getByText(/Cost index · Jita/).closest('div')).toHaveTextContent('50');
    expect(screen.getByText('SCC surcharge').closest('div')).toHaveTextContent('10');
    expect(screen.getByText('Facility tax').closest('div')).toHaveTextContent('5');
  });

  it('collapses the Job Fee row again when re-activated', async () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /^total job cost/i });

    await userEvent.click(jobFeeButton);
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(jobFeeButton);
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('EIV')).not.toBeInTheDocument();
  });

  it('is keyboard-operable: Enter and Space toggle the Job Fee row', async () => {
    renderSummary();
    const jobFeeButton = screen.getByRole('button', { name: /^total job cost/i });
    jobFeeButton.focus();

    await userEvent.keyboard('{Enter}');
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard(' ');
    expect(jobFeeButton).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ResultsSummary: owned materials', () => {
  it('says nothing about selling when nothing is owned', () => {
    renderSummary();
    expect(screen.queryByText('Your materials sell via')).not.toBeInTheDocument();
    expect(screen.queryByText('Your materials')).not.toBeInTheDocument();
  });

  it('charges the forgone sale as a line on the sell-value basis', () => {
    renderSummary({ ownedSale: OWNED_SALE, profitBasis: 'sellValue', profit: 435 - 92_500 });
    // Sell now: 100 x 1,000 gross, less 7.5% sales tax, no broker fee.
    expect(screen.getByText('Your materials').closest('div')?.parentElement).toHaveTextContent(
      '-92,500'
    );
  });

  it('leaves the forgone sale out when owned materials count as free', () => {
    renderSummary({ ownedSale: OWNED_SALE, profitBasis: 'free' });
    expect(screen.queryByText('Your materials')).not.toBeInTheDocument();
  });

  it('flips how the materials would be sold in place', async () => {
    const changes: string[] = [];
    renderSummary({ ownedSale: OWNED_SALE, onSaleBasisChange: (basis) => changes.push(basis) });
    await userEvent.click(screen.getByRole('button', { name: 'Sell now' }));
    expect(changes).toEqual(['order']);
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

describe('ResultsSummary: unreachable price source (offline)', () => {
  it('says prices are unavailable offline, not "try again shortly"', () => {
    renderSummary({ pricesReady: false, pricesLoading: false, pricesUnreachable: true });
    expect(screen.getByText('Prices unavailable right now')).toBeInTheDocument();
    expect(screen.getByText(/Recipes, materials and times are still shown/)).toBeInTheDocument();
    expect(screen.queryByText(/Try again shortly/)).not.toBeInTheDocument();
    expect(screen.queryByText('Price data unavailable')).not.toBeInTheDocument();
  });
});

describe('ResultsSummary: unpriced-product Market link (#409)', () => {
  it('links the unpriced-product warning to Market for that product', async () => {
    renderSummary({
      result: { ...RESULT, buyCost: null, unpriceable: true, unpricedMaterials: [] },
      productTypeID: 587,
    });
    const link = screen.getByRole('link', { name: /Rifter has no hub sell price/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/market/browser'));
    await userEvent.click(link);
    expect(screen.getByText('Market Browser')).toBeInTheDocument();
  });

  it('renders the unpriced-product warning as plain text when there is no productTypeID', () => {
    renderSummary({
      result: { ...RESULT, buyCost: null, unpriceable: true, unpricedMaterials: [] },
      productTypeID: null,
    });
    expect(
      screen.queryByRole('link', { name: /Rifter has no hub sell price/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Rifter has no hub sell price/)).toBeInTheDocument();
  });
});

describe('ResultsSummary: total volume (issue #874)', () => {
  it('shows the total volume alongside the total cost', () => {
    renderSummary({ totalVolume: { volume: 1234.5, anyUnknown: false } });

    expect(screen.getByText('1,234.5 m³')).toBeInTheDocument();
  });

  it('flags the total when a material’s volume could not be resolved, rather than hiding the gap', () => {
    renderSummary({ totalVolume: { volume: 10, anyUnknown: true } });

    expect(screen.getByText(/at least/i)).toBeInTheDocument();
  });
});

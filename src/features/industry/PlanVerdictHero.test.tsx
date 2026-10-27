import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { BuildResult } from '@/engine/industry/types';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { PlanVerdictHero } from './PlanVerdictHero';
import { profitOnBasis } from '@/engine/industry/profitBasis';
import type { BreakdownContext } from './CalculationBreakdown';
import { ItemContextMenu, ItemMoreActions } from '@/features/market/ItemContextMenu';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';

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

/** The plan's own figures (owned materials free), as the page computes them. */
function figuresFor(result: BuildResult, unitPrice: number | null = 100) {
  return profitOnBasis('free', {
    result,
    ownedSellNet: null,
    productQuantity: 10,
    productUnitPrice: unitPrice,
    accountingLevel: 0,
    brokerRelationsLevel: 0,
  });
}

type HeroOverrides = Partial<
  Omit<Parameters<typeof PlanVerdictHero>[0], 'breakdownOpen' | 'onBreakdownOpenChange'>
>;

/**
 * Owns `breakdownOpen`. The hero has no trigger of its own any more — the
 * Costs & Revenue panel's header carries the only one, beside the figures the
 * breakdown explains — so `openBreakdown` starts it open, which is the state
 * that panel's button puts the hero in.
 */
function Harness({
  openBreakdown = false,
  ...overrides
}: HeroOverrides & { openBreakdown?: boolean } = {}) {
  const [breakdownOpen, setBreakdownOpen] = useState(openBreakdown);
  const result = overrides.result ?? RESULT;
  return (
    <PlanVerdictHero
      result={result}
      figures={figuresFor(result)}
      basis={null}
      pricesReady={true}
      pricesLoading={false}
      productName="Rifter"
      breakdown={BREAKDOWN}
      onLogProduction={vi.fn()}
      {...overrides}
      breakdownOpen={breakdownOpen}
      onBreakdownOpenChange={setBreakdownOpen}
    />
  );
}

function renderHero(overrides: HeroOverrides & { openBreakdown?: boolean } = {}) {
  return render(<Harness {...overrides} />);
}

function renderHeroWithRouter(overrides: HeroOverrides & { openBreakdown?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <Harness {...overrides} />
    </MemoryRouter>
  );
}

function itemMenuFor(typeId: number, trigger: React.ReactElement) {
  return (
    <FakeItemActions>
      <ItemContextMenu typeId={typeId} itemName="Rifter" blueprintTypeID={null}>
        {trigger}
      </ItemContextMenu>
    </FakeItemActions>
  );
}

function itemActionsFor(typeId: number) {
  return (
    <FakeItemActions>
      <ItemMoreActions typeId={typeId} itemName="Rifter" blueprintTypeID={null} />
    </FakeItemActions>
  );
}

describe('PlanVerdictHero: one verdict, one figure', () => {
  it('states the verdict as a labelled pill and the profit as the one large figure', () => {
    renderHero();
    expect(screen.getByText('Verdict')).toHaveClass('sr-only');
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toHaveClass('sr-only');
    // Shorthand on the face, the exact figure in the accessible name.
    expect(screen.getByText('435 ISK', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('calls a profit with little room under the market price a close call', () => {
    renderHero({ figures: { ...figuresFor(RESULT), verdict: 'closeCall', headroomPct: 2.5 } });
    expect(screen.getByText('Build — close call')).toBeInTheDocument();
    expect(screen.getByText('2.5% under market')).toHaveClass('text-warning');
  });

  it('keeps the figure signed and says it loses money when profit is negative', () => {
    renderHero({ result: { ...RESULT, profit: -50 } });
    expect(screen.getByText('Loses money')).toBeInTheDocument();
    expect(screen.getByText('Profit').parentElement).toHaveTextContent('-50 ISK');
  });

  it('has no verdict and says so when unpriced', () => {
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
    });
    expect(screen.queryByText('Verdict')).not.toBeInTheDocument();
    expect(screen.getByText('No price data yet')).toBeInTheDocument();
  });

  it('states margin, ISK/hour and break-even beside the figure', () => {
    renderHero();
    expect(screen.getByText('Margin').nextElementSibling).toHaveTextContent('77.0%');
    expect(screen.getByText('ISK/hour')).toBeInTheDocument();
    expect(screen.getByText('Break-even')).toBeInTheDocument();
    expect(screen.getByText('7.5% under market')).toBeInTheDocument();
  });
});

describe('PlanVerdictHero: how owned materials are counted', () => {
  it('says to sell the materials only when the build pays with them counted free', () => {
    const loss = { ...figuresFor(RESULT), profit: -100, verdict: 'loss' as const };
    const { unmount } = renderHero({ basis: 'sellValue', figures: loss });
    expect(screen.getByText('Sell your materials instead')).toBeInTheDocument();
    unmount();
    renderHero({ basis: 'sellValue', figures: loss, result: { ...RESULT, profit: -50 } });
    expect(screen.getByText('Loses money')).toBeInTheDocument();
  });

  it('opens the calculation breakdown from the break-even ⓘ', async () => {
    renderHero();
    await userEvent.click(screen.getByRole('button', { name: 'About Break-even' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('says only "profit after fees" when the plan uses no owned materials', () => {
    renderHero();
    expect(screen.getByText('profit after fees')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sell value' })).not.toBeInTheDocument();
  });

  it('names the comparison and flips the basis in place', async () => {
    const onBasisChange = vi.fn();
    renderHero({ basis: 'sellValue', onBasisChange });
    expect(
      screen.getByText(/compared with selling your materials, counted at/)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'sell value' }));
    expect(onBasisChange).toHaveBeenCalledWith('free');
  });

  it('flips back from free', async () => {
    const onBasisChange = vi.fn();
    renderHero({ basis: 'free', onBasisChange });
    await userEvent.click(screen.getByRole('button', { name: 'free' }));
    expect(onBasisChange).toHaveBeenCalledWith('sellValue');
  });
});

describe('PlanVerdictHero: unreachable price source', () => {
  it('says prices are unavailable instead of "No price data yet"', () => {
    renderHero({ pricesReady: false, pricesUnreachable: true });
    expect(screen.getByText('Prices unavailable right now')).toBeInTheDocument();
    expect(screen.queryByText('No price data yet')).not.toBeInTheDocument();
  });
});

describe('PlanVerdictHero: runs and setup', () => {
  it('renders the runs control in the title row and the setup strip as its footer', () => {
    renderHero({ runsControl: <input aria-label="Runs" />, footer: <span>Setup line</span> });
    expect(screen.getByRole('textbox', { name: 'Runs' })).toBeInTheDocument();
    expect(screen.getByText('Setup line')).toBeInTheDocument();
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
    renderHero({ openBreakdown: true });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Materials: Jita lowest sell/i)).toBeTruthy();
    expect(within(dialog).getByText(/Ore, ice and gas: priced as themselves/i)).toBeTruthy();
    expect(within(dialog).getByText(/Owned units: 0 ISK/i)).toBeTruthy();
    expect(within(dialog).getByText(/Rifter: always Jita lowest sell/i)).toBeTruthy();
  });

  it('lists the order book levels each Depth Price walked, and keeps the product on lowest sell (issue #3993)', () => {
    const walk = {
      best: 4,
      avg: 4.5,
      need: 300,
      filled: 300,
      listed: 1000,
      covered: true,
      levels: [
        { price: 4, units: 150, listed: 150 },
        { price: 5, units: 150, listed: 850 },
      ],
    };
    renderHero({
      breakdown: { ...BREAKDOWN, depthRows: [{ typeID: 34, name: 'Tritanium', walk }] },
      openBreakdown: true,
    });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Order book depth')).toBeTruthy();
    expect(within(dialog).getByText(/Tritanium needs at least 1% .* Jita/)).toBeTruthy();
    expect(
      within(dialog).getByText(/Rifter's own sale price is still the lowest sell/)
    ).toBeTruthy();
    expect(within(dialog).getByText('Tritanium: 300 needed · 4.50 avg')).toBeTruthy();
    expect(within(dialog).getByText('4.00 ISK × 150')).toBeTruthy();
    expect(within(dialog).getByText('5.00 ISK × 150 (of 850 listed)')).toBeTruthy();
  });

  it('has no order book section when nothing walked the book', () => {
    renderHero({ openBreakdown: true });
    expect(within(screen.getByRole('dialog')).queryByText('Order book depth')).toBeNull();
  });

  it("names the buy-order basis when that is the plan's basis", async () => {
    renderHero({ breakdown: { ...BREAKDOWN, materialPriceBasis: 'buy' }, openBreakdown: true });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Materials: Jita highest buy/i)).toBeTruthy();
    // The product never follows the materials onto the buy side.
    expect(within(dialog).getByText(/Rifter: always Jita lowest sell/i)).toBeTruthy();
  });

  it("quotes the plan's own figures rather than a generic formula", async () => {
    renderHero({ openBreakdown: true });

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
    renderHero({ openBreakdown: true });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Sell now: fills standing buy orders/i)).toBeTruthy();
    expect(within(dialog).getByText(/No order on the chosen side means no verdict/i)).toBeTruthy();
  });

  it('drops the material-efficiency wording for a reaction, which has none', async () => {
    renderHero({ breakdown: { ...BREAKDOWN, isReaction: true }, openBreakdown: true });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Reactions have no ME/i)).toBeTruthy();
    expect(within(dialog).queryByText(/after ME 10/i)).toBeNull();
  });
});

describe('PlanVerdictHero: heading actions button (issue #1498)', () => {
  it('renders a focusable "More actions" button beside Log production, not the heading', () => {
    renderHeroWithRouter({ productTypeID: 587, itemActionsFor });
    const button = screen.getByRole('button', { name: 'More actions for Rifter' });
    const heading = screen.getByRole('heading', { name: 'Rifter' });
    expect(heading.parentElement).not.toContainElement(button);
    expect(button.parentElement).toContainElement(
      screen.getByRole('button', { name: /log production/i })
    );
  });

  it('opens the identical item menu the heading’s right-click path opens', async () => {
    const user = userEvent.setup();
    renderHeroWithRouter({ productTypeID: 587, itemMenuFor, itemActionsFor });

    fireEvent.contextMenu(screen.getByRole('heading', { name: 'Rifter' }));
    const contextMenuItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .sort();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'More actions for Rifter' }));
    const buttonMenuItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .sort();

    expect(buttonMenuItems).toEqual(contextMenuItems);
  });

  it('renders nothing without a productTypeID', () => {
    renderHeroWithRouter({ itemActionsFor });
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});

describe('PlanVerdictHero: top-level skill-gate marker (issue #1231)', () => {
  const GATED: SkillGateVerdict = {
    gated: true,
    shortfall: [{ typeID: 3380, haveLevel: 2, needLevel: 5 }],
    bestCharacterId: 7,
  };
  const nameForSkill = () => 'Industry';
  const nameForCharacter = (id: number) => (id === 7 ? 'Vex Kado' : `#${id}`);

  it("marks the plan's own product when no account character can build it", () => {
    renderHero({ skillGate: GATED, nameForSkill, nameForCharacter });
    expect(screen.getByText('Industry V')).toBeInTheDocument();
  });

  it('shows no marker for a not-gated verdict', () => {
    renderHero({ skillGate: { gated: false }, nameForSkill, nameForCharacter });
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows no marker when the caller passed no skill-gate data', () => {
    renderHero();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('PlanVerdictHero reaction location warning (issue #2908)', () => {
  const block = (fix: { systemName: string; onApply: () => void } | null, onChoose = vi.fn()) => ({
    facilityName: 'Athanor',
    systemName: 'Jita',
    fix,
    onChoose,
  });

  it('replaces BUILD with the warning, strikes the profit, keeps Log production enabled', () => {
    renderHero({ locationBlock: block(null) });
    expect(screen.getByText("Can't run as planned")).toBeInTheDocument();
    expect(screen.queryByText('Build')).toBeNull();
    expect(screen.getByRole('button', { name: /log production/i })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(/highsec/);
  });

  it('offers the nearest-lowsec move and a way to choose a location', async () => {
    const onApply = vi.fn();
    const onChoose = vi.fn();
    renderHero({ locationBlock: block({ systemName: 'Tama', onApply }, onChoose) });
    await userEvent.click(screen.getByRole('button', { name: 'Move reactions to Tama (lowsec)' }));
    expect(onApply).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Choose location' }));
    expect(onChoose).toHaveBeenCalled();
  });

  it('omits the move button when no lowsec system is known', () => {
    renderHero({ locationBlock: block(null) });
    expect(screen.queryByRole('button', { name: /^Move reactions/ })).toBeNull();
  });

  it('looks as it always did without a block', () => {
    renderHero();
    expect(screen.queryByText("Can't run as planned")).toBeNull();
  });
});

describe('PlanVerdictHero 90-day median note', () => {
  it('adds an amber note under the figure when the sell price is 20% or more above its median', () => {
    renderHero({ vs90dPct: 35.2 });
    expect(screen.getByText('Sell price is 35% above its 90-day median')).toHaveClass(
      'text-warning'
    );
  });

  it('says nothing below the threshold or when the median is unknown', () => {
    const { unmount } = renderHero({ vs90dPct: 12 });
    expect(screen.queryByText(/90-day median/)).not.toBeInTheDocument();
    unmount();
    renderHero({ vs90dPct: null });
    expect(screen.queryByText(/90-day median/)).not.toBeInTheDocument();
  });
});

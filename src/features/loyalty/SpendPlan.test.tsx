import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { SpendPlanResult, SpendStop } from '@/engine/loyalty/spendPlan';
import type { LoyaltyOfferRow } from './offerRows';
import { SpendLpButton, SpendPlanPanel } from './SpendPlan';
import type { SpendPlanView } from './useSpendPlan';

const hookbill = { itemName: 'Caldari Navy Hookbill' } as unknown as LoyaltyOfferRow;

function view(over: Partial<SpendPlanResult>, walletBalance: number | null = 1e9): SpendPlanView {
  const stop: SpendStop = { reason: 'lpExhausted', offerId: 1, iskPerLp: 900, floor: null };
  return {
    result: {
      rows: [
        {
          offerId: 1,
          redemptions: 3,
          lpSpent: 300,
          iskCost: 0,
          turnInsCost: 0,
          turnIns: [],
          revenue: 300_000,
          salesTax: 0,
          income: 300_000,
          profit: 300_000,
        },
      ],
      totals: {
        lpSpent: 300,
        iskCost: 0,
        turnInsCost: 0,
        purchases: 0,
        revenue: 300_000,
        salesTax: 0,
        income: 300_000,
        profit: 300_000,
      },
      lpLeft: 50,
      iskPerLp: 1_000,
      stop,
      unpriced: [],
      ...over,
    },
    rowsById: new Map([[1, hookbill]]),
    walletBalance,
    candidates: 1,
    ownedPlacements: new Map(),
    locationNames: new Map(),
  };
}

function renderPlan(data: SpendPlanView, onSelectOffer = vi.fn()) {
  render(
    <SpendPlanPanel
      plan={{ status: 'ready', data, retry: () => {} }}
      playerLp={350}
      onSelectOffer={onSelectOffer}
      onClose={() => {}}
    />
  );
}

describe('SpendLpButton', () => {
  it.each([null, 0])('is disabled with a reason at %s LP, and never runs', (playerLp) => {
    const onClick = vi.fn();
    render(<SpendLpButton playerLp={playerLp} rankable loading={false} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Spend my LP' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([
    ['signedOut', /log in with EVE/i],
    ['noScope', /loyalty points/i],
  ] as const)(
    'names why the LP is unknown when %s, not "isn\u2019t known yet"',
    async (lpAccess, reason) => {
      render(
        <SpendLpButton
          playerLp={null}
          lpAccess={lpAccess}
          rankable
          loading={false}
          onClick={vi.fn()}
        />
      );
      const button = screen.getByRole('button', { name: 'Spend my LP' });
      fireEvent.pointerMove(button);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
      expect(screen.getByRole('tooltip')).not.toHaveTextContent(/isn't known yet/);
    }
  );

  it('is disabled while no offer in view has a Sell now price', () => {
    const onClick = vi.fn();
    render(<SpendLpButton playerLp={400} rankable={false} loading={false} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Spend my LP' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('runs with LP to spend', () => {
    const onClick = vi.fn();
    render(<SpendLpButton playerLp={400} rankable loading={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spend my 400 LP' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('SpendPlanPanel', () => {
  it('says where the owned turn-ins it used sit', () => {
    const owned = view({});
    const row = owned.result.rows[0]!;
    row.turnIns = [
      { typeId: 34, owned: 5, bought: 0 },
      { typeId: 35, owned: 10, bought: 0 },
    ];
    const placement = (locationId: number, quantity: number) => ({
      characterId: 1,
      locationId,
      locationType: 'station' as const,
      quantity,
    });
    renderPlan({
      ...owned,
      ownedPlacements: new Map([
        [34, [placement(60003760, 4), placement(60008494, 1)]],
        [35, [placement(60008494, 10)]],
      ]),
      locationNames: new Map([
        [60003760, 'Jita IV - Moon 4'],
        [60008494, 'Amarr VIII'],
      ]),
    });
    expect(screen.getByText('15 owned, in Amarr VIII and 1 more')).toBeInTheDocument();
  });

  it('states LP left, and opens the offer from its row', () => {
    const onSelectOffer = vi.fn();
    renderPlan(view({}), onSelectOffer);
    expect(
      screen.getByText(/the 50 LP left isn't enough for the next offer, Caldari Navy Hookbill/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('cell', { name: 'Caldari Navy Hookbill' }));
    expect(onSelectOffer).toHaveBeenCalledWith(hookbill);
  });

  it.each([
    ['yours', /under your LP value of 1,650/],
    ['market', /under this store's market rate of 1,650/],
  ] as const)('names the %s floor and the offer it stopped at', (source, text) => {
    renderPlan(
      view({
        stop: { reason: 'belowFloor', offerId: 1, iskPerLp: 1420, floor: { rate: 1650, source } },
      })
    );
    expect(screen.getByText(text)).toHaveTextContent('Caldari Navy Hookbill at 1,420 ISK/LP');
  });

  it('names 70% of the best as the floor with no rate', () => {
    renderPlan(
      view({
        stop: {
          reason: 'belowFloor',
          offerId: 1,
          iskPerLp: 1300,
          floor: { rate: 1435, source: 'best', best: 2050 },
        },
      })
    );
    expect(screen.getByText(/under 70% of the best, 2,050/)).toBeInTheDocument();
  });

  it('says the wallet stopped it, and says when the wallet is unknown', () => {
    renderPlan(
      view({ stop: { reason: 'wallet', offerId: 1, iskPerLp: 900, floor: null } }, 12_400_000)
    );
    expect(
      screen.getByText(
        /no offer left fits your wallet \(12.4M\); the best was Caldari Navy Hookbill/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/wallet balance isn't known/)).toBeNull();
  });

  it('says purchases are not capped when the wallet is unknown', () => {
    renderPlan(view({}, null));
    expect(screen.getByText(/wallet balance isn't known/)).toBeInTheDocument();
  });

  it('shows the empty state when nothing is profitable', () => {
    renderPlan(
      view({
        rows: [],
        stop: { reason: 'nothingProfitable', offerId: 1, iskPerLp: -5, floor: null },
      })
    );
    expect(
      screen.getByText('Nothing in this store earns ISK on instant sell right now.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the next offer, Caldari Navy Hookbill, would lose ISK/)
    ).toBeInTheDocument();
  });

  it('reads a stop before the first step as no plan, not as nothing profitable', () => {
    renderPlan(
      view({
        rows: [],
        stop: { reason: 'wallet', offerId: 1, iskPerLp: 900, floor: null },
      })
    );
    expect(screen.getByText('No redemption to plan right now.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing in this store earns ISK/)).toBeNull();
  });

  it('blames the view, not the order books, when no offer reached the plan', () => {
    renderPlan({
      ...view({
        rows: [],
        stop: { reason: 'nothingProfitable', offerId: null, iskPerLp: null, floor: null },
      }),
      candidates: 0,
    });
    expect(screen.getByText('No redemption to plan right now.')).toBeInTheDocument();
    expect(screen.getByText(/Clear the filters or search/)).toBeInTheDocument();
    expect(screen.queryByText(/none of these offers have a market price/)).toBeNull();
  });

  it('lists the turn-ins to buy and the owned ones used', () => {
    const row = {
      itemName: 'Caldari Navy Hookbill',
      requiredItems: [{ typeId: 34, name: 'Caldari Navy Tag', quantity: 2, unitPrice: 1 }],
    } as unknown as LoyaltyOfferRow;
    const data = view({});
    data.result.rows[0]!.turnIns = [{ typeId: 34, owned: 1, bought: 5 }];
    data.result.rows[0]!.turnInsCost = 5_000;
    renderPlan({ ...data, rowsById: new Map([[1, row]]) });
    expect(screen.getByText('5× Caldari Navy Tag')).toBeInTheDocument();
    expect(screen.getByText('1 owned')).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { SpendPlanResult, SpendStop } from '@/engine/loyalty/spendPlan';
import type { LoyaltyOfferRow } from './offerRows';
import { SpendLpButton, SpendPlanPanel } from './SpendPlan';
import type { SpendPlanView } from './useSpendPlan';

const hookbill = { itemName: 'Caldari Navy Hookbill' } as unknown as LoyaltyOfferRow;

function view(over: Partial<SpendPlanResult>, walletBalance: number | null = 1e9): SpendPlanView {
  const stop: SpendStop = { reason: 'lpExhausted', offerId: null, iskPerLp: null, floor: null };
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
    render(<SpendLpButton playerLp={playerLp} loading={false} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Spend my LP' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('runs with LP to spend', () => {
    const onClick = vi.fn();
    render(<SpendLpButton playerLp={400} loading={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spend my LP' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('SpendPlanPanel', () => {
  it('states LP left, and opens the offer from its row', () => {
    const onSelectOffer = vi.fn();
    renderPlan(view({}), onSelectOffer);
    expect(screen.getByText(/the 50 LP left buys none of these offers/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Caldari Navy Hookbill'));
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
          floor: { rate: 1435, source: 'best' },
        },
      })
    );
    expect(screen.getByText(/under 70% of the best, 2,050/)).toBeInTheDocument();
  });

  it('says the wallet stopped it, and says when the wallet is unknown', () => {
    renderPlan(
      view({ stop: { reason: 'wallet', offerId: 1, iskPerLp: 900, floor: null } }, 12_400_000)
    );
    expect(screen.getByText(/needs more ISK than your wallet holds \(12.4M\)/)).toBeInTheDocument();
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
    expect(screen.getByText(/Caldari Navy Hookbill, would lose ISK/)).toBeInTheDocument();
  });
});

import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwedBalances } from './OwedBalances';
import type { PayeeBalance } from './balances';

const balance = (id: string, owed: number) =>
  ({
    payee: { id, name: `Payee ${id}` },
    owed,
    members: owed > 0 ? [{ assignment: { date: '2026-10-01' } }] : [],
  }) as unknown as PayeeBalance;

function renderBalances(
  balances: PayeeBalance[],
  props: Partial<ComponentProps<typeof OwedBalances>> = {}
) {
  return render(
    <OwedBalances
      balances={balances}
      unassigned={{ entryCount: 0, estimatedValue: 0 }}
      unlinkedPaymentCount={0}
      isSoleFilter={() => false}
      onFilterPayee={vi.fn()}
      onSettleUp={vi.fn()}
      onLinkPayment={vi.fn()}
      onAssignNext={vi.fn()}
      onReviewPayments={vi.fn()}
      {...props}
    />
  );
}

describe('OwedBalances summary line', () => {
  it('is hidden when exactly one Payee is owed — the card says it all', () => {
    renderBalances([balance('a', 1_000_000)]);
    expect(screen.queryByText(/across/i)).not.toBeInTheDocument();
    expect(screen.queryByText('You owe')).not.toBeInTheDocument();
  });

  it('reads "You owe" in sentence case with the total and payee count for two or more', () => {
    renderBalances([balance('a', 1_000_000), balance('b', 2_000_000)]);
    const label = screen.getByText('You owe');
    expect(label.className).not.toMatch(/uppercase/);
    expect(screen.getByText('across 2 payees')).toBeInTheDocument();
    expect(screen.getByText(/3,000,000 ISK/)).toBeInTheDocument();
  });

  it('says nothing is outstanding when no Payee is owed', () => {
    renderBalances([balance('a', 0)]);
    expect(screen.getByText('You owe')).toBeInTheDocument();
    expect(screen.getByText('Nothing outstanding')).toBeInTheDocument();
  });
});

describe('OwedBalances prompts (#3120)', () => {
  const tileGrid = (container: HTMLElement) => container.querySelector('.grid');

  it('draws Unassigned as a slim row, not a grid tile, when nothing is owed', async () => {
    const onAssignNext = vi.fn();
    const { container } = renderBalances([balance('a', 0)], {
      unassigned: { entryCount: 3, estimatedValue: 2_500_000 },
      onAssignNext,
    });
    expect(tileGrid(container)).toBeNull();
    expect(screen.getByText('3 entries have no Payee yet')).toBeInTheDocument();
    expect(screen.getByText(/2,500,000/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Assign next/ }));
    expect(onAssignNext).toHaveBeenCalledOnce();
  });

  it('omits the value on the row when the estimate is zero', () => {
    renderBalances([], { unassigned: { entryCount: 1, estimatedValue: 0 } });
    expect(screen.queryByText(/ISK/)).not.toBeInTheDocument();
  });

  it('draws Payments to link as a slim row when nothing is owed', async () => {
    const onReviewPayments = vi.fn();
    const { container } = renderBalances([], { unlinkedPaymentCount: 2, onReviewPayments });
    expect(tileGrid(container)).toBeNull();
    const region = screen.getByRole('region');
    await userEvent.click(within(region).getAllByRole('button')[0]);
    expect(onReviewPayments).toHaveBeenCalledOnce();
  });

  it('keeps the tile layout beside an owed Payee', () => {
    const { container } = renderBalances([balance('a', 1_000_000)], {
      unassigned: { entryCount: 3, estimatedValue: 0 },
    });
    const grid = tileGrid(container);
    expect(grid).not.toBeNull();
    expect(within(grid as HTMLElement).getByRole('button', { name: /Assign next/ })).toBeVisible();
  });
});

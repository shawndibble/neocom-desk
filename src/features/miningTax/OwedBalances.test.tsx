import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwedBalances } from './OwedBalances';
import type { PayeeBalance } from './balances';

const balance = (id: string, owed: number, credit = 0) =>
  ({
    payee: { id, name: `Payee ${id}` },
    owed,
    credit,
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

  it('reads "You owe" in sentence case with the total and Payee count for two or more', () => {
    renderBalances([balance('a', 1_000_000), balance('b', 2_000_000)]);
    const label = screen.getByText('You owe');
    expect(label.className).not.toMatch(/uppercase/);
    expect(screen.getByText('across 2 Payees')).toBeInTheDocument();
    expect(screen.getByText(/3,000,000 ISK/)).toBeInTheDocument();
  });

  it('prints no line when no Payee is owed', () => {
    renderBalances([balance('a', 0)]);
    expect(screen.queryByText('You owe')).not.toBeInTheDocument();
    expect(screen.queryByText('No moon mining tax outstanding')).not.toBeInTheDocument();
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

describe('OwedBalances Conflicts line', () => {
  it('shows what Conflicts will bill in place of "nothing outstanding", and opens the first', async () => {
    const onReviewConflicts = vi.fn();
    renderBalances([balance('a', 0)], {
      conflicts: {
        days: 1,
        waiting: 0,
        amount: 4_271_257,
        first: {} as never,
        firstCorpName: 'Bureau of Unified Harvesting',
        firstResolvesOn: '2026-11-12',
        closed: 0,
      },
      onReviewConflicts,
    });
    expect(screen.queryByText('No moon mining tax outstanding')).not.toBeInTheDocument();
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
    expect(screen.getByText('4,271,257')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Not owed yet. Bureau of Unified Harvesting's book bills it on its date unless an officer changes the book."
      )
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReviewConflicts).toHaveBeenCalledOnce();
  });

  it('says a paid day differs from the book and opens it to fix', async () => {
    const onReviewConflicts = vi.fn();
    renderBalances([balance('a', 0)], {
      conflicts: {
        days: 1,
        waiting: 0,
        amount: 400,
        first: {} as never,
        firstCorpName: 'Brass',
        firstResolvesOn: '',
        closed: 1,
      },
      onReviewConflicts,
    });
    expect(
      screen.getByText(/Your records differ from Brass's book on a day money already reached/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Not owed yet/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReviewConflicts).toHaveBeenCalledOnce();
  });

  it('counts several Conflict days, after the owed cards', () => {
    renderBalances([balance('a', 1_000_000)], {
      conflicts: {
        days: 3,
        waiting: 0,
        amount: 900_000,
        first: {} as never,
        firstCorpName: 'Brass',
        firstResolvesOn: '2026-11-12',
        closed: 0,
      },
    });
    expect(
      screen.getByText(
        '3 days, not owed yet. Each is billed on its date unless an officer changes the book.'
      )
    ).toBeInTheDocument();
    const card = screen.getByText('Payee a');
    const conflicts = screen.getByText('Conflicts');
    expect(card.compareDocumentPosition(conflicts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('OwedBalances uncredited donation', () => {
  it("names the uncredited ISK on the Payee's card and drops Settle up from primary", () => {
    renderBalances([balance('corp', 29_980_000)], {
      uncreditedOf: (b) =>
        b.payee.id === 'corp' ? { amount: 8_000_000, accounts: 'Master Wallet' } : undefined,
    });
    expect(
      screen.getByText(
        /8,000,000 ISK you donated isn't credited yet — check the wallet division \(Master Wallet\)/
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settle up' }).className).not.toMatch(/bg-accent/);
  });

  it('asks for a sync instead of a division check when the book reads every division', () => {
    renderBalances([balance('corp', 29_980_000)], {
      uncreditedOf: () => ({ amount: 8_000_000, accounts: 'Master Wallet', everyDivision: true }),
    });
    expect(
      screen.getByText(/8,000,000 ISK you donated isn't credited yet — Resolve it above/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/check the wallet division/)).not.toBeInTheDocument();
  });

  it('keeps Settle up primary with no note when everything is credited', () => {
    renderBalances([balance('corp', 29_980_000)], {
      uncreditedOf: () => ({ amount: 0, accounts: 'Master Wallet' }),
    });
    expect(screen.queryByText(/isn't credited/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settle up' }).className).toMatch(/bg-accent/);
  });
});

describe('OwedBalances with payments still to link', () => {
  const unlinkedOf = () => ({ count: 1, amount: 4_000_000 });

  it('puts "Payments to link" ahead of the owed cards, so it is dealt with first', () => {
    const { container } = renderBalances([balance('a', 9_000_000)], {
      unlinkedPaymentCount: 1,
      unlinkedOf,
    });
    const titles = [...(container.querySelector('.grid')?.children ?? [])].map(
      (tile) => tile.textContent ?? ''
    );
    expect(titles[0]).toContain('Payments to link');
    expect(titles[1]).toContain('Payee a');
  });

  it('warns on the card and steps Settle up down, so the owed figure is not paid twice', () => {
    renderBalances([balance('a', 9_000_000)], { unlinkedPaymentCount: 1, unlinkedOf });
    expect(screen.getByText(/4,000,000 ISK you already sent isn't linked yet/)).toBeInTheDocument();
    const settle = screen.getByRole('button', { name: 'Settle up' });
    expect(settle.className).toMatch(/bg-transparent/);
    expect(settle.className).not.toMatch(/bg-accent/);
  });

  it('leaves Settle up primary when every payment is accounted for', () => {
    renderBalances([balance('a', 9_000_000)]);
    expect(screen.getByRole('button', { name: 'Settle up' }).className).toMatch(/bg-accent/);
  });

  it('leaves a Payee with nothing unlinked alone', () => {
    renderBalances([balance('a', 9_000_000), balance('b', 1_000_000)], {
      unlinkedPaymentCount: 1,
      unlinkedOf: (b) => (b.payee.id === 'a' ? { count: 1, amount: 4_000_000 } : undefined),
    });
    expect(screen.getAllByText(/isn't linked yet/)).toHaveLength(1);
  });
});

describe('OwedBalances Conflicts the member has already answered', () => {
  const waiting = {
    days: 1,
    waiting: 1,
    amount: 4_271_257,
    first: {} as never,
    firstCorpName: 'Bureau of Unified Harvesting',
    firstResolvesOn: '2026-11-12',
    closed: 0,
  };

  it('still shows the bill and its date, but stops reading as a warning', () => {
    renderBalances([balance('a', 0)], { conflicts: waiting });
    expect(screen.queryByText('No moon mining tax outstanding')).not.toBeInTheDocument();
    const title = screen.getByText('Waiting on the corp');
    expect(title.className).not.toMatch(/text-warning/);
    expect(screen.getByText('4,271,257')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have told Bureau of Unified Harvesting. It still bills on 2026-11-12 unless an officer answers first, so check back.'
      )
    ).toBeInTheDocument();
  });

  it('still reads as a warning while one day is unanswered', () => {
    renderBalances([balance('a', 0)], { conflicts: { ...waiting, days: 2, waiting: 1 } });
    expect(screen.getByText('Conflicts').className).toMatch(/text-warning/);
  });
});

describe('OwedBalances card actions', () => {
  it('reads the owed figure red with a minus and has no hidden name or figure links', () => {
    renderBalances([balance('a', 1_000_000)]);
    expect(screen.getAllByText(/^−1,000,000/)[0]).toHaveClass('text-isk-neg');
    expect(screen.queryByRole('button', { name: /Show only/ })).toBeNull();
  });

  it('puts Ledger and Link payment beside Settle up, each calling its handler', async () => {
    const onOpenLedger = vi.fn();
    const onLinkPayment = vi.fn();
    renderBalances([balance('a', 1_000_000)], { onOpenLedger, onLinkPayment });
    await userEvent.click(screen.getAllByRole('button', { name: /^Open the ledger of/ })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'Link payment' })[0]!);
    expect(onOpenLedger).toHaveBeenCalledOnce();
    expect(onLinkPayment).toHaveBeenCalledOnce();
  });

  it('keeps a lone Ledger action as text, with no menu of one', () => {
    renderBalances([balance('a', 1_000_000)], {
      onOpenLedger: vi.fn(),
      hideLinkPayment: () => true,
    });
    expect(screen.getAllByRole('button', { name: /^Open the ledger of/ }).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link payment' })).toBeNull();
  });
});

describe('OwedBalances on a Corp Tax Book card', () => {
  it("counts the book's owed days and its oldest unpaid day, whatever rows are in view", () => {
    const book = {
      payee: { id: 'corp-book:1', name: 'Test Corp' },
      owed: 2_000_000,
      credit: 0,
      members: [],
      book: { days: 2, oldest: '2026-10-01' },
    } as unknown as PayeeBalance;
    renderBalances([book]);
    expect(screen.getAllByText('Corp Tax Book').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
    expect(screen.queryByText(/0 entries/)).not.toBeInTheDocument();
    expect(screen.getByText(/oldest unpaid day was \d+ days ago/)).toBeInTheDocument();
  });
});

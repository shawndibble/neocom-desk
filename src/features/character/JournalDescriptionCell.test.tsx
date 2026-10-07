import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { JournalDescriptionCell } from './JournalDescriptionCell';
import type { WalletJournalEntry } from '@/esi/endpoints';

vi.mock('./npcFactions', () => ({
  loadNpcFactions: vi.fn(
    async () =>
      new Map<number, string | null>([
        [16938, 'Blood Raiders'],
        [17039, 'Serpentis'],
        [17594, null],
      ])
  ),
}));

function entry(overrides: Partial<WalletJournalEntry> = {}): WalletJournalEntry {
  return {
    id: 1,
    date: '2026-08-02T12:00:00Z',
    ref_type: 'bounty_prize',
    description: 'Bounty prize',
    ...overrides,
  };
}

describe('JournalDescriptionCell', () => {
  it('renders only the description when there is nothing extra to show', () => {
    const { container } = render(
      <MemoryRouter>
        <JournalDescriptionCell entry={entry()} transaction={undefined} itemName="" />
      </MemoryRouter>
    );
    expect(container).toHaveTextContent('Bounty prize');
    expect(container.querySelector('div')).toBeNull();
  });

  it("names a daily goal payout's goal instead of printing its message id", () => {
    const { container } = render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ ref_type: 'daily_goal_payouts', description: '-', reason: '1004953' })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    // The goal's name replaces both ESI's `-` description and the bare id.
    expect(container.textContent).toBe('Complete 3 Jumps');
  });

  it('falls back to a plain label for a daily goal it has no name for', async () => {
    const { container } = render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ ref_type: 'daily_goal_payouts', description: '-', reason: '999' })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(container).toHaveTextContent('Daily goal');
    expect(container).not.toHaveTextContent('999');
    // Kept in a tooltip, so the goal can be named later.
    await userEvent.hover(screen.getByText('Daily goal'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Goal id 999');
  });

  it('shows a non-empty reason as a second line', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ description: 'Corp tax', reason: 'moon tax Aug' })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(screen.getByText('moon tax Aug')).toBeInTheDocument();
  });

  it("sums a bounty line's kills per pirate faction instead of printing ESI's raw type ids", async () => {
    const { container } = render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({
            ref_type: 'bounty_prizes',
            reason: '16938: 3,17039: 2,17594: 1,16952: 1',
          })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(
      await screen.findByText('Blood Raiders ×3 · Serpentis ×2 · Other ×2')
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent('16938');
  });

  it('links a contract-reward row to the contract history, highlighted', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ context_id_type: 'contract_id', context_id: 42 })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/contracts/history?highlight=42');
  });

  it('does not link a row whose context is not a contract', () => {
    const { container } = render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ context_id_type: 'market_transaction_id', context_id: 42 })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('links contract id 0 — a falsy value that is still a real id', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ context_id_type: 'contract_id', context_id: 0 })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/contracts/history?highlight=0');
  });

  it('shows the reason line and the contract link together', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({
            reason: 'moon tax Aug',
            context_id_type: 'contract_id',
            context_id: 7,
          })}
          transaction={undefined}
          itemName=""
        />
      </MemoryRouter>
    );
    expect(screen.getByText('moon tax Aug')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/contracts/history?highlight=7');
  });
  it('links a line a pilot tied to a mining tax payment back to that tax row', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ ref_type: 'player_donation', description: 'Donation' })}
          transaction={undefined}
          itemName=""
          miningTaxHref="/mining/tax?tax.payment=journal%3A1"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /mining tax/i })).toHaveAttribute(
      'href',
      '/mining/tax?tax.payment=journal%3A1'
    );
  });

  it('makes the memo line the link when a linked line has one', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell
          entry={entry({ ref_type: 'player_donation', reason: 'Moon tax 10-05 Ainsan' })}
          transaction={undefined}
          itemName=""
          miningTaxHref="/mining/tax?tax.payment=journal%3A1"
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Moon tax 10-05 Ainsan/ })).toHaveAttribute(
      'href',
      '/mining/tax?tax.payment=journal%3A1'
    );
  });

  it('shows no mining tax link for an unlinked line', () => {
    render(
      <MemoryRouter>
        <JournalDescriptionCell entry={entry()} transaction={undefined} itemName="" />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: /mining tax/i })).toBeNull();
  });
});

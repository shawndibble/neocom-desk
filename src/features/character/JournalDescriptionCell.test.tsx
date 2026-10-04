import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('falls back to a plain label for a daily goal it has no name for', () => {
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
    // Kept on hover, so the goal can be named later.
    expect(screen.getByTitle('Goal id 999')).toBeInTheDocument();
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
});

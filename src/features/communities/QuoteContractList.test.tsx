import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Contract } from '@/esi/endpoints';
import { QuoteContractList, type LinkedContractRow } from './QuoteContractList';

vi.mock('@/features/character/ContractDetailModal', () => ({
  ContractDetailModal: ({ contract }: { contract: Contract }) => (
    <div role="dialog">Detail of {contract.contract_id}</div>
  ),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map()),
}));

const NOW = Date.parse('2026-10-20T12:00:00Z');
const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    contract_id: 11,
    issuer_id: 1,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: new Date(NOW - 2 * 86_400_000).toISOString(),
    date_expired: new Date(NOW + 86_400_000).toISOString(),
    price: 9000,
    ...over,
  }) as Contract;

const show = (rows: LinkedContractRow[]) =>
  render(
    <MemoryRouter>
      <QuoteContractList
        rows={rows}
        quotedTotal={10_800}
        viewerCharacterId={1}
        label="Contracts"
        now={NOW}
      />
    </MemoryRouter>
  );

describe('QuoteContractList', () => {
  it('shows nothing for no contracts', () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a contract’s status, price and age, and opens its detail on a click', async () => {
    show([{ contractId: 11, status: 'inProgress', contract: contract(), priceDiffers: false }]);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('9,000 ISK')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Detail of 11');
  });

  it('marks a price that differs from the quote', () => {
    show([{ contractId: 11, status: 'outstanding', contract: contract(), priceDiffers: true }]);
    expect(screen.getByText('Price differs from quote · 10,800 ISK quoted')).toBeInTheDocument();
  });

  it('shows only the id and status for a contract this side cannot read', () => {
    show([{ contractId: 77, status: 'finished', priceDiffers: false }]);
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByText('Contract 77')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { Contract } from '@/esi/endpoints';
import { ContractIdentity } from './ContractIdentity';

const contract = {
  contract_id: 12345,
  issuer_id: 1,
  issuer_corporation_id: 2,
  assignee_id: 3,
  acceptor_id: 0,
  type: 'item_exchange',
  status: 'outstanding',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-08-25T23:05:00Z',
  date_expired: '2026-09-01T23:05:00Z',
} as Contract;

beforeEach(async () => {
  await db.settings.clear();
});

describe('ContractIdentity buyback cue', () => {
  it('carries no Community mark for an ordinary contract', () => {
    render(<ContractIdentity contract={contract} characterId={91} />);
    expect(screen.getByText('Item Exchange')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Buyback contract' })).not.toBeInTheDocument();
  });

  it('marks a contract that is a buyback Quote’s with the Community icon', async () => {
    await db.settings.put({
      key: 'buybackLinks:91',
      value: {
        '12345': {
          requestId: 'r1',
          communityId: 'c1',
          communityName: 'Efa Miners',
          requestTitle: 'All ore',
          quotedTotal: 9000,
        },
      },
    });
    render(<ContractIdentity contract={contract} characterId={91} />);
    expect(await screen.findByRole('img', { name: 'Buyback contract' })).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import {
  isActiveContractStatus,
  withAcceptedCourierInProgress,
  contractStatusTone,
} from './contractStatus';

function contract(over: Partial<Contract>): Contract {
  return {
    contract_id: 1,
    issuer_id: 10,
    issuer_corporation_id: 1,
    assignee_id: 0,
    acceptor_id: 0,
    type: 'courier',
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: '2026-09-25T00:00:00Z',
    date_expired: '2026-10-25T00:00:00Z',
    ...over,
  } as Contract;
}

describe('withAcceptedCourierInProgress', () => {
  it('reads an accepted courier that ESI still calls outstanding as in progress', () => {
    const c = contract({ acceptor_id: 20, date_accepted: '2026-09-26T00:00:00Z' });
    expect(withAcceptedCourierInProgress(c).status).toBe('in_progress');
  });

  it('leaves an unaccepted courier outstanding', () => {
    expect(withAcceptedCourierInProgress(contract({})).status).toBe('outstanding');
    expect(withAcceptedCourierInProgress(contract({ acceptor_id: 20 })).status).toBe('outstanding');
  });

  it('leaves other contract types and other statuses alone', () => {
    const accepted = { acceptor_id: 20, date_accepted: '2026-09-26T00:00:00Z' };
    const exchange = contract({ type: 'item_exchange', ...accepted });
    expect(withAcceptedCourierInProgress(exchange)).toBe(exchange);
    const done = contract({ status: 'finished', ...accepted });
    expect(withAcceptedCourierInProgress(done)).toBe(done);
  });
});

describe('isActiveContractStatus', () => {
  it('counts outstanding and in progress as live', () => {
    expect(isActiveContractStatus('in_progress')).toBe(true);
    expect(isActiveContractStatus('finished')).toBe(false);
  });
});

describe('contractStatusTone', () => {
  it('reads every finished state as success', () => {
    for (const status of ['finished', 'finished_issuer', 'finished_contractor'] as const) {
      expect(contractStatusTone(status)).toBe('success');
    }
  });

  it('reads a contract that is still live as warning', () => {
    expect(contractStatusTone('outstanding')).toBe('warning');
    expect(contractStatusTone('in_progress')).toBe('warning');
  });

  it('reads a failure as danger, and a withdrawal as neutral', () => {
    for (const status of ['failed', 'rejected', 'reversed'] as const) {
      expect(contractStatusTone(status)).toBe('danger');
    }
    expect(contractStatusTone('cancelled')).toBe('neutral');
    expect(contractStatusTone('deleted')).toBe('neutral');
  });
});

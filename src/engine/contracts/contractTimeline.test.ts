import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { contractTimeline } from './contractTimeline';

function contract(overrides: Partial<Contract>): Contract {
  return {
    contract_id: 237167313,
    issuer_id: 1,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 3,
    type: 'item_exchange',
    status: 'finished',
    for_corporation: false,
    availability: 'personal',
    date_issued: '2026-10-17T17:25:00Z',
    date_expired: '2026-10-31T17:25:00Z',
    ...overrides,
  };
}

describe('contractTimeline', () => {
  it('walks a finished contract from issued through accepted to completed', () => {
    const steps = contractTimeline(
      contract({
        date_accepted: '2026-10-17T18:52:10Z',
        date_completed: '2026-10-17T18:52:40Z',
      })
    );
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['issued', true],
      ['accepted', true],
      ['completed', true],
    ]);
    expect(steps[0]!.atMs).toBe(Date.UTC(2026, 9, 17, 17, 25));
  });

  it('marks completion as the same minute as acceptance when the two stamps share one', () => {
    const steps = contractTimeline(
      contract({
        date_accepted: '2026-10-17T18:52:10Z',
        date_completed: '2026-10-17T18:52:40Z',
      })
    );
    expect(steps[2]!.sameMinuteAsPrevious).toBe(true);
    const later = contractTimeline(
      contract({
        date_accepted: '2026-10-17T18:52:10Z',
        date_completed: '2026-10-19T09:00:00Z',
      })
    );
    expect(later[2]!.sameMinuteAsPrevious).toBe(false);
  });

  it('shows an outstanding contract waiting, with its expiry as the last step', () => {
    const steps = contractTimeline(contract({ status: 'outstanding' }));
    expect(steps.map((s) => [s.key, s.done, s.atMs])).toEqual([
      ['issued', true, Date.UTC(2026, 9, 17, 17, 25)],
      ['accepted', false, null],
      ['expires', false, Date.UTC(2026, 9, 31, 17, 25)],
    ]);
  });

  it('leaves out an accepted step that ESI gave no stamp for once the contract is completed', () => {
    // Completed means it was accepted; "Accepted: Waiting" beside it would be wrong.
    const steps = contractTimeline(
      contract({ status: 'finished_contractor', date_completed: '2026-08-26T01:46:00Z' })
    );
    expect(steps.map((s) => s.key)).toEqual(['issued', 'completed']);
    expect(steps[1]!.sameMinuteAsPrevious).toBeUndefined();
  });
});

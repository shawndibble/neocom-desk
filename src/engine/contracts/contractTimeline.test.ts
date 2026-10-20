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

/** Before every contract's expiry below, so none has lapsed unless a test says so. */
const NOW = Date.UTC(2026, 9, 20);

describe('contractTimeline', () => {
  it('walks a finished contract from issued through accepted to completed', () => {
    const steps = contractTimeline(
      contract({
        date_accepted: '2026-10-17T18:52:10Z',
        date_completed: '2026-10-17T18:52:40Z',
      }),
      NOW
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
      }),
      NOW
    );
    expect(steps[2]!.sameMinuteAsPrevious).toBe(true);
    const later = contractTimeline(
      contract({
        date_accepted: '2026-10-17T18:52:10Z',
        date_completed: '2026-10-19T09:00:00Z',
      }),
      NOW
    );
    expect(later[2]!.sameMinuteAsPrevious).toBe(false);
  });

  it('shows an outstanding contract waiting, with its expiry as the last step', () => {
    const steps = contractTimeline(contract({ status: 'outstanding' }), NOW);
    expect(steps.map((s) => [s.key, s.done, s.atMs])).toEqual([
      ['issued', true, Date.UTC(2026, 9, 17, 17, 25)],
      ['accepted', false, null],
      ['expires', false, Date.UTC(2026, 9, 31, 17, 25)],
    ]);
  });

  it('leaves out an accepted step that ESI gave no stamp for once the contract is completed', () => {
    // Completed means it was accepted; "Accepted: Waiting" beside it would be wrong.
    const steps = contractTimeline(
      contract({ status: 'finished_contractor', date_completed: '2026-08-26T01:46:00Z' }),
      NOW
    );
    expect(steps.map((s) => s.key)).toEqual(['issued', 'completed']);
    expect(steps[1]!.sameMinuteAsPrevious).toBeUndefined();
  });

  describe('a contract that ended without being completed', () => {
    it.each(['cancelled', 'deleted', 'rejected', 'failed', 'reversed'] as const)(
      'ends a %s contract on its outcome, not on an acceptance or an expiry still to come',
      (status) => {
        const steps = contractTimeline(contract({ status, acceptor_id: 0 }), NOW);
        expect(steps.map((s) => [s.key, s.done])).toEqual([
          ['issued', true],
          [status, true],
        ]);
        // ESI gives no date for any of these, so none is shown.
        expect(steps[1]!.atMs).toBeNull();
      }
    );

    it('keeps the acceptance when one was stamped before it was reversed', () => {
      const steps = contractTimeline(
        contract({ status: 'reversed', date_accepted: '2026-10-17T18:52:10Z' }),
        NOW
      );
      expect(steps.map((s) => s.key)).toEqual(['issued', 'accepted', 'reversed']);
    });

    it('calls an unaccepted contract past its expiry expired: ESI leaves it "outstanding"', () => {
      const steps = contractTimeline(
        contract({ status: 'outstanding', acceptor_id: 0 }),
        Date.UTC(2026, 10, 2)
      );
      expect(steps.map((s) => [s.key, s.done])).toEqual([
        ['issued', true],
        ['expired', true],
      ]);
      expect(steps[1]!.atMs).toBe(Date.UTC(2026, 9, 31, 17, 25));
    });

    it('still waits, with its expiry ahead, while an outstanding contract has time left', () => {
      const steps = contractTimeline(contract({ status: 'outstanding' }), NOW);
      expect(steps.map((s) => s.key)).toEqual(['issued', 'accepted', 'expires']);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  diffContractAccepted,
  diffContractCompleted,
  diffContractFailed,
  type ContractEntrySnapshot,
  type ContractSnapshot,
} from './index';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

/** `issuerId`/`acceptorId` default to the common test characterId (7) — the character is party to the contract unless a test overrides one to prove otherwise. */
function contractEntry(
  contractId: number,
  status: ContractEntrySnapshot['status'],
  issuerId = 7,
  // An unaccepted contract has no acceptor; ESI sends 0.
  acceptorId = status === 'outstanding' ? 0 : 7
): ContractEntrySnapshot {
  return { contractId, status, issuerId, acceptorId };
}

function contractSnapshot(
  entries: readonly ContractEntrySnapshot[],
  nowMs: number
): ContractSnapshot {
  return { entries, nowMs };
}

describe('diffContractAccepted', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    expect(diffContractAccepted(1, undefined, next)).toEqual([]);
  });

  it('fires when a contract newly transitions to in_progress', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'in_progress')], T0 + 2000);
    expect(diffContractAccepted(7, prev, next)).toEqual([
      { eventId: 'contractAccepted', characterId: 7, contractId: 1 },
    ]);
  });

  it("carries ESI's date_accepted, to date the feed row", () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot(
      [{ ...contractEntry(1, 'in_progress'), dateAcceptedMs: T0 - 60_000 }],
      T0 + 2000
    );
    expect(diffContractAccepted(7, prev, next)).toEqual([
      { eventId: 'contractAccepted', characterId: 7, contractId: 1, occurredMs: T0 - 60_000 },
    ]);
  });

  it('does not fire for a courier a baseline already recorded as accepted but outstanding', () => {
    // Baselines saved before `withAcceptedCourierInProgress` hold accepted couriers as
    // `outstanding` with their acceptor set; only the label changed, nobody accepted anything.
    const prev = contractSnapshot([contractEntry(1, 'outstanding', 7, 9)], T0);
    const next = contractSnapshot([contractEntry(1, 'in_progress', 7, 9)], T0 + FIVE_MIN);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });

  it('does not fire while the contract stays outstanding', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'outstanding')], T0 + 2000);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a contract already in_progress as of the previous poll', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    const next = contractSnapshot([contractEntry(1, 'in_progress')], T0 + FIVE_MIN);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });

  it('fires for a contract that only appears once already in_progress (never seen outstanding before)', () => {
    const prev = contractSnapshot([contractEntry(2, 'outstanding')], T0);
    const next = contractSnapshot(
      [contractEntry(1, 'in_progress'), contractEntry(2, 'outstanding')],
      T0 + 2000
    );
    expect(diffContractAccepted(7, prev, next)).toEqual([
      { eventId: 'contractAccepted', characterId: 7, contractId: 1 },
    ]);
  });

  it('does not fire when a contract finishes without ever being in_progress', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'finished')], T0 + 2000);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });
});

describe('diffContractCompleted', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = contractSnapshot([contractEntry(1, 'finished')], T0);
    expect(diffContractCompleted(7, undefined, next)).toEqual([]);
  });

  it.each(['finished_issuer', 'finished_contractor', 'finished'] as const)(
    'fires when a contract moves from in_progress to %s',
    (status) => {
      const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
      const next = contractSnapshot([contractEntry(1, status)], T0 + 2000);
      expect(diffContractCompleted(7, prev, next)).toEqual([
        { eventId: 'contractCompleted', characterId: 7, contractId: 1 },
      ]);
    }
  );

  it("carries ESI's date_completed, to date the feed row", () => {
    const completedAt = T0 - 15 * 3_600_000;
    const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    const next = contractSnapshot(
      [
        {
          ...contractEntry(1, 'finished'),
          dateAcceptedMs: T0 - 86_400_000,
          dateCompletedMs: completedAt,
        },
      ],
      T0 + 2000
    );
    expect(diffContractCompleted(7, prev, next)).toEqual([
      { eventId: 'contractCompleted', characterId: 7, contractId: 1, occurredMs: completedAt },
    ]);
  });

  it('fires when a contract moves from outstanding straight to a completed status', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'finished')], T0 + 2000);
    expect(diffContractCompleted(7, prev, next)).toEqual([
      { eventId: 'contractCompleted', characterId: 7, contractId: 1 },
    ]);
  });

  it('does not fire for a contract discovered already in a completed status (no baseline yet for it)', () => {
    const prev = contractSnapshot([contractEntry(2, 'outstanding')], T0);
    const next = contractSnapshot(
      [contractEntry(1, 'finished'), contractEntry(2, 'outstanding')],
      T0 + 2000
    );
    expect(diffContractCompleted(7, prev, next)).toEqual([]);
  });

  it('does not fire for rejected, cancelled, deleted or reversed', () => {
    for (const status of ['rejected', 'cancelled', 'deleted', 'reversed'] as const) {
      const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
      const next = contractSnapshot([contractEntry(1, status)], T0 + 2000);
      expect(diffContractCompleted(7, prev, next)).toEqual([]);
    }
  });

  it('does not fire for failed', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    const next = contractSnapshot([contractEntry(1, 'failed')], T0 + 2000);
    expect(diffContractCompleted(7, prev, next)).toEqual([]);
  });

  it('does not re-fire once already completed as of the previous poll', () => {
    const prev = contractSnapshot([contractEntry(1, 'finished')], T0);
    const next = contractSnapshot([contractEntry(1, 'finished')], T0 + FIVE_MIN);
    expect(diffContractCompleted(7, prev, next)).toEqual([]);
  });

  it('does not fire when the character is neither issuer nor acceptor', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress', 100, 200)], T0);
    const next = contractSnapshot([contractEntry(1, 'finished', 100, 200)], T0 + 2000);
    expect(diffContractCompleted(7, prev, next)).toEqual([]);
  });

  it('fires when the character is the issuer but not the acceptor', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress', 7, 200)], T0);
    const next = contractSnapshot([contractEntry(1, 'finished', 7, 200)], T0 + 2000);
    expect(diffContractCompleted(7, prev, next)).toEqual([
      { eventId: 'contractCompleted', characterId: 7, contractId: 1 },
    ]);
  });
});

describe('diffContractFailed', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = contractSnapshot([contractEntry(1, 'failed')], T0);
    expect(diffContractFailed(7, undefined, next)).toEqual([]);
  });

  it('fires when a contract moves from in_progress to failed', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    const next = contractSnapshot([contractEntry(1, 'failed')], T0 + 2000);
    expect(diffContractFailed(7, prev, next)).toEqual([
      { eventId: 'contractFailed', characterId: 7, contractId: 1 },
    ]);
  });

  it('does not fire for any completed status', () => {
    for (const status of ['finished_issuer', 'finished_contractor', 'finished'] as const) {
      const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
      const next = contractSnapshot([contractEntry(1, status)], T0 + 2000);
      expect(diffContractFailed(7, prev, next)).toEqual([]);
    }
  });

  it('does not fire for rejected, cancelled, deleted or reversed', () => {
    for (const status of ['rejected', 'cancelled', 'deleted', 'reversed'] as const) {
      const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
      const next = contractSnapshot([contractEntry(1, status)], T0 + 2000);
      expect(diffContractFailed(7, prev, next)).toEqual([]);
    }
  });

  it('does not fire for a contract discovered already failed (no baseline yet for it)', () => {
    const prev = contractSnapshot([contractEntry(2, 'outstanding')], T0);
    const next = contractSnapshot(
      [contractEntry(1, 'failed'), contractEntry(2, 'outstanding')],
      T0 + 2000
    );
    expect(diffContractFailed(7, prev, next)).toEqual([]);
  });

  it('does not fire when the character is neither issuer nor acceptor', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress', 100, 200)], T0);
    const next = contractSnapshot([contractEntry(1, 'failed', 100, 200)], T0 + 2000);
    expect(diffContractFailed(7, prev, next)).toEqual([]);
  });
});

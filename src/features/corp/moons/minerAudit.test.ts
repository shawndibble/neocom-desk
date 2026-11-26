import { describe, expect, it } from 'vitest';
import { isMinerAuditEntry, type MinerAuditSubjects } from './minerAudit';

const of: MinerAuditSubjects = {
  minerId: 'solo:1',
  noticeIds: new Set(['n1']),
  paymentIds: new Set(['p1']),
  declarationIds: new Set(['x1']),
  disputeIds: new Set(['d1']),
};

describe('isMinerAuditEntry', () => {
  it('counts an entry naming the Miner, their notice, payment, declaration or dispute', () => {
    expect(isMinerAuditEntry({ minerId: 'solo:1' }, of)).toBe(true);
    expect(isMinerAuditEntry({ noticeId: 'n1' }, of)).toBe(true);
    expect(isMinerAuditEntry({ statementId: 'n1' }, of)).toBe(true);
    expect(isMinerAuditEntry({ paymentId: 'p1' }, of)).toBe(true);
    expect(isMinerAuditEntry({ declarationId: 'x1', resolution: 'rejected' }, of)).toBe(true);
    expect(isMinerAuditEntry({ disputeId: 'd1', reason: 'kept' }, of)).toBe(true);
  });

  it("leaves another Miner's entries out", () => {
    expect(isMinerAuditEntry({ minerId: 'solo:2' }, of)).toBe(false);
    expect(isMinerAuditEntry({ declarationId: 'x2' }, of)).toBe(false);
    expect(isMinerAuditEntry({ disputeId: 'd2' }, of)).toBe(false);
  });
});

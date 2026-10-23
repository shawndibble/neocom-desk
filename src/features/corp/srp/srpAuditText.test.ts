import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { SrpAuditEntry } from '../srpClaimTypes';
import { auditText } from './srpAuditText';

const entry = (action: string, detail: Record<string, unknown>): SrpAuditEntry => ({
  id: 'x',
  at: 1,
  by: 2,
  byName: 'Kestrel',
  action,
  detail,
});
const t = i18n.t.bind(i18n);

describe('auditText', () => {
  it('words an approval, with and without a changed amount', () => {
    expect(auditText(t, entry('approveClaim', { killmailId: 5, amount: 1000 }))).toBe(
      'Approved killmail 5 for 1,000 ISK'
    );
    expect(
      auditText(
        t,
        entry('approveClaim', {
          killmailId: 5,
          amount: 800,
          computedAmount: 1000,
          reason: 'cheap fit',
        })
      )
    ).toBe('Approved killmail 5 for 800 ISK (changed from 1,000): cheap fit');
  });
  it('words a typed amount on a claim that had none as a change from nothing', () => {
    expect(
      auditText(
        t,
        entry('approveClaim', { killmailId: 5, amount: 800, computedAmount: null, reason: null })
      )
    ).toContain('800 ISK');
  });
  it('words reject, change, paid and filing', () => {
    expect(auditText(t, entry('rejectClaim', { killmailId: 5, reason: 'solo' }))).toBe(
      'Rejected killmail 5: solo'
    );
    expect(
      auditText(t, entry('changeClaimAmount', { killmailId: 5, from: 10, amount: 7, reason: 'r' }))
    ).toBe('Changed amount of killmail 5 from 10 to 7 ISK: r');
    expect(auditText(t, entry('markClaimPaid', { killmailId: 5, amount: 7 }))).toBe(
      'Marked killmail 5 paid, 7 ISK'
    );
    expect(auditText(t, entry('fileClaim', { killmailId: 5, amount: null }))).toBe(
      'Filed claim killmail 5, no amount worked out'
    );
  });
  it('falls back to the action name', () => {
    expect(auditText(t, entry('somethingNew', {}))).toBe('somethingNew');
  });
});

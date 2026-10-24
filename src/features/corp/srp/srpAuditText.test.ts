import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { SrpAuditEntry } from '../srpClaimTypes';
import { auditText, collapseRepeatedSaves } from './srpAuditText';

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
  it('words the retention sweep with its count', () => {
    expect(auditText(t, entry('retentionDelete', { count: 3, claimIds: [1, 2, 3] }))).toBe(
      'Retention sweep removed 3 closed claims'
    );
  });
  it('never shows a raw action string', () => {
    expect(auditText(t, entry('somethingNew', {}))).toBe('Other activity');
  });
});

describe('Doctrine Fit lines', () => {
  it('names the fit', () => {
    expect(auditText(t, entry('addDoctrine', { name: 'Doctrine Rifter' }))).toBe(
      'Added Doctrine Fit Doctrine Rifter'
    );
    expect(auditText(t, entry('deleteDoctrine', { name: 'Old' }))).toBe('Deleted Doctrine Fit Old');
  });
});

describe('collapseRepeatedSaves', () => {
  const at = (id: string, action: string, ms: number, by = 2): SrpAuditEntry => ({
    ...entry(action, {}),
    id,
    at: ms,
    by,
  });
  it('keeps the newest of saves by one officer within a minute', () => {
    const out = collapseRepeatedSaves([
      at('a', 'saveSettings', 100_000),
      at('b', 'saveSettings', 60_000),
      at('c', 'turnOn', 50_000),
      at('d', 'saveSettings', 40_000),
    ]);
    expect(out.map((e) => e.id)).toEqual(['a', 'c', 'd']);
  });
  it('keeps saves a minute apart or by different officers', () => {
    const out = collapseRepeatedSaves([
      at('a', 'saveSettings', 200_000),
      at('b', 'saveSettings', 100_000),
      at('c', 'saveSettings', 99_000, 3),
    ]);
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});

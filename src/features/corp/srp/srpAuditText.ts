/**
 * One audit entry as a sentence: the officer feed and a claim's audit trail share it.
 * The entry's `byName` is the actor, so the sentence carries what they did, not who.
 */
import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import { isSrpAuditAction } from '../srpAuditAction';
import type { SrpAuditEntry } from '../srpClaimTypes';

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const isk = (value: number | null): string => (value === null ? '?' : formatIsk(value));

export function auditText(t: TFunction, entry: SrpAuditEntry): string {
  const d = entry.detail;
  const id = String(num(d.killmailId) ?? '');
  const amount = num(d.amount);
  const base = `srp.officer.audit.${entry.action}`;
  if (!isSrpAuditAction(entry.action)) return t('srp.officer.audit.other');
  switch (entry.action) {
    case 'fileClaim':
      return amount === null ? t(`${base}None`, { id }) : t(base, { id, isk: isk(amount) });
    case 'approveClaim':
      return num(d.computedAmount) !== null || 'computedAmount' in d
        ? t(`${base}Override`, {
            id,
            isk: isk(amount),
            from: isk(num(d.computedAmount)),
            reason: text(d.reason),
          })
        : t(base, { id, isk: isk(amount) });
    case 'rejectClaim':
      return t(base, { id, reason: text(d.reason) });
    case 'changeClaimAmount':
      return t(base, { id, from: isk(num(d.from)), isk: isk(amount), reason: text(d.reason) });
    case 'markClaimPaid':
      return t(base, { id, isk: isk(amount) });
    case 'refileClaim':
    case 'turnOn':
    case 'turnOff':
    case 'saveSettings':
    case 'reclaim':
      return t(base, { id });
    case 'retentionDelete':
      return t(base, { count: num(d.count) ?? 0 });
  }
}

import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import { isSrpAuditAction } from '../srpAuditAction';
import type { SrpAuditEntry } from '../srpClaimTypes';
import { MINUTE_MS } from '@/lib/age';

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function auditText(t: TFunction, entry: SrpAuditEntry): string {
  const isk = (value: number | null): string =>
    value === null ? t('srp.officer.audit.noAmount') : formatIsk(value);
  const d = entry.detail;
  const id = String(num(d.killmailId) ?? '');
  const amount = num(d.amount);
  const base = `srp.officer.audit.${entry.action}`;
  if (!isSrpAuditAction(entry.action)) return t('srp.officer.audit.other');
  switch (entry.action) {
    case 'fileClaim':
      return amount === null ? t(`${base}None`, { id }) : t(base, { id, isk: isk(amount) });
    case 'approveClaim':
      if (amount === null) return t(`${base}None`, { id });
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
      return amount === null ? t(`${base}None`, { id }) : t(base, { id, isk: isk(amount) });
    case 'refileClaim':
    case 'turnOn':
    case 'turnOff':
    case 'saveSettings':
    case 'reclaim':
      return t(base, { id });
    case 'addDoctrine':
    case 'updateDoctrine':
    case 'deleteDoctrine':
      return t(base, { name: text(d.name) });
    case 'retentionDelete':
      return t(base, { count: num(d.count) ?? 0 });
  }
}

const SAVE_COLLAPSE_MS = MINUTE_MS;

export function collapseRepeatedSaves(entries: readonly SrpAuditEntry[]): SrpAuditEntry[] {
  const out: SrpAuditEntry[] = [];
  for (const entry of entries) {
    const kept = out[out.length - 1];
    const repeat =
      entry.action === 'saveSettings' &&
      kept?.action === 'saveSettings' &&
      kept.by === entry.by &&
      kept.at - entry.at <= SAVE_COLLAPSE_MS;
    if (!repeat) out.push(entry);
  }
  return out;
}

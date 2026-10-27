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
    case 'addDoctrine':
    case 'updateDoctrine':
    case 'deleteDoctrine':
      return t(base, { name: text(d.name) });
    case 'retentionDelete':
      return t(base, { count: num(d.count) ?? 0 });
  }
}

/** Saves by one officer this close together read as one line. */
const SAVE_COLLAPSE_MS = 60_000;

/**
 * Newest-first feed entries with a run of "Saved SRP settings" by the same officer, each within a
 * minute of the one kept, collapsed into the newest. Other actions are never dropped.
 */
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

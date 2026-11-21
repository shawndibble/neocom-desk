/**
 * What a pilot or an officer wrote behind an audit entry, which the entry itself does not store:
 * a declaration's note and amount, a dispute's reason (and which kind it is, for its sentence),
 * a hand-recorded payment's note. Read from the records the book already holds, by the id the
 * entry names.
 */
import { useMemo } from 'react';
import type { AuditEntry } from '../taxBook/bookClient';
import { useBook } from './useBook';

export interface AuditWords {
  /** The action's sentence key, when the entry's own action reads wrong for it. */
  action?: string;
  /** The words, as written. */
  said?: string;
  /** An amount the pilot named. */
  amount?: number;
}

export type AuditWordsOf = (entry: AuditEntry) => AuditWords;

export function useAuditWords(): AuditWordsOf {
  const { view } = useBook();
  const declarations = useMemo(
    () => new Map(view.input.declarations.map((d) => [d.id, d])),
    [view.input.declarations]
  );
  const disputes = useMemo(
    () => new Map((view.input.disputes ?? []).map((d) => [d.id, d])),
    [view.input.disputes]
  );
  const payments = useMemo(
    () => new Map(view.input.payments.map((p) => [p.id, p])),
    [view.input.payments]
  );
  return (entry) => {
    const d = entry.detail;
    if (entry.action === 'declare' && typeof d.declarationId === 'string') {
      const declared = declarations.get(d.declarationId);
      const amount = typeof d.amount === 'number' ? d.amount : declared?.amount;
      return {
        ...(declared?.note ? { said: declared.note } : {}),
        ...(amount !== undefined ? { amount } : {}),
      };
    }
    if (entry.action === 'disputeConflict' && typeof d.disputeId === 'string') {
      const dispute = disputes.get(d.disputeId);
      const kind = typeof d.kind === 'string' ? d.kind : dispute?.kind;
      return {
        // A pilot's dispute names its kind; one stored before kinds is a payee dispute.
        ...(kind ? { action: `disputeKind.${kind}` } : {}),
        ...(dispute?.reason ? { said: dispute.reason } : {}),
      };
    }
    if (entry.action === 'recordPayment' && typeof d.paymentId === 'string') {
      const note = (payments.get(d.paymentId) as { note?: unknown } | undefined)?.note;
      return typeof note === 'string' && note ? { said: note } : {};
    }
    return {};
  };
}

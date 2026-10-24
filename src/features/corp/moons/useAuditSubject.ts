import type { AuditEntry } from '../taxBook/bookClient';
import { useBook } from './useBook';

/** Who a Statement entry was about, and its amount when the entry names one. */
export type AuditSubject = (entry: AuditEntry) => { name: string; amount?: number } | null;

const STATEMENT_ACTIONS = new Set(['issueStatement', 'recordMail', 'recordReminder']);

/** Resolves an entry's Statement to its Miner, so old entries (which store only the Statement id) name them too. */
export function useAuditSubject(): AuditSubject {
  const { view, names } = useBook();
  return (entry) => {
    if (!STATEMENT_ACTIONS.has(entry.action)) return null;
    const { statementId, minerId, amount } = entry.detail;
    const statement =
      typeof statementId === 'string'
        ? view.input.statements.find((x) => x.id === statementId)
        : undefined;
    const id = typeof minerId === 'string' ? minerId : statement?.minerId;
    const miner = view.miners.find((m) => m.id === id);
    if (!miner) return null;
    const total = typeof amount === 'number' ? amount : statement?.amount;
    return {
      name: names.character(miner.mainCharacterId),
      ...(entry.action === 'issueStatement' && total !== undefined ? { amount: total } : {}),
    };
  };
}

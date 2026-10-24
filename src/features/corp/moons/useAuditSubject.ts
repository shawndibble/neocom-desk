import type { AuditEntry } from '../taxBook/bookClient';
import { useMemo } from 'react';
import { useBook } from './useBook';

/** Who a Statement entry was about, and its amount when the entry names one. */
export type AuditSubject = (entry: AuditEntry) => { name: string; amount?: number } | null;

const STATEMENT_ACTIONS = new Set(['issueStatement', 'recordMail', 'recordReminder']);

/** Resolves an entry's Statement to its Miner, so old entries (which store only the Statement id) name them too. */
export function useAuditSubject(): AuditSubject {
  const { view, names } = useBook();
  const statements = useMemo(
    () => new Map(view.input.statements.map((x) => [x.id, x])),
    [view.input.statements]
  );
  const miners = useMemo(() => new Map(view.miners.map((m) => [m.id, m])), [view.miners]);
  return (entry) => {
    if (!STATEMENT_ACTIONS.has(entry.action)) return null;
    const { statementId, minerId, amount } = entry.detail;
    const statement = typeof statementId === 'string' ? statements.get(statementId) : undefined;
    const id = typeof minerId === 'string' ? minerId : statement?.minerId;
    const miner = id === undefined ? undefined : miners.get(id);
    if (!miner) return null;
    const total = typeof amount === 'number' ? amount : statement?.amount;
    return {
      name: names.character(miner.mainCharacterId),
      ...(entry.action === 'issueStatement' && total !== undefined ? { amount: total } : {}),
    };
  };
}

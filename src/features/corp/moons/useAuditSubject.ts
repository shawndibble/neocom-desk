import type { AuditEntry } from '../taxBook/bookClient';
import { useMemo } from 'react';
import { minerPath } from './moonsPaths';
import { useBook } from './useBook';

/**
 * The Miner an entry is about: their name, the page it links to, and a Statement entry's amount.
 * `inSentence` false: the entry's own wording does not name them, so the link goes after it.
 */
export type AuditSubject = (
  entry: AuditEntry
) => { name: string; amount?: number; path?: string; inSentence?: boolean } | null;

const STATEMENT_ACTIONS = new Set(['issueStatement', 'recordMail', 'recordReminder']);

/**
 * Resolves an entry's Miner, from its own `minerId` or its Statement's, so old entries (which
 * store only the Statement id) name them too. Statement entries name them in the sentence.
 */
export function useAuditSubject(): AuditSubject {
  const { view, names } = useBook();
  const statements = useMemo(
    () => new Map(view.input.statements.map((x) => [x.id, x])),
    [view.input.statements]
  );
  const miners = useMemo(() => new Map(view.miners.map((m) => [m.id, m])), [view.miners]);
  return (entry) => {
    const named = STATEMENT_ACTIONS.has(entry.action);
    const { statementId, minerId, amount } = entry.detail;
    const statement = typeof statementId === 'string' ? statements.get(statementId) : undefined;
    const id = typeof minerId === 'string' ? minerId : statement?.minerId;
    const miner = id === undefined ? undefined : miners.get(id);
    if (!miner) return null;
    const total = typeof amount === 'number' ? amount : statement?.amount;
    return {
      name: names.character(miner.mainCharacterId),
      path: minerPath(miner.id),
      ...(named ? {} : { inSentence: false }),
      ...(entry.action === 'issueStatement' && total !== undefined ? { amount: total } : {}),
    };
  };
}

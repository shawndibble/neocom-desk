import type { AuditEntry } from '../taxBook/bookClient';
import { useMemo } from 'react';
import { NOTICE_ID_FIELD } from '../../../../functions/src/corpTaxBookLateNotice';
import { minerPath } from './moonsPaths';
import { useBook } from './useBook';

/**
 * The Miner an entry is about: their name, the page it links to, and a late notice entry's amount.
 * `inSentence` false: the entry's own wording does not name them, so the link goes after it.
 */
export type AuditSubject = (
  entry: AuditEntry
) => { name: string; amount?: number; path?: string; inSentence?: boolean } | null;

/** Entries about one late notice; the `issueStatement` and `recordMail` names are older servers'. */
const NOTICE_ACTIONS = new Set([
  'issueLateNotice',
  'issueStatement',
  'recordLateNoticeMail',
  'recordMail',
  'recordReminder',
]);
const ISSUE_ACTIONS = new Set(['issueLateNotice', 'issueStatement']);

/**
 * Resolves an entry's Miner, from its own `minerId` or its late notice's, so old entries (which
 * store only the notice's id) name them too. Notice entries name them in the sentence.
 */
export function useAuditSubject(): AuditSubject {
  const { view, names } = useBook();
  const notices = useMemo(
    () => new Map(view.input.notices.map((x) => [x.id, x])),
    [view.input.notices]
  );
  const miners = useMemo(() => new Map(view.miners.map((m) => [m.id, m])), [view.miners]);
  return (entry) => {
    const named = NOTICE_ACTIONS.has(entry.action);
    const { noticeId, [NOTICE_ID_FIELD]: legacyId, minerId, amount, listed } = entry.detail;
    const id_ = typeof noticeId === 'string' ? noticeId : legacyId;
    const notice = typeof id_ === 'string' ? notices.get(id_) : undefined;
    const id = typeof minerId === 'string' ? minerId : notice?.minerId;
    const miner = id === undefined ? undefined : miners.get(id);
    if (!miner) return null;
    const total =
      typeof listed === 'number' ? listed : typeof amount === 'number' ? amount : notice?.listed;
    return {
      name: names.character(miner.mainCharacterId),
      path: minerPath(miner.id),
      ...(named ? {} : { inSentence: false }),
      ...(ISSUE_ACTIONS.has(entry.action) && total !== undefined ? { amount: total } : {}),
    };
  };
}

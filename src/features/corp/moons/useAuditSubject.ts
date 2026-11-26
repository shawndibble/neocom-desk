import type { AuditEntry } from '../taxBook/bookClient';
import { LEGACY_ISSUE_ACTION } from '../taxBook/bookClient';
import { useMemo } from 'react';
import { NOTICE_ID_FIELD } from '../../../../functions/src/corpTaxBookLateNotice';
import { minerPath } from './moonsPaths';
import { useBook } from './useBook';

export type AuditSubject = (
  entry: AuditEntry
) => { name: string; amount?: number; path?: string; inSentence?: boolean } | null;

const NOTICE_ACTIONS = new Set([
  'issueLateNotice',
  LEGACY_ISSUE_ACTION,
  'recordLateNoticeMail',
  'recordMail',
  'recordReminder',
]);
const ISSUE_ACTIONS = new Set(['issueLateNotice', LEGACY_ISSUE_ACTION]);

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

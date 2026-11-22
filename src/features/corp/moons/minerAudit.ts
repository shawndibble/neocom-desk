/**
 * Which audit entries are about one Miner, for their page's Activity: an entry that names them,
 * one of their notices, payments, declarations or disputes. An officer's answer to a declaration
 * or a dispute names only the declaration or the dispute, so those count too.
 */
import { NOTICE_ID_FIELD } from '../../../../functions/src/corpTaxBookLateNotice';

export interface MinerAuditSubjects {
  minerId: string;
  noticeIds: ReadonlySet<string>;
  paymentIds: ReadonlySet<string>;
  declarationIds: ReadonlySet<string>;
  disputeIds: ReadonlySet<string>;
}

export function isMinerAuditEntry(
  detail: Record<string, unknown>,
  of: MinerAuditSubjects
): boolean {
  const has = (ids: ReadonlySet<string>, value: unknown) =>
    typeof value === 'string' && ids.has(value);
  return (
    detail.minerId === of.minerId ||
    has(of.noticeIds, detail.noticeId ?? detail[NOTICE_ID_FIELD]) ||
    has(of.paymentIds, detail.paymentId) ||
    has(of.declarationIds, detail.declarationId) ||
    has(of.disputeIds, detail.disputeId)
  );
}

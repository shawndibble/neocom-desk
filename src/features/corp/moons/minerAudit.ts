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

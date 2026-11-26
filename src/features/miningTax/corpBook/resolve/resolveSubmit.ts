import type { TaxContact } from '@/engine/corpTaxBook/bookDocs';
import type { ClaimCheck, ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import {
  claimCorpTaxBookPayment,
  declareCorpTaxBookPayment,
  disputeCorpTaxBookConflict,
} from '../corpBookStore';
import { notOwedPlan } from './outcomes';
import { sendTaxQuestionMail, type TaxQuestionMailOutcome } from '../sendTaxQuestionMail';

export interface MailContext {
  characterId: number;
  memberName: string;
  corporationId: number;
  corpName: string;
  contact: TaxContact | undefined;
}

async function mail(
  ctx: MailContext,
  input: Parameters<typeof sendTaxQuestionMail>[0]['input']
): Promise<TaxQuestionMailOutcome> {
  try {
    return await sendTaxQuestionMail({
      characterId: ctx.characterId,
      corporationId: ctx.corporationId,
      contact: ctx.contact,
      input,
    });
  } catch {
    return { status: 'failed', definite: false };
  }
}

const dayLines = (row: BookRowView, lines = row.oreLines) =>
  lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({ recordKey: row.recordKey!, typeId: l.typeId, quantity: l.quantity }));

export async function tellNotPaying(ctx: MailContext, row: BookRowView, reason: string) {
  await disputeCorpTaxBookConflict(ctx.characterId, {
    corporationId: ctx.corporationId,
    date: row.date,
    kind: 'notPaying',
    reason,
    lines: dayLines(row),
  });
  return mail(ctx, {
    kind: 'notPaying',
    memberName: ctx.memberName,
    corpName: ctx.corpName,
    days: row.date,
    amountIsk: row.billed,
    note: reason,
  });
}

export async function tellNotOwed(
  ctx: MailContext,
  row: BookRowView,
  reason: string,
  payeeName?: string
) {
  const plan = notOwedPlan(row);
  if (!plan) throw new Error('Nothing in the member record to dispute');
  const base = { corporationId: ctx.corporationId, date: row.date };
  if (plan.kind === 'payee') {
    await disputeCorpTaxBookConflict(ctx.characterId, {
      ...base,
      lines: dayLines(row).map((l) => ({ ...l, payeeName: payeeName ?? '' })),
      ...(reason ? { note: reason } : {}),
    });
  } else if (plan.kind === 'rate') {
    await disputeCorpTaxBookConflict(ctx.characterId, {
      ...base,
      kind: 'rate',
      reason,
      claimedPct: plan.pct,
      lines: dayLines(row),
    });
  } else {
    await disputeCorpTaxBookConflict(ctx.characterId, {
      ...base,
      kind: 'quantity',
      reason,
      lines: dayLines(row, plan.lines),
    });
  }
  return mailNotOwed(ctx, row, reason);
}

export function mailNotOwed(
  ctx: MailContext,
  row: Pick<BookRowView, 'date' | 'billed'>,
  reason: string
) {
  return mail(ctx, {
    kind: 'notOwed',
    memberName: ctx.memberName,
    corpName: ctx.corpName,
    days: row.date,
    amountIsk: row.billed,
    note: reason,
  });
}

export async function sendProof(
  ctx: MailContext,
  noticeId: string,
  transfers: ClaimedTransfer[],
  note: string,
  days: string
): Promise<{ checks: ClaimCheck[]; confirmed: boolean; mailed?: TaxQuestionMailOutcome }> {
  const amount = transfers.reduce((sum, t) => sum + t.amount, 0);
  const result = await declareCorpTaxBookPayment(ctx.characterId, {
    corporationId: ctx.corporationId,
    noticeId,
    ...(amount > 0 ? { amount } : {}),
    ...(note ? { note } : {}),
    ...(transfers.length > 0 ? { transfers } : {}),
  });
  const checks = result.checks ?? [];
  const confirmed = result.confirmed === true;
  if (confirmed) return { checks, confirmed };
  const mailed = await mail(ctx, {
    kind: 'paid',
    memberName: ctx.memberName,
    corpName: ctx.corpName,
    days,
    amountIsk: amount,
    note,
    transfers: transfers.map((t) => ({ amountIsk: t.amount, at: t.at, journalRef: t.journalRef })),
  });
  return { checks, confirmed, mailed };
}

export async function countHeldDonations(
  ctx: Pick<MailContext, 'corporationId'>,
  held: readonly { id: string; characterId: number }[]
): Promise<void> {
  for (const d of held)
    await claimCorpTaxBookPayment(d.characterId, ctx.corporationId, d.id, { inReview: true });
}

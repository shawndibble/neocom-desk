/**
 * The seam between the Statements tab and the mail queue (#4064): turns an
 * issued Statement into what `enqueueStatements`/`enqueueReminder` need. The
 * queue itself (pacing, 520 waits, the chip) is #4064's; nothing here
 * duplicates it.
 */
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { StatementToMail } from '@/features/corpTaxBook/mailQueue';
import { addDays, periodLabel } from './moonsFormat';
import type { BookContextValue } from './bookContextValue';

/** Statements the book already mailed are never offered again (`mailsSent` > 0). */
export function mailsSent(statement: Statement): number {
  return (statement as Statement & { mailsSent?: number }).mailsSent ?? 0;
}

export function remindersStopped(statement: Statement): boolean {
  return (statement as Statement & { remindersStopped?: boolean }).remindersStopped === true;
}

export function manualRemindersSent(statement: Statement): number {
  return (statement as Statement & { manualRemindersSent?: number }).manualRemindersSent ?? 0;
}

export function mailTarget(
  ctx: Pick<BookContextValue, 'names' | 'view'>,
  statement: Statement,
  miner: MinerRow,
  balance: { amountDue: number; carried: number }
): StatementToMail {
  return {
    statementId: statement.id,
    recipientId: miner.mainCharacterId,
    recipientName: ctx.names.character(miner.mainCharacterId),
    amountDue: balance.amountDue,
    carried: balance.carried,
    periodLabel: periodLabel(statement.periodStart, statement.periodEnd),
    code: statement.code,
    dueDate: addDays(statement.issuedAt.slice(0, 10), ctx.view.input.overdueDays),
    lines: statement.lines,
  };
}

/** The corporation's name as already loaded elsewhere; never fetched here. */
export function useCorporationName(): string {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  return (
    usePublicInfo((s) => (characterId === null ? null : s.byCharacterId[characterId]))
      ?.corporationName ?? ''
  );
}

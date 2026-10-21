/**
 * The seam between the Statements tab and the mail queue (#4064): turns an
 * issued Statement into what `enqueueStatements`/`enqueueReminder` need. The
 * queue itself (pacing, 520 waits, the chip) is #4064's; nothing here
 * duplicates it.
 */
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { usePublicInfo } from '@/stores/publicInfo';
import { useEntityName } from '@/features/character/useEntityName';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { StatementToMail } from '@/features/corpTaxBook/mailQueue';
import { addDays, periodLabel, refineryPlaceholder } from './moonsFormat';
import type { BookContextValue } from './bookContextValue';
import { useBook } from './useBook';

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

/**
 * The refinery names an issued Statement carries, for a guest's verify page that cannot look them
 * up. A refinery whose name is unknown is left out: the verify page shows its own placeholder.
 */
export function statementRefineryNames(
  statement: Pick<Statement, 'lines'>,
  names: Pick<BookContextValue['names'], 'refinery'>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { structureId } of statement.lines) {
    if (!structureId) continue;
    const name = names.refinery(structureId);
    if (name.trim() !== '' && name !== refineryPlaceholder(structureId))
      out[String(structureId)] = name;
  }
  return out;
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

/**
 * The book's corporation name, or null while it is unknown. Prefers the public
 * info already loaded for the active character when it is for this book's
 * corporation, else resolves the book's `corporationId` itself, so a mail or a
 * stored Statement never carries a blank name when no other page loaded it.
 */
export function useCorporationName(): string | null {
  const { corporationId } = useBook();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const info = usePublicInfo((s) => (characterId === null ? null : s.byCharacterId[characterId]));
  const known = info?.corporationId === corporationId ? info.corporationName : null;
  const resolved = useEntityName(known ? undefined : corporationId);
  return known || resolved || null;
}

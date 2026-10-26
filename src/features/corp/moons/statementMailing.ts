/**
 * The seam between the Statements tab and the mail queue (#4064): turns an
 * issued Statement into what `enqueueStatements`/`enqueueReminder` need. The
 * queue itself (pacing, 520 waits, the chip) is #4064's; nothing here
 * duplicates it.
 */
import { useTranslation } from 'react-i18next';
import { oldestUnsettled } from '@/engine/corpTaxBook/bookSections';
import { minerDetail, type MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { usePublicInfo } from '@/stores/publicInfo';
import { useEntityName } from '@/features/character/useEntityName';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { reminderAllowed } from '@/engine/corpTaxBook/mailQueue';
import type { StatementToMail } from '@/features/corpTaxBook/mailQueue';
import { addDays, periodLabel, refineryPlaceholder } from './moonsFormat';
import type { BookContextValue } from './bookContextValue';
import { useBook } from './useBook';

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

/** The Statement a Miner owes first: the oldest one not yet settled. */
export function oldestOpenStatement(view: BookContextValue['view'], minerId: string) {
  const inner = view.internals.byMiner.get(minerId);
  return oldestUnsettled(
    minerDetail(view, minerId)?.statements ?? [],
    (id) => inner?.allocation.byStatement.get(id)?.settled === true
  );
}

/**
 * "Send reminder" for one Miner, as the Miner's page and the Miners row menu both offer it:
 * `block` is why it cannot be sent (null when it can) and `send` queues the mail for the Miner's
 * oldest unsettled Statement (named in the notice), then reports the outcome through `onNotice` and reloads the book.
 * With `statementId` (a Statement row) it targets that Statement instead, blocked once it is
 * settled or its one officer reminder is sent (D27).
 */
export function useMinerReminder(
  minerId: string,
  onNotice: (text: string) => void,
  statementId?: string
) {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, corporationId, characterId } = ctx;
  const corporationName = useCorporationName();
  const detail = minerDetail(view, minerId);
  const settledOf = (id: string) =>
    view.internals.byMiner.get(minerId)?.allocation.byStatement.get(id)?.settled === true;
  const openStatement = statementId
    ? detail?.statements.find((s) => s.id === statementId)
    : oldestOpenStatement(view, minerId);
  const blockReason = () => {
    if (!openStatement) {
      return t(
        detail && detail.row.owed > 0
          ? 'corpTaxBook.moons.miner.remindNone'
          : 'corpTaxBook.moons.miner.remindNothingOwed'
      );
    }
    if (statementId) {
      if (settledOf(openStatement.id)) return t('corpTaxBook.moons.statementPeriod.alreadyPaid');
      const capped = !reminderAllowed({
        remindersStopped: openStatement.remindersStopped === true,
        manualRemindersSent: openStatement.manualRemindersSent ?? 0,
      });
      if (capped) return t('corpTaxBook.moons.statementPeriod.reminderCap');
    }
    return corporationName === null ? t('corpTaxBook.moons.run.loadingCorporation') : null;
  };
  const block = blockReason();

  const send = async () => {
    if (block || !detail || !openStatement || corporationName === null) return;
    const { enqueueReminder } = await import('@/features/corpTaxBook/mailQueue');
    const result = await enqueueReminder({
      corporationId,
      corporationName,
      senderCharacterId: characterId,
      refineryName: (sid) => names.refinery(sid),
      statement: mailTarget(ctx, openStatement, detail.row, {
        amountDue: statementId
          ? (view.internals.byMiner.get(minerId)?.allocation.byStatement.get(statementId)
              ?.remaining ?? detail.row.owed)
          : detail.row.owed,
        carried: 0,
      }),
      remindersStopped: openStatement.remindersStopped === true,
      manualRemindersSent: openStatement.manualRemindersSent ?? 0,
    });
    onNotice(
      result.ok
        ? t('corpTaxBook.moons.needs.reminderQueuedFor', {
            name: names.character(detail.row.mainCharacterId),
            period: periodLabel(openStatement.periodStart, openStatement.periodEnd),
          })
        : t(`corpTaxBook.moons.needs.reminderRefused.${result.reason}`)
    );
    ctx.reload();
  };
  return { block, send };
}

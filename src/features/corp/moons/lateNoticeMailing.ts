/**
 * The seam between the late notice run and the mail queue (#4064): turns a late notice into what
 * `enqueueLateNotices`/`enqueueReminder` need. The queue itself (pacing, 520 waits, the chip) is
 * #4064's; nothing here duplicates it.
 */
import { useTranslation } from 'react-i18next';
import { useTimeZone } from '@/lib/timeFormat';
import { oldestUnsettled } from '@/engine/corpTaxBook/bookSections';
import { minerDetail, type MinerRow } from '@/engine/corpTaxBook/bookView';
import { owedDays } from '@/engine/corpTaxBook/lateNotices';
import { usePublicInfo } from '@/stores/publicInfo';
import { useEntityName } from '@/features/character/useEntityName';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { reminderAllowed } from '@/engine/corpTaxBook/mailQueue';
import type { LateNoticeToMail } from '@/features/corpTaxBook/mailQueue';
import { minerPaymentCode, type LateNotice } from '../../../../functions/src/corpTaxBookLateNotice';
import { atDate, isRefineryPlaceholder } from './moonsFormat';
import type { BookContextValue } from './bookContextValue';
import { useBook } from './useBook';
import i18n from '@/i18n';
import { corpPayAccounts } from '@/features/miningTax/corpBook/corpPayAccount';

/**
 * The refinery names a late notice carries, for a guest's verify page that cannot look them up. A
 * refinery whose name is unknown is left out: the verify page shows its own placeholder.
 */
export function noticeRefineryNames(
  notice: Pick<LateNotice, 'lines'>,
  names: Pick<BookContextValue['names'], 'refinery'>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { structureId } of notice.lines) {
    if (!structureId) continue;
    const name = names.refinery(structureId);
    if (name.trim() !== '' && !isRefineryPlaceholder(name, structureId))
      out[String(structureId)] = name;
  }
  return out;
}

/**
 * Who a Miner's mail goes to: its main when that is in the corporation, else the lowest-id group
 * member that is, and a character outside the corporation only when none of the group is in it
 * (or membership is unknown). A character in no group is its own recipient.
 */
export function mailRecipientOf(
  miner: Pick<MinerRow, 'mainCharacterId' | 'characterIds'>,
  memberIds: ReadonlySet<number> | undefined
): number {
  if (!memberIds || memberIds.has(miner.mainCharacterId)) return miner.mainCharacterId;
  const inCorp = miner.characterIds.filter((id) => memberIds.has(id)).sort((a, b) => a - b);
  return inCorp[0] ?? miner.mainCharacterId;
}

/**
 * A late notice's mail: every day the Miner owes now, oldest first, by moon (else refinery), the
 * total owed and the Miner's Reason code (`minerPaymentCode`).
 */
export function mailTarget(
  ctx: Pick<BookContextValue, 'names' | 'view'> & Partial<Pick<BookContextValue, 'settings'>>,
  notice: Pick<LateNotice, 'id'>,
  miner: Pick<MinerRow, 'id' | 'mainCharacterId' | 'characterIds' | 'owed' | 'account'>
): LateNoticeToMail {
  const recipientId = mailRecipientOf(miner, ctx.view.input.memberIds);
  const days = owedDays(ctx.view, miner.id).map((d) => ({
    date: d.date,
    place: d.correction
      ? i18n.t('corpTaxBook.verify.correction')
      : d.moonId !== undefined
        ? ctx.names.moon(d.moonId)
        : d.structureId !== undefined
          ? ctx.names.refinery(d.structureId)
          : '—',
    tax: d.owed,
  }));
  return {
    noticeId: notice.id,
    recipientId,
    recipientName: ctx.names.character(recipientId),
    amountDue: miner.owed,
    code: minerPaymentCode(miner.id),
    // The wallet divisions the book reads: a donation into another one is never credited (#6204).
    // An older settings doc (or a fixture) may carry none: then the mail names none.
    ...(ctx.settings?.divisions?.length
      ? {
          accounts: corpPayAccounts(ctx.settings.divisions, ctx.settings.divisionNames, i18n.t),
        }
      : {}),
    days,
    oldest: miner.account.owes?.oldest ?? days[0]?.date ?? '',
  };
}

/**
 * The book's corporation name, or null while it is unknown. Prefers the public
 * info already loaded for the active character when it is for this book's
 * corporation, else resolves the book's `corporationId` itself, so a mail or a
 * stored notice never carries a blank name when no other page loaded it.
 */
export function useCorporationName(): string | null {
  const { corporationId } = useBook();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const info = usePublicInfo((s) => (characterId === null ? null : s.byCharacterId[characterId]));
  const known = info?.corporationId === corporationId ? info.corporationName : null;
  const resolved = useEntityName(known ? undefined : corporationId);
  return known || resolved || null;
}

/** Whether a late notice's days are all paid, read off its Miner's Running account. */
export function noticeSettled(view: BookContextValue['view'], notice: LateNotice): boolean {
  return view.internals.byMiner.get(notice.minerId)?.account.standingOf(notice).settled === true;
}

/** The late notice a Miner is reminded of: the oldest one whose days are not all paid. */
export function oldestOpenNotice(view: BookContextValue['view'], minerId: string) {
  return oldestUnsettled(view.internals.byMiner.get(minerId)?.notices ?? [], (id) => {
    const notice = view.input.notices.find((n) => n.id === id);
    return !notice || noticeSettled(view, notice);
  });
}

/**
 * "Send reminder" for one Miner, as the Miner's page and the Miners row menu both offer it:
 * `block` is why it cannot be sent (null when it can) and `send` queues the mail of the Miner's
 * oldest open late notice, then reports the outcome through `onNotice` and reloads the book.
 * With `noticeId` (a notice row) it reminds of that notice instead, blocked once its days are
 * paid or its one officer reminder is sent (D27).
 */
export function useMinerReminder(
  minerId: string,
  onNotice: (text: string) => void,
  noticeId?: string
) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, corporationId, characterId } = ctx;
  const corporationName = useCorporationName();
  const detail = minerDetail(view, minerId);
  const notice = noticeId
    ? detail?.notices.find((n) => n.id === noticeId)
    : oldestOpenNotice(view, minerId);
  const blockReason = () => {
    if (!notice) {
      return t(
        detail && detail.row.owed > 0
          ? 'corpTaxBook.moons.miner.remindNone'
          : 'corpTaxBook.moons.miner.remindNothingOwed'
      );
    }
    if (noticeId) {
      if (noticeSettled(view, notice)) return t('corpTaxBook.moons.noticePanel.alreadyPaid');
      const capped = !reminderAllowed({
        remindersStopped: notice.mail.remindersStopped,
        manualRemindersSent: notice.mail.manualSent,
      });
      if (capped) return t('corpTaxBook.moons.noticePanel.reminderCap');
    }
    return corporationName === null ? t('corpTaxBook.moons.run.loadingCorporation') : null;
  };
  const block = blockReason();

  const send = async () => {
    if (block || !detail || !notice || corporationName === null) return;
    const { enqueueReminder } = await import('@/features/corpTaxBook/mailQueue');
    const result = await enqueueReminder({
      corporationId,
      corporationName,
      senderCharacterId: characterId,
      notice: mailTarget(ctx, notice, detail.row),
      remindersStopped: notice.mail.remindersStopped,
      manualRemindersSent: notice.mail.manualSent,
    });
    onNotice(
      result.ok
        ? t('corpTaxBook.moons.needs.reminderQueuedFor', {
            name: names.character(detail.row.mainCharacterId),
            date: atDate(notice.issuedAt, zone),
          })
        : t(`corpTaxBook.moons.needs.reminderRefused.${result.reason}`)
    );
    ctx.reload();
  };
  return { block, send };
}

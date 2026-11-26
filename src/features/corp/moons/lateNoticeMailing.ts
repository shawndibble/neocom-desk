import { useTranslation } from 'react-i18next';
import { useTimeZone } from '@/lib/timeFormat';
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

export function mailRecipientOf(
  miner: Pick<MinerRow, 'mainCharacterId' | 'characterIds'>,
  memberIds: ReadonlySet<number> | undefined
): number {
  if (!memberIds || memberIds.has(miner.mainCharacterId)) return miner.mainCharacterId;
  const inCorp = miner.characterIds.filter((id) => memberIds.has(id)).sort((a, b) => a - b);
  return inCorp[0] ?? miner.mainCharacterId;
}

export function mailTarget(
  ctx: Pick<BookContextValue, 'names' | 'view'> & Partial<Pick<BookContextValue, 'settings'>>,
  notice: Pick<LateNotice, 'id'>,
  miner: Pick<MinerRow, 'id' | 'mainCharacterId' | 'characterIds' | 'owed'>
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
    ...(ctx.settings?.divisions?.length
      ? {
          accounts: corpPayAccounts(ctx.settings.divisions, ctx.settings.divisionNames, i18n.t),
        }
      : {}),
    days,
    oldest: ctx.view.internals.byMiner.get(miner.id)?.account.owes?.oldest ?? days[0]?.date ?? '',
  };
}

export function useCorporationName(): string | null {
  const { corporationId } = useBook();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const info = usePublicInfo((s) => (characterId === null ? null : s.byCharacterId[characterId]));
  const known = info?.corporationId === corporationId ? info.corporationName : null;
  const resolved = useEntityName(known ? undefined : corporationId);
  return known || resolved || null;
}

export function noticeSettled(view: BookContextValue['view'], notice: LateNotice): boolean {
  return view.internals.byMiner.get(notice.minerId)?.account.standingOf(notice).settled === true;
}

export function oldestOpenNotice(view: BookContextValue['view'], minerId: string) {
  const inner = view.internals.byMiner.get(minerId);
  return [...(inner?.notices ?? [])]
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt))
    .find((n) => !inner!.account.standingOf(n).settled);
}

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
      const capped = !reminderAllowed(notice.mail);
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

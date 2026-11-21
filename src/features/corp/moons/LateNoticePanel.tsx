import { useState, type ReactNode } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SlideOver, StatChip, StatChips, textActionClassName } from '@/components/ui';
import { noticeDetail, type NoticeDetail } from '@/engine/corpTaxBook/bookView';
import type { VerifyPayloadLine } from '@/engine/corpTaxBook/verifyView';
import { NoticeLines } from '@/features/corpTaxBook/NoticeLines';
import { writeToClipboard } from '@/lib/clipboard';
import { readVerifyTokens, verifyUrl } from '../taxBook/bookClient';
import { minerPaymentCode } from '../../../../functions/src/corpTaxBookLateNotice';
import { useBook } from './useBook';
import {
  type ClockZone,
  atDate,
  atDateWithYear,
  dateTimeAt,
  isk,
  iskOrDash,
  shortDate,
} from './moonsFormat';
import { DueWord } from './moonsParts';
import { minerPath } from './moonsPaths';

const k = (key: string) => `corpTaxBook.moons.noticePanel.${key}`;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Mail state from what the book recorded; who a mail went to and whether it was read are not stored. */
function mailText(
  d: NoticeDetail,
  t: (key: string, opts?: Record<string, unknown>) => string,
  zone: ClockZone
) {
  const { mail } = d.notice;
  const parts = [
    mail.sent === 0
      ? t(k('notMailed'))
      : mail.lastAt
        ? t(k('mailedLast'), {
            what: t(k('mailed'), { count: mail.sent }),
            date: dateTimeAt(mail.lastAt, zone),
          })
        : t(k('mailed'), { count: mail.sent }),
  ];
  if (mail.manualSent > 0) parts.push(t(k('manualReminders'), { count: mail.manualSent }));
  if (mail.remindersStopped) parts.push(t(k('stopped')));
  return parts.join(' · ');
}

type CopyState = 'idle' | 'copied' | 'failed';

/** Officers only: reads the verify token on click, never earlier, and copies the link. */
function CopyVerifyLink({ noticeId }: { noticeId: string }) {
  const { t } = useTranslation();
  const { characterId, corporationId } = useBook();
  const [state, setState] = useState<CopyState>('idle');
  const copy = async () => {
    try {
      const token = (await readVerifyTokens(characterId, corporationId, [noticeId])).get(noticeId);
      if (!token) throw new Error('no verify link');
      await writeToClipboard(verifyUrl(window.location.origin, token));
      setState('copied');
    } catch {
      setState('failed');
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={textActionClassName()} onClick={() => void copy()}>
        {t(k('copyLink'))}
      </button>
      <span role="status" className="text-xs text-text-dim">
        {state === 'copied' && t(k('copied'))}
        {state === 'failed' && <span className="text-danger">{t(k('copyFailed'))}</span>}
      </span>
    </span>
  );
}

/**
 * One Miner's late notice in a side panel (#5286): the verify page's lines, with what its days
 * stand at on the Miner's Running account and the mail state. No Stop reminders box and no link
 * to the verify page: both act as the Miner. A notice takes no payment of its own.
 */
export function LateNoticePanel({
  noticeId,
  onClose,
  showMinerLink = true,
}: {
  noticeId: string;
  onClose: () => void;
  /** False on the Miner's own page, where the link would lead back to it. */
  showMinerLink?: boolean;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { view, names, canEdit } = useBook();
  const detail = noticeDetail(view, noticeId);
  if (!detail) return null;
  const { notice } = detail;
  const miner = view.miners.find((m) => m.id === notice.minerId);
  const name = miner ? names.character(miner.mainCharacterId) : notice.minerId;
  const structureIds = [
    ...new Set(notice.lines.flatMap((l) => (l.structureId === undefined ? [] : [l.structureId]))),
  ];
  const refineryNames = Object.fromEntries(
    structureIds.map((id) => [String(id), names.refinery(id)])
  );
  const credited = detail.paid - detail.forgiven - detail.writtenOff;
  const first = notice.lines[0]?.date ?? notice.issuedAt.slice(0, 10);
  const last = notice.lines.at(-1)?.date ?? first;
  const pricing = notice.pricing ?? { hubId: view.input.hubId, oreForm: view.input.oreForm };
  return (
    <SlideOver
      open
      onClose={onClose}
      closeOnBack={false}
      title={name}
      subtitle={t(k('subtitle'), { date: atDate(notice.issuedAt, zone) })}
      returnFocusFallback={() =>
        document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(noticeId)}"]`)
      }
    >
      <div className="space-y-4">
        <StatChips>
          <StatChip
            label={t(k('remaining'))}
            value={isk(detail.outstanding)}
            tone={detail.outstanding > 0 ? 'danger' : 'success'}
            emphasis
          />
        </StatChips>
        <dl className="space-y-1">
          <Fact label={t(k('credited'))}>{iskOrDash(credited)}</Fact>
          {detail.forgiven > 0 && <Fact label={t(k('forgiven'))}>{isk(detail.forgiven)}</Fact>}
          {detail.writtenOff > 0 && (
            <Fact label={t(k('writtenOff'))}>{isk(detail.writtenOff)}</Fact>
          )}
          <Fact label={t(k('issued'))}>
            {atDateWithYear(notice.issuedAt, zone)}
            {notice.issuedBy !== undefined && (
              <span className="block text-xs text-text-dim">
                {t(k('issuedBy'), { name: names.character(notice.issuedBy) })}
              </span>
            )}
          </Fact>
          <Fact label={t(k('covers'))}>
            {t(k('coversRange'), {
              from: shortDate(first),
              through: `${shortDate(last)} ${last.slice(0, 4)}`,
              count: notice.lines.length,
            })}
          </Fact>
          <Fact label={t(k('due'))}>
            {detail.settled ? (
              t(k('paid'))
            ) : detail.state === 'paused' && detail.pausedUntil ? (
              t(k('paused'), { date: atDate(detail.pausedUntil, zone) })
            ) : (
              <DueWord dueAt={detail.dueAt} now={view.input.now} />
            )}
          </Fact>
          <Fact label={t(k('mail'))}>{mailText(detail, t, zone)}</Fact>
          {/* The Miner's one code, which the mail asks for; an older notice's own still matches. */}
          <Fact label={t(k('code'))}>
            <span className="font-mono">{minerPaymentCode(notice.minerId)}</span>
          </Fact>
        </dl>
        <NoticeLines
          notice={{
            ...pricing,
            // Each line's price sources were the book's own tiers when it was priced.
            lines: notice.lines as unknown as readonly VerifyPayloadLine[],
            amount: notice.listed,
            refineryNames,
          }}
          formatDate={shortDate}
        />
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {canEdit && <CopyVerifyLink noticeId={notice.id} />}
          {showMinerLink && (
            <Link to={minerPath(notice.minerId)} className={textActionClassName()}>
              {t(k('openMiner'))}
            </Link>
          )}
        </p>
      </div>
    </SlideOver>
  );
}

import { useState, type ReactNode } from 'react';
import { DAY_MS } from '@/lib/age';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SlideOver, StatChip, StatChips, textActionClassName } from '@/components/ui';
import { statementDetail, type StatementDetail } from '@/engine/corpTaxBook/bookView';
import { StatementLines, StatementPayments } from '@/features/corpTaxBook/StatementBody';
import { writeToClipboard } from '@/lib/clipboard';
import { readVerifyTokens, verifyUrl } from '../taxBook/bookClient';
import { useBook } from './useBook';
import { dateTimeUtc, dateWithYear, isk, iskOrDash, periodLabel, shortDate } from './moonsFormat';
import { DueWord } from './moonsParts';
import { minerPath } from './moonsPaths';

const k = (key: string) => `corpTaxBook.moons.statementPanel.${key}`;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Mail state from what the book recorded; who a mail went to and whether it was read are not stored. */
function mailText(d: StatementDetail, t: (key: string, opts?: Record<string, unknown>) => string) {
  const { statement } = d;
  const sent = statement.mailsSent ?? 0;
  const parts = [
    sent === 0
      ? t('corpTaxBook.moons.statementPeriod.notMailed')
      : statement.lastMailedAt
        ? t(k('mailedLast'), {
            what: t(k('mailed'), { count: sent }),
            date: dateTimeUtc(statement.lastMailedAt),
          })
        : t(k('mailed'), { count: sent }),
  ];
  const manual = statement.manualRemindersSent ?? 0;
  if (manual > 0) parts.push(t(k('manualReminders'), { count: manual }));
  if (statement.remindersStopped) parts.push(t(k('stopped')));
  return parts.join(' · ');
}

type CopyState = 'idle' | 'copied' | 'failed';

/** Officers only: reads the verify token on click, never earlier, and copies the link. */
function CopyVerifyLink({ statementId }: { statementId: string }) {
  const { t } = useTranslation();
  const { characterId, corporationId } = useBook();
  const [state, setState] = useState<CopyState>('idle');
  const copy = async () => {
    try {
      const token = (await readVerifyTokens(characterId, corporationId, [statementId])).get(
        statementId
      );
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
 * One Miner's Statement in a side panel (#5286): the verify page's lines and
 * payments, with the figures an officer checks and the mail state. No Stop
 * reminders box and no link to the verify page: both act as the Miner.
 */
export function StatementPanel({
  statementId,
  onClose,
  showMinerLink = true,
}: {
  statementId: string;
  onClose: () => void;
  /** False on the Miner's own page, where the link would lead back to it. */
  showMinerLink?: boolean;
}) {
  const { t } = useTranslation();
  const { view, names, canEdit } = useBook();
  const detail = statementDetail(view, statementId);
  if (!detail) return null;
  const { statement } = detail;
  const miner = view.miners.find((m) => m.id === statement.minerId);
  const name = miner ? names.character(miner.mainCharacterId) : statement.minerId;
  const structureIds = [
    ...new Set(
      statement.lines.flatMap((l) => (l.structureId === undefined ? [] : [l.structureId]))
    ),
  ];
  const refineryNames = Object.fromEntries(
    structureIds.map((id) => [String(id), names.refinery(id)])
  );
  const credited = detail.credited - detail.forgiven;
  const days =
    Math.round((Date.parse(statement.coversThrough) - Date.parse(statement.coversFrom)) / DAY_MS) +
    1;
  const sameYear = statement.coversFrom.slice(0, 4) === statement.coversThrough.slice(0, 4);
  return (
    <SlideOver
      open
      onClose={onClose}
      closeOnBack={false}
      title={name}
      subtitle={t(k('subtitle'), {
        period: periodLabel(statement.periodStart, statement.periodEnd),
      })}
      returnFocusFallback={() =>
        document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(statementId)}"]`)
      }
    >
      <div className="space-y-4">
        <StatChips>
          <StatChip
            label={t(k('remaining'))}
            value={isk(detail.remaining)}
            tone={detail.remaining > 0 ? 'danger' : 'success'}
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
            {dateWithYear(statement.issuedAt)}
            {statement.issuedBy !== undefined && (
              <span className="block text-xs text-text-dim">
                {t(k('issuedBy'), { name: names.character(statement.issuedBy) })}
              </span>
            )}
          </Fact>
          <Fact label={t(k('covers'))}>
            {t(k('coversRange'), {
              from: sameYear
                ? shortDate(statement.coversFrom)
                : `${shortDate(statement.coversFrom)} ${statement.coversFrom.slice(0, 4)}`,
              through: `${shortDate(statement.coversThrough)} ${statement.coversThrough.slice(0, 4)}`,
              count: days,
            })}
          </Fact>
          <Fact label={t(k('due'))}>
            {detail.settled ? (
              t(k('paid'))
            ) : detail.state === 'paused' && detail.pausedUntil ? (
              t(k('paused'), { date: shortDate(detail.pausedUntil) })
            ) : (
              <DueWord dueAt={detail.dueAt} now={view.input.now} />
            )}
          </Fact>
          <Fact label={t(k('mail'))}>{mailText(detail, t)}</Fact>
          <Fact label={t(k('code'))}>
            <span className="font-mono">{statement.code}</span>
          </Fact>
        </dl>
        <StatementLines statement={{ ...statement, refineryNames }} formatDate={shortDate} />
        <StatementPayments payments={detail.payments} formatDate={shortDate} />
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {canEdit && <CopyVerifyLink statementId={statement.id} />}
          {showMinerLink && (
            <Link to={minerPath(statement.minerId)} className={textActionClassName()}>
              {t(k('openMiner'))}
            </Link>
          )}
        </p>
      </div>
    </SlideOver>
  );
}

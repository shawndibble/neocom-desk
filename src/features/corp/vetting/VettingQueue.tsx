import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  DisabledMenuItem,
  EmptyState,
  MenuItem,
  Panel,
  RowActionsMenu,
  type DataTableColumn,
} from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import type { VettingReviewSummary } from '@/engine/vetting';
import { formatAge } from '@/lib/age';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
import { requestMailCooldown } from './vettingRequestMail';
import { reviewKindLabel } from './vettingText';
import { needsYours, reviewResult } from './vettingView';

/** A review's result in words (`reviewResult`): flags, nothing found, incomplete, or where it stands. */
export function VettingResultPill({ review }: { review: VettingReviewSummary }) {
  const { t } = useTranslation();
  const { result, tone } = reviewResult(review);
  return (
    <Pill tone={tone}>
      {result === 'flags'
        ? t('vetting.result.flags', { count: review.flags })
        : t(`vetting.result.${result}`)}
    </Pill>
  );
}

interface VettingQueueProps {
  /** Which list: reviews waiting on a sign-off or the pilot, or the ones that are over. */
  tab: 'open' | 'decided';
  rows: readonly VettingReviewSummary[];
  /** Opens a review's report. */
  onOpen: (review: VettingReviewSummary) => void;
  /**
   * A request's row menu: mail the member the link, or copy it. Absent (a reviewer who cannot
   * act on requests): a waiting row has no menu.
   */
  /** The signed-in reviewer: only the officer who asked may mail, so others get no menu. */
  reviewerId?: number;
  onRequestMail?: (review: VettingReviewSummary) => void;
  onCopyRequestLink?: (review: VettingReviewSummary) => void;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

/**
 * One row per pilot: who, what for, the result in words, sign-offs with "Yours needed". A row
 * click opens the report; there is no Accept or Reject here, because a decision needs it read.
 */
export function VettingQueue({
  tab,
  rows,
  onOpen,
  reviewerId,
  onRequestMail,
  onCopyRequestLink,
}: VettingQueueProps) {
  const { t } = useTranslation();
  const now = useNow();
  const phone = useIsPhone();
  const timeZone = useTimeZone();
  const columns = useMemo<DataTableColumn<VettingReviewSummary>[]>(() => {
    const list: DataTableColumn<VettingReviewSummary>[] = [
      {
        id: 'pilot',
        header: t('vetting.queue.columns.pilot'),
        primary: true,
        render: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <CharacterAvatar characterId={row.pilot.characterId} size="sm" loading="lazy" />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-accent">{row.pilot.name}</span>
              <span className="block truncate text-xs text-text-dim">
                {row.pilot.corporationName}
              </span>
            </span>
          </span>
        ),
      },
      {
        id: 'kind',
        header: t('vetting.queue.columns.for'),
        // Where an application came from, under what it is for. A phone's dense card runs its
        // cells into one line, so nothing here may be a block there.
        render: (row) =>
          row.invite === undefined ? (
            reviewKindLabel(row, t)
          ) : (
            <span className={phone ? undefined : 'block'}>
              {reviewKindLabel(row, t)}
              <span className={phone ? 'text-text-dim' : 'block text-xs text-text-dim'}>
                {phone && ' · '}
                {t('vetting.queue.invite', { label: row.invite })}
              </span>
            </span>
          ),
      },
      {
        id: 'characters',
        header: t('vetting.queue.columns.characters'),
        align: 'right',
        // Dropped from md to xl so the queue fits its panel at 1024 (#6643).
        className: 'tabular-nums max-xl:md:hidden',
        headerClassName: 'max-xl:md:hidden',
        // A bare count means nothing in a card's meta line; the report lists them.
        phoneHidden: true,
        render: (row) =>
          row.characters > 0 ? row.characters : <span className="text-text-faint">-</span>,
      },
      {
        id: 'result',
        header: t('vetting.queue.columns.result'),
        cardCorner: true,
        render: (row) =>
          row.state === 'requested' ? (
            <Pill>{t('vetting.requestRow.waitingFor', { name: firstName(row.pilot.name) })}</Pill>
          ) : (
            <VettingResultPill review={row} />
          ),
      },
    ];
    if (tab === 'open') {
      list.push(
        {
          id: 'signoffs',
          header: t('vetting.queue.columns.signOffs'),
          className: 'whitespace-nowrap tabular-nums',
          // A phone's dense card runs its cells into one line, so nothing here may be a block.
          render: (row) => (
            <span className={phone ? undefined : 'block'}>
              {t(phone ? 'vetting.queue.signedPhone' : 'vetting.queue.signed', {
                signed: row.signed,
                needed: row.needed,
              })}
              {needsYours(row) && (
                <span className={phone ? 'text-warning' : 'block text-xs text-warning'}>
                  {phone && ' · '}
                  {t('vetting.queue.yoursNeeded')}
                </span>
              )}
            </span>
          ),
        },
        {
          id: 'read',
          header: t('vetting.queue.columns.read'),
          align: 'right',
          className: 'whitespace-nowrap text-text-dim tabular-nums',
          render: (row) => {
            if (row.readAt !== null) return formatAge(Math.max(0, now - row.readAt), t);
            const age = formatAge(Math.max(0, now - row.createdAt), t);
            if (row.state !== 'requested') return t('vetting.queue.asked', { age });
            return (
              <span className={phone ? undefined : 'block'}>
                {row.requestedBy
                  ? t('vetting.requestRow.askedBy', { age, name: row.requestedBy.name })
                  : t('vetting.requestRow.asked', { age })}
                <span
                  className={
                    row.requestMail
                      ? phone
                        ? undefined
                        : 'block text-xs'
                      : phone
                        ? 'text-warning'
                        : 'block text-xs text-warning'
                  }
                >
                  {phone && ' · '}
                  {row.requestMail
                    ? t('vetting.requestRow.mailSent', {
                        age: formatAge(Math.max(0, now - row.requestMail.sentAt), t),
                      })
                    : t('vetting.requestRow.mailNone')}
                </span>
              </span>
            );
          },
        }
      );
    } else {
      list.push(
        {
          id: 'outcome',
          header: t('vetting.queue.columns.outcome'),
          render: (row) => t(`vetting.status.state.${row.state}`),
        },
        {
          id: 'decided',
          header: t('vetting.queue.columns.decided'),
          align: 'right',
          className: 'whitespace-nowrap text-text-dim tabular-nums',
          render: (row) =>
            row.decidedAt !== null ? formatDateOnly(new Date(row.decidedAt), timeZone) : '-',
        }
      );
    }
    return list;
  }, [t, tab, now, timeZone, phone]);

  const rowMenu = (row: VettingReviewSummary, tr: React.ReactElement) => {
    // Copy link alone is one action: a non-asker's row has no menu (the row click opens it).
    if (
      row.state !== 'requested' ||
      !onRequestMail ||
      !onCopyRequestLink ||
      row.requestedBy?.characterId !== reviewerId
    ) {
      return tr;
    }
    const name = firstName(row.pilot.name);
    const wait = requestMailCooldown(row.requestMail, now);
    const waitReason = row.requestMail
      ? t('vetting.requestRow.resendWait', {
          age: formatAge(Math.max(0, now - row.requestMail.sentAt), t),
        })
      : '';
    return (
      <RowActionsMenu
        name={row.pilot.name}
        items={
          <>
            {wait ? (
              <DisabledMenuItem reason={waitReason}>
                <span>
                  {t('vetting.requestRow.resend', { name })}
                  <span className="block text-xs text-text-dim">{waitReason}</span>
                </span>
              </DisabledMenuItem>
            ) : (
              <MenuItem onSelect={() => onRequestMail(row)}>
                {t(row.requestMail ? 'vetting.requestRow.resend' : 'vetting.requestRow.send', {
                  name,
                })}
              </MenuItem>
            )}
            <MenuItem onSelect={() => onCopyRequestLink(row)}>
              {t('vetting.requestRow.copyLink')}
            </MenuItem>
          </>
        }
      >
        {tr}
      </RowActionsMenu>
    );
  };

  if (rows.length === 0) {
    return (
      <Panel title={t(`vetting.queue.title.${tab}`)}>
        <EmptyState
          title={t(`vetting.queue.empty.${tab}.title`)}
          hint={t(`vetting.queue.empty.${tab}.hint`)}
        />
      </Panel>
    );
  }
  return (
    <Panel padded={false} title={t(`vetting.queue.title.${tab}`)}>
      <DataTable
        label={t(`vetting.queue.label.${tab}`)}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={onOpen}
        rowContextMenu={onRequestMail ? rowMenu : undefined}
        rowMoreActions={onRequestMail !== undefined}
        stackLayout={phone ? 'dense' : 'labelled'}
      />
    </Panel>
  );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, Panel, type DataTableColumn } from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import type { VettingReviewSummary } from '@/engine/vetting';
import { formatAge } from '@/lib/age';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
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
}

/**
 * One row per pilot: who, what for, the result in words, sign-offs with "Yours needed". A row
 * click opens the report; there is no Accept or Reject here, because a decision needs it read.
 */
export function VettingQueue({ tab, rows, onOpen }: VettingQueueProps) {
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
              <span
                className={
                  row.state === 'requested'
                    ? 'block truncate font-semibold'
                    : 'block truncate font-semibold text-accent'
                }
              >
                {row.pilot.name}
              </span>
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
        className: 'tabular-nums',
        // A bare count means nothing in a card's meta line; the report lists them.
        phoneHidden: true,
        render: (row) =>
          row.characters > 0 ? row.characters : <span className="text-text-faint">-</span>,
      },
      {
        id: 'result',
        header: t('vetting.queue.columns.result'),
        cardCorner: true,
        render: (row) => <VettingResultPill review={row} />,
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
          render: (row) =>
            row.readAt !== null
              ? formatAge(Math.max(0, now - row.readAt), t)
              : t('vetting.queue.asked', {
                  age: formatAge(Math.max(0, now - row.createdAt), t),
                }),
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
        // A request the pilot has not answered has no report to open.
        rowClickable={(row) => row.state !== 'requested'}
        stackLayout={phone ? 'dense' : 'labelled'}
      />
    </Panel>
  );
}

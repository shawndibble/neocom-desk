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
  tab: 'open' | 'decided';
  rows: readonly VettingReviewSummary[];
  onOpen: (review: VettingReviewSummary) => void;
  reviewerId?: number;
  onRequestMail?: (review: VettingReviewSummary) => void;
  onCopyRequestLink?: (review: VettingReviewSummary) => void;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

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
        className: 'tabular-nums max-xl:md:hidden',
        headerClassName: 'max-xl:md:hidden',
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

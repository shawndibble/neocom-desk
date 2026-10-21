import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button, ProgressBar } from '@/components/ui';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import * as Icon from '@/components/ui/icons';
import {
  displayStatus,
  isStatementMail,
  summarize,
  type DisplayStatus,
  type MailQueueItem,
} from '@/engine/corpTaxBook/mailQueue';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';

const TONE: Record<DisplayStatus, string> = {
  sent: 'text-success',
  sending: 'text-text',
  paused: 'text-warning',
  failed: 'text-danger',
  waiting: 'text-text-dim',
};

/** The queue's one-line summary: counts as words, the ETA while it runs, and a progress bar. */
export function MailQueueSummary({ items, now }: { items: readonly MailQueueItem[]; now: number }) {
  const { t } = useTranslation();
  const s = summarize(items, now);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
        <span className="font-semibold">
          {s.done
            ? t('corpTaxBook.mailQueue.summary.done')
            : t('corpTaxBook.mailQueue.summary.sending', {
                current: s.sent + s.failed + 1,
                total: s.total,
              })}
        </span>
        <span className="text-success">
          {t('corpTaxBook.mailQueue.summary.sent', { count: s.sent })}
        </span>
        {s.paused > 0 && (
          <span className="text-warning">
            {t('corpTaxBook.mailQueue.summary.paused', { count: s.paused })}
          </span>
        )}
        {s.waiting > 0 && (
          <span className="text-text-dim">
            {t('corpTaxBook.mailQueue.summary.waiting', { count: s.waiting })}
          </span>
        )}
        {s.failed > 0 && (
          <span className="text-danger">
            {t('corpTaxBook.mailQueue.summary.failed', { count: s.failed })}
          </span>
        )}
        {!s.done && (
          <span className="text-text-dim">
            {t('corpTaxBook.mailQueue.summary.left', {
              time: t('corpTaxBook.mailQueue.minutes', { count: s.minutesLeft }),
            })}
          </span>
        )}
      </p>
      <ProgressBar
        label={t('corpTaxBook.mailQueue.summary.progressLabel')}
        value={s.sent + s.failed}
        max={Math.max(s.total, 1)}
        size="sm"
        tone={s.done ? (s.failed ? 'warning' : 'success') : 'accent'}
      />
      <p className="text-xs text-text-dim">
        {s.done
          ? t('corpTaxBook.mailQueue.summary.doneNote')
          : t('corpTaxBook.mailQueue.summary.runningNote')}
      </p>
    </div>
  );
}

function failureText(item: MailQueueItem, t: TFunction): string {
  switch (item.failureReason) {
    case 'cspa':
      return t('corpTaxBook.mailQueue.failure.cspa', { name: item.recipientName });
    case 'auth':
      return t('corpTaxBook.mailQueue.failure.auth');
    default:
      return item.failureDetail
        ? t('corpTaxBook.mailQueue.failure.other', { detail: item.failureDetail })
        : t('corpTaxBook.mailQueue.failure.otherNoDetail');
  }
}

export interface MailQueueActions {
  onRetry: (item: MailQueueItem) => void;
  /** Resolves with a short message to show under the row (the outcome of the call). */
  onOpenInEve: (item: MailQueueItem) => Promise<string | null>;
}

/** D16: one row per mail in the send queue. Retry and Open in EVE appear on a failure only. */
export function MailQueueTable({
  items,
  now,
  sendingId,
  onRetry,
  onOpenInEve,
}: { items: readonly MailQueueItem[]; now: number; sendingId?: string } & MailQueueActions) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const columns: DataTableColumn<MailQueueItem>[] = [
    {
      id: 'to',
      header: t('corpTaxBook.mailQueue.table.to'),
      primary: true,
      render: (row) => (
        <span>
          {row.recipientName}
          {row.kind !== 'statement' && (
            <span className="ml-1 text-xs text-text-dim">
              ({t(`corpTaxBook.mailQueue.table.${row.kind}`)})
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      header: t('corpTaxBook.mailQueue.table.statement'),
      align: 'right',
      className: 'tabular-nums',
      phoneHidden: true,
      // Only Statement mail carries an amount; moon owner mail has none.
      render: (row) => (isStatementMail(row.kind) ? formatIsk(row.amount) : '—'),
    },
    {
      id: 'status',
      header: t('corpTaxBook.mailQueue.table.status'),
      render: (row) => {
        const status = displayStatus(items, row, now, sendingId);
        const detail =
          status === 'failed'
            ? failureText(row, t)
            : status === 'paused'
              ? row.holdReason === 'offline'
                ? t('corpTaxBook.mailQueue.hold.offline')
                : t('corpTaxBook.mailQueue.hold.rateLimit', {
                    seconds: Math.max(1, Math.ceil(((row.notBefore ?? now) - now) / 1000)),
                  })
              : null;
        return (
          <span className="block min-w-0">
            <span
              className={cx(
                'inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap',
                TONE[status]
              )}
            >
              {(status === 'waiting' || status === 'paused') && (
                <Icon.Pending size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              )}
              {status === 'failed' && <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
              {t(`corpTaxBook.mailQueue.status.${status}`)}
              {status === 'sent' && <span aria-hidden="true"> ✓</span>}
              {status === 'sent' && row.sentAt !== undefined && (
                <span className="font-normal text-text-dim">
                  {new Date(row.sentAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })}
                </span>
              )}
            </span>
            {detail && <span className="block text-xs text-text-dim">{detail}</span>}
            {notes[row.id] && (
              <span role="status" className="block text-xs text-text-dim">
                {notes[row.id]}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cardCorner: true,
      render: (row) =>
        row.status === 'failed' ? (
          <span className="flex justify-end gap-1">
            <Button
              size="sm"
              aria-label={t('corpTaxBook.mailQueue.actions.retryLabel', {
                name: row.recipientName,
              })}
              onClick={() => onRetry(row)}
            >
              {t('corpTaxBook.mailQueue.actions.retry')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('corpTaxBook.mailQueue.actions.openInEveLabel', {
                name: row.recipientName,
              })}
              onClick={() =>
                void onOpenInEve(row).then((note) =>
                  setNotes((current) => ({ ...current, [row.id]: note ?? '' }))
                )
              }
            >
              {t('corpTaxBook.mailQueue.actions.openInEve')}
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <DataTable
      label={t('corpTaxBook.mailQueue.table.label')}
      columns={columns}
      rows={[...items]}
      rowKey={(row) => row.id}
      density="compact"
      stackLayout="dense"
      rowClassName={(row) => (row.status === 'failed' ? 'bg-danger/5' : undefined)}
    />
  );
}

/** The whole queue view: summary above the table. Shared by the popover and the phone sheet. */
export function MailQueuePanel({
  items,
  now,
  sendingId,
  onRetry,
  onOpenInEve,
  onClearSent,
}: {
  items: readonly MailQueueItem[];
  now: number;
  sendingId?: string;
  onClearSent?: () => void;
} & MailQueueActions) {
  const { t } = useTranslation();
  const settled = items.some((i) => i.status === 'sent');
  return (
    <div className="space-y-3">
      <MailQueueSummary items={items} now={now} />
      <MailQueueTable
        items={items}
        now={now}
        sendingId={sendingId}
        onRetry={onRetry}
        onOpenInEve={onOpenInEve}
      />
      {onClearSent && settled && summarize(items, now).done && (
        <Button size="sm" variant="ghost" onClick={onClearSent}>
          {t('corpTaxBook.mailQueue.actions.clearDone')}
        </Button>
      )}
    </div>
  );
}

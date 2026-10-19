import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { MailListRow } from '@/features/character/MailListRow';
import { MailListEmpty, type MailListState } from '@/features/character/MailListEmpty';
import { mailAgeLabel, type MailRow } from '@/features/character/mailDisplay';
import type { MailAgeSection } from '@/engine/mail/mailAge';
import type { MailHeader } from '@/esi/endpoints';

interface MailListPaneProps {
  /** False below `lg:` while a mail is open: the pane is hidden, not unmounted. */
  visible: boolean;
  listState: MailListState;
  folderCount: number;
  hasMore: boolean;
  offline: boolean;
  onShowAllFolders: () => void;
  onClearSearch: () => void;
  onShowRead: () => void;
  rowSections: readonly MailAgeSection<MailRow>[];
  isAll: boolean;
  names: ReadonlyMap<number, string>;
  locallyReadKeys: ReadonlySet<string>;
  selectedKey: string | null;
  timeZone: ComponentProps<typeof MailListRow>['timeZone'];
  recipientSummary: (header: MailHeader) => string;
  onOpenRow: (row: MailRow, button: HTMLButtonElement) => void;
  headersTruncated: boolean;
  cappedCount: number;
  loadingMore: boolean;
  loadMoreFailure: 'offline' | 'error' | null;
  onLoadMore: () => void;
}

/** Mail's list column: age-grouped rows (or the empty state), the cap notice and "Load more". */
export function MailListPane({
  visible,
  listState,
  folderCount,
  hasMore,
  offline,
  onShowAllFolders,
  onClearSearch,
  onShowRead,
  rowSections,
  isAll,
  names,
  locallyReadKeys,
  selectedKey,
  timeZone,
  recipientSummary,
  onOpenRow,
  headersTruncated,
  cappedCount,
  loadingMore,
  loadMoreFailure,
  onLoadMore,
}: MailListPaneProps) {
  const { t } = useTranslation();
  return (
    <Panel padded={false} className={visible ? '' : 'hidden'}>
      {listState !== 'rows' ? (
        <MailListEmpty
          state={listState}
          folderCount={folderCount}
          hasMore={hasMore}
          offline={offline}
          onShowAllFolders={onShowAllFolders}
          onClearSearch={onClearSearch}
          onShowRead={onShowRead}
        />
      ) : (
        // Flat cap, not viewport-relative: the "load more" button
        // renders below this list in the same column, so sizing the
        // list to all remaining viewport height would push it off-screen.
        // Raised from 32rem alongside the taller two-line row, so about
        // as many mails stay on screen as before.
        // Sticky date <h3>s, as in the Coming up rail; `scroll-pt-8`
        // keeps a focused row out from under one (WCAG 2.4.11).
        <div className="max-h-[36rem] scroll-pt-8 overflow-y-auto lg:max-h-[44rem]">
          {rowSections.map((section) => (
            <div key={section.key}>
              <h3
                className={cx(
                  eyebrowClassName,
                  'sticky top-0 z-10 border-y border-line bg-panel-2 px-3 py-1.5'
                )}
              >
                {mailAgeLabel(section.bucket, t)}
              </h3>
              <ul className="divide-y divide-line">
                {section.items.map((row) => {
                  const { header, tab } = row;
                  // Not `cond && get(...) ?? fallback`: `??` passes `false`
                  // straight through, so a header with no sender rendered
                  // nothing at all instead of the fallback.
                  const sender =
                    (header.from === undefined ? undefined : names.get(header.from)) ??
                    t('mail.unknownSender');
                  return (
                    <MailListRow
                      key={row.key}
                      row={row}
                      isAll={isAll}
                      isRead={header.is_read || locallyReadKeys.has(row.key)}
                      isSelected={selectedKey === row.key}
                      // A Sent mail's sender is you, so the whole Sent folder read
                      // as a column of your own name. Its recipients are already
                      // resolved for the reading pane, so showing them here costs
                      // no extra lookup and is what makes Sent legible without
                      // spending a colour on it.
                      party={tab === 'sent' ? recipientSummary(header) : sender}
                      timeZone={timeZone}
                      onOpen={onOpenRow}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {headersTruncated && (
        <p className="border-t border-line p-2 text-[0.6875rem] text-text-dim">
          {t('mail.capNotice', { count: cappedCount })}
        </p>
      )}
      {hasMore && (
        <div className="border-t border-line p-2">
          <Button size="sm" className="w-full" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('mail.loadMore')}
          </Button>
          {loadMoreFailure !== null && (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {loadMoreFailure === 'offline' ? t('mail.loadMoreOffline') : t('mail.loadMoreFailed')}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

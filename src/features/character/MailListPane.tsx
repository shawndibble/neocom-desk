import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { MailListRow } from '@/features/character/MailListRow';
import { MailListEmpty, type MailListState } from '@/features/character/MailListEmpty';
import { isMailRead, mailAgeLabel, type MailRow } from '@/features/character/mailDisplay';
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
  locallyUnreadKeys: ReadonlySet<string>;
  /** Mark read/unread, delete and Select mode (see `useMailOrganize`). */
  organize: {
    canOrganize: (row: MailRow) => boolean;
    selecting: boolean;
    checkedKeys: ReadonlySet<string>;
    onToggleCheck: (row: MailRow) => void;
    onSetRead: (row: MailRow, read: boolean) => void;
    onDelete: (row: MailRow) => void;
  };
  /** Select mode's bar, above the list. */
  selectionBar?: ReactNode;
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
  locallyUnreadKeys,
  organize,
  selectionBar,
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
    <Panel
      padded={false}
      className={
        visible ? 'lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:flex-col' : 'hidden'
      }
    >
      {organize.selecting && selectionBar}
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
        // Below `lg` a flat cap, since the page scrolls and the "load more"
        // button sits under the list. From `lg` the pane is sticky and capped
        // to the viewport, and the list takes the height left after the
        // search/selection bar and the load-more footer, so it fills the
        // screen instead of stopping at a fixed height.
        // Sticky date <h3>s, as in the Coming up rail; `scroll-pt-8`
        // keeps a focused row out from under one (WCAG 2.4.11).
        <div className="max-h-[36rem] scroll-pt-8 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
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
                      isRead={isMailRead(row, locallyReadKeys, locallyUnreadKeys)}
                      isSelected={selectedKey === row.key}
                      // A Sent mail's sender is you, so the whole Sent folder read
                      // as a column of your own name. Its recipients are already
                      // resolved for the reading pane, so showing them here costs
                      // no extra lookup and is what makes Sent legible without
                      // spending a colour on it.
                      party={tab === 'sent' ? recipientSummary(header) : sender}
                      timeZone={timeZone}
                      onOpen={onOpenRow}
                      canOrganize={organize.canOrganize(row)}
                      selecting={organize.selecting}
                      checked={organize.checkedKeys.has(row.key)}
                      onToggleCheck={organize.onToggleCheck}
                      onSetRead={organize.onSetRead}
                      onDelete={organize.onDelete}
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

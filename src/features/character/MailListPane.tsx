import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useFitToViewport } from '@/lib/useFitToViewport';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { MailListRow } from '@/features/character/MailListRow';
import { MailListEmpty, type MailListState } from '@/features/character/MailListEmpty';
import { isMailRead, mailAgeLabel, type MailRow } from '@/features/character/mailDisplay';
import type { MailAgeSection } from '@/engine/mail/mailAge';
import type { MailHeader } from '@/esi/endpoints';

interface MailListPaneProps {
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
  organize: {
    canOrganize: (row: MailRow) => boolean;
    selecting: boolean;
    checkedKeys: ReadonlySet<string>;
    onToggleCheck: (row: MailRow) => void;
    onSetRead: (row: MailRow, read: boolean) => void;
    onDelete: (row: MailRow) => void;
  };
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
  const isDesktop = useIsDesktop();
  const paneRef = useFitToViewport<HTMLElement>(visible && isDesktop, 'maxHeight');
  return (
    <Panel
      ref={paneRef}
      padded={false}
      fill
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
        <div className="max-h-[36rem] scroll-pt-8 overflow-y-auto pb-14 lg:max-h-none lg:pb-0 lg:min-h-0 lg:flex-1">
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
                      party={tab === 'sent' ? recipientSummary(header) : sender}
                      timeZone={timeZone}
                      timeOnly={
                        section.bucket.kind === 'today' || section.bucket.kind === 'yesterday'
                      }
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
          <Button
            size="sm"
            className="w-full"
            onClick={onLoadMore}
            aria-disabled={loadingMore || undefined}
          >
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

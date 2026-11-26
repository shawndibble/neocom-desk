import { useTranslation } from 'react-i18next';
import { Button, CachedEmptyState, EmptyState } from '@/components/ui';

export type MailListState =
  'rows' | 'no-folders' | 'empty-folder' | 'no-search-matches' | 'all-read-hidden';

interface MailListEmptyProps {
  state: Exclude<MailListState, 'rows'>;
  folderCount: number;
  hasMore: boolean;
  offline: boolean;
  onShowAllFolders: () => void;
  onClearSearch: () => void;
  onShowRead: () => void;
}

export function MailListEmpty({
  state,
  folderCount,
  hasMore,
  offline,
  onShowAllFolders,
  onClearSearch,
  onShowRead,
}: MailListEmptyProps) {
  const { t } = useTranslation();
  if (state === 'no-folders') {
    return (
      <EmptyState
        title={t('mail.noFoldersTitle')}
        hint={t('mail.noFoldersHint')}
        className="py-6"
        action={
          <Button size="sm" onClick={onShowAllFolders}>
            {t('mail.showAllFolders')}
          </Button>
        }
      />
    );
  }
  if (state === 'empty-folder') {
    return hasMore ? (
      <EmptyState
        title={t('mail.emptyFolderLoadedTitle', { count: folderCount })}
        hint={t('mail.emptyFolderLoadMoreHint')}
        className="py-6"
      />
    ) : (
      <CachedEmptyState
        result={{ fromCache: offline }}
        title={t('mail.emptyFolderCachedTitle', { count: folderCount })}
        hint={t('mail.emptyFolderCachedHint')}
        fetchedTitle={t('mail.emptyFolderTitle', { count: folderCount })}
        className="py-6"
      />
    );
  }
  if (state === 'no-search-matches') {
    return (
      <EmptyState
        title={t('mail.noSearchMatchesTitle')}
        hint={t('mail.noSearchMatchesHint')}
        className="py-6"
        action={
          <Button size="sm" onClick={onClearSearch}>
            {t('mail.clearSearch')}
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      title={t('mail.allReadHiddenTitle')}
      hint={t('mail.allReadHiddenHint')}
      className="py-6"
      action={
        <Button size="sm" onClick={onShowRead}>
          {t('mail.showRead')}
        </Button>
      }
    />
  );
}

import { useTranslation } from 'react-i18next';
import { Button, CachedEmptyState, EmptyState } from '@/components/ui';

/** The first filter stage that emptied the Mail list, or `rows` when it has some. */
export type MailListState =
  'rows' | 'no-folders' | 'empty-folder' | 'no-search-matches' | 'all-read-hidden';

interface MailListEmptyProps {
  state: Exclude<MailListState, 'rows'>;
  folderCount: number;
  /** Older pages are still unloaded, so an empty folder is not yet known to be empty. */
  hasMore: boolean;
  offline: boolean;
  onShowAllFolders: () => void;
  onClearSearch: () => void;
  onShowRead: () => void;
}

/** What the Mail list says when a filter stage left it empty. Each one's single action brings rows back. */
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
    // Deselecting every folder is allowed rather than refused — a chip that
    // visibly ignores a press is worse than an empty list that explains itself
    // and hands back the way out. The chip row above sits outside this branch,
    // so the control that undoes it never disappears along with the rows.
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
    // No action: no filter here brings mail back. With older pages unloaded,
    // "none" isn't known yet: point at Load more below.
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

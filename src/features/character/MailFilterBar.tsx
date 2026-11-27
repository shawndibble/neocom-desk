import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip, SearchInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TAB_LABEL_KEY } from '@/features/character/mailDisplay';
import { MAIL_FOLDERS, type MailTab } from '@/engine/mail/mail';

interface MailFilterBarProps {
  folders: readonly MailTab[];
  unreadByTab: ReadonlyMap<MailTab, number>;
  onToggleFolder: (folder: MailTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  hideRead: boolean;
  onToggleHideRead: () => void;
  searchInputRef: Ref<HTMLInputElement>;
}

export function MailFilterBar({
  folders,
  unreadByTab,
  onToggleFolder,
  search,
  onSearchChange,
  hideRead,
  onToggleHideRead,
  searchInputRef,
}: MailFilterBarProps) {
  const { t } = useTranslation();
  return (
    <>
      <div
        role="group"
        aria-label={t('mail.foldersLabel')}
        className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2"
      >
        {MAIL_FOLDERS.map((folder) => {
          const unread = unreadByTab.get(folder) ?? 0;
          return (
            <FilterChip
              key={folder}
              size="md"
              label={t(TAB_LABEL_KEY[folder])}
              count={unread > 0 ? unread : undefined}
              countLabel={unread > 0 ? t('mail.unreadCount', { count: unread }) : undefined}
              selected={folders.includes(folder)}
              icon={folders.includes(folder) ? <Icon.Select size={Icon.ICON_SIZE.sm} /> : undefined}
              onToggle={() => onToggleFolder(folder)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          ref={searchInputRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('mail.searchPlaceholder')}
          aria-label={t('mail.searchLabel')}
          className="min-w-0 flex-1"
        />
        <FilterChip
          label={t('mail.hideRead')}
          selected={hideRead}
          onToggle={onToggleHideRead}
          size="md"
        />
      </div>
    </>
  );
}

import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip, SearchInput } from '@/components/ui';
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

/** Mail's folder chips, search box and Hide read toggle. */
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
      {/* A toggle-button group, not a tablist: `aria-selected` on a tab
          promises exactly one visible panel, which stops being true the
          moment two folders can be on at once. `aria-pressed` on a real
          button inside a `role="group"` is the APG toggle idiom, and the
          shape Contacts and Open Orders already ship. Losing the tab
          bar's arrow-key roving focus is correct rather than a
          regression — each chip is its own tab stop now. */}
      <div
        role="group"
        aria-label={t('mail.foldersLabel')}
        className="flex flex-wrap items-center gap-2"
      >
        {MAIL_FOLDERS.map((folder) => {
          // Each System Label's own `unread_count`, never summed across
          // the selected folders: round 18 recorded that these come from
          // ESI as-is, and `total_unread_count` is not their sum once
          // Custom Labels exist, so a client-side total would disagree
          // with the number the game itself shows. The All view sums
          // the same per-label figure across Characters (issue #2867).
          const unread = unreadByTab.get(folder) ?? 0;
          return (
            <FilterChip
              key={folder}
              size="md"
              label={t(TAB_LABEL_KEY[folder])}
              // Zero is shown, not dimmed away as Open Orders dims a
              // zero-match chip: there, zero means "nothing to do"; here
              // a folder with no unread mail is exactly where you go to
              // re-read something, and Sent reports zero unread forever.
              count={unread > 0 ? unread : undefined}
              countLabel={unread > 0 ? t('mail.unreadCount', { count: unread }) : undefined}
              selected={folders.includes(folder)}
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

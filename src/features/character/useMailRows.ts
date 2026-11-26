import { useMemo } from 'react';
import { groupMailByAge } from '@/engine/mail/mailAge';
import {
  capHeadersForDisplay,
  customLabelNames,
  mailKey,
  mailSearchMatches,
  mergeOwnedMail,
  resolveMailTab,
  unreadDeltaByTab,
  type MailTab,
} from '@/engine/mail/mail';
import { isMailRead, type MailRow } from '@/features/character/mailDisplay';
import type { OwnerSnapshot } from '@/features/character/mailSnapshot';
import type { WeekStart } from '@/lib/calendarGrid';
import type { MailHeader } from '@/esi/endpoints';

interface MailRowsInput {
  owners: readonly OwnerSnapshot[];
  ownerById: ReadonlyMap<number, OwnerSnapshot>;
  loadedHeaders: ReadonlyMap<number, MailHeader[]> | null | undefined;
  names: ReadonlyMap<number, string>;
  folders: readonly MailTab[];
  debouncedSearch: string;
  hideRead: boolean;
  locallyReadKeys: ReadonlySet<string>;
  locallyUnreadKeys: ReadonlySet<string>;
  deletedKeys: ReadonlySet<string>;
  now: number;
  timeZone: 'UTC' | undefined;
  weekStart: WeekStart;
}

export function useMailRows({
  owners,
  ownerById,
  loadedHeaders,
  names,
  folders,
  debouncedSearch,
  hideRead,
  locallyReadKeys,
  locallyUnreadKeys,
  deletedKeys,
  now,
  timeZone,
  weekStart,
}: MailRowsInput) {
  const allRows = useMemo<MailRow[]>(
    () =>
      mergeOwnedMail(
        owners.map((o) => ({
          characterId: o.characterId,
          characterName: o.name,
          headers: loadedHeaders?.get(o.characterId) ?? o.headersResult?.data ?? [],
        }))
      ).map(({ ownerId, ownerName, header }) => {
        const owner = ownerById.get(ownerId);
        return {
          key: mailKey(ownerId, header.mail_id),
          ownerId,
          ownerName,
          header,
          tab: resolveMailTab(header.labels, owner?.labelTabById ?? new Map()),
          labelNames: customLabelNames(
            header.labels,
            owner?.labels ?? [],
            owner?.labelTabById ?? new Map()
          ),
        };
      }),
    [owners, ownerById, loadedHeaders]
  );
  const rows = useMemo(
    () => allRows.filter((row) => !deletedKeys.has(row.key)),
    [allRows, deletedKeys]
  );
  const unreadDelta = useMemo(
    () => unreadDeltaByTab(allRows, locallyReadKeys, locallyUnreadKeys, deletedKeys),
    [allRows, locallyReadKeys, locallyUnreadKeys, deletedKeys]
  );

  const folderRows = useMemo(
    () => rows.filter((row) => folders.includes(row.tab)),
    [rows, folders]
  );
  const searchRows = useMemo(
    () =>
      folderRows.filter((row) => {
        const senderName = row.header.from === undefined ? undefined : names.get(row.header.from);
        return mailSearchMatches(row.header, senderName, debouncedSearch);
      }),
    [folderRows, names, debouncedSearch]
  );
  const visibleRows = useMemo(
    () =>
      hideRead
        ? searchRows.filter((row) => !isMailRead(row, locallyReadKeys, locallyUnreadKeys))
        : searchRows,
    [searchRows, hideRead, locallyReadKeys, locallyUnreadKeys]
  );

  const { headers: cappedRows, truncated: headersTruncated } = useMemo(
    () => capHeadersForDisplay(visibleRows),
    [visibleRows]
  );

  const rowSections = useMemo(
    () =>
      groupMailByAge(cappedRows, (row) => row.header.timestamp, new Date(now), timeZone, weekStart),
    [cappedRows, now, timeZone, weekStart]
  );

  const listState = (() => {
    if (visibleRows.length > 0) return 'rows';
    if (folders.length === 0) return 'no-folders';
    if (folderRows.length === 0) return 'empty-folder';
    if (searchRows.length === 0) return 'no-search-matches';
    return 'all-read-hidden';
  })();

  return { rows, cappedRows, headersTruncated, rowSections, listState, unreadDelta } as const;
}

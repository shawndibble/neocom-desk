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
  /** Mail deleted this session: gone from the list at once, before any reload. */
  deletedKeys: ReadonlySet<string>;
  now: number;
  timeZone: 'UTC' | undefined;
  weekStart: WeekStart;
}

/** Merged mail rows → folder → search → Hide read → display cap → age sections, plus which empty state applies. */
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
  // The folder chips' unread counts are ESI's label counts, read before this session's
  // changes: this is how far this session has moved them.
  const unreadDelta = useMemo(
    () => unreadDeltaByTab(allRows, locallyReadKeys, locallyUnreadKeys, deletedKeys),
    [allRows, locallyReadKeys, locallyUnreadKeys, deletedKeys]
  );

  // Folder, then search, then Hide read, kept per stage for `listState` below.
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

  // Rendered-list cap (issue #416): applied after every filter, so it caps
  // what's actually mapped into DOM rows rather than the underlying fetch
  // list — "load more"'s own pagination cursor is untouched by this.
  const { headers: cappedRows, truncated: headersTruncated } = useMemo(
    () => capHeadersForDisplay(visibleRows),
    [visibleRows]
  );

  // Grouped after the cap, so a header only ever covers rows actually
  // rendered, and "load more" just regroups the longer list: a bucket that
  // gains rows keeps its one header instead of repeating at the page seam.
  const rowSections = useMemo(
    () =>
      groupMailByAge(cappedRows, (row) => row.header.timestamp, new Date(now), timeZone, weekStart),
    [cappedRows, now, timeZone, weekStart]
  );

  // Each empty state is named by the first stage that emptied the list, so
  // its one action always brings rows back: an empty folder has none to offer.
  const listState = (() => {
    if (visibleRows.length > 0) return 'rows';
    if (folders.length === 0) return 'no-folders';
    if (folderRows.length === 0) return 'empty-folder';
    if (searchRows.length === 0) return 'no-search-matches';
    return 'all-read-hidden';
  })();

  return { rows, cappedRows, headersTruncated, rowSections, listState, unreadDelta } as const;
}

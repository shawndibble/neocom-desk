import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  ReauthBanner,
  SearchInput,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import {
  loadMailHeaders,
  loadMailBody,
  loadMailLabels,
  loadMailingLists,
  loadMoreMailHeaders,
  markMailReadOnEsi,
} from '@/features/character/mail';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useIsDesktop } from '@/lib/useIsDesktop';
import {
  useViewportBoundedHeight,
  VIEWPORT_BOUNDED_BOTTOM_GAP_PX,
} from '@/lib/useViewportBoundedHeight';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { useMailFolders } from '@/features/character/mailFolderPref';
import { cx } from '@/lib/cx';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import {
  buildLabelTabMap,
  capHeadersForDisplay,
  mailSearchMatches,
  resolveMailTab,
  unreadCountsByTab,
  MAIL_FOLDERS,
  type MailTab,
} from '@/engine/mail';
import type { MailBody, MailHeader, MailLabel, MailLabels, MailingList } from '@/esi/endpoints';

// Matches Market.tsx's/SkillPicker.tsx's/Assets.tsx's own search debounce.
const SEARCH_DEBOUNCE_MS = 250;

const TAB_LABEL_KEY: Record<MailTab, string> = {
  inbox: 'mail.tabInbox',
  sent: 'mail.tabSent',
  corp: 'mail.tabCorp',
  alliance: 'mail.tabAlliance',
};

/**
 * The glyph a row wears instead of the old uppercase text tag.
 *
 * A glyph rather than a per-folder colour on purpose (see
 * `docs/context/decisions/`, "Mail rows go two-line"): Inbox/Sent/Corp/
 * Alliance is a *nominal* set — no order, no severity — and every colour scale
 * in this app is ordinal or semantic (`securityStatusColor`, `STANDING_TONE`,
 * the order-problem severity ladder). Four hues here would encode identity
 * alone, which DESIGN.md §6 calls decoration, and in a palette where cyan is
 * already "interactive" they would read as status and read wrong.
 */
const FOLDER_ICON: Record<MailTab, typeof Icon.Corporation> = {
  inbox: Icon.MailInbox,
  sent: Icon.MailSent,
  corp: Icon.Corporation,
  alliance: Icon.MailAlliance,
};

interface Snapshot {
  headersResult: CachedResult<MailHeader[]> | null;
  labelsResult: CachedResult<MailLabels> | null;
  /** 401/403 (or a failed token refresh) on either call means "log in again", not "offline". */
  needsReauth: boolean;
  /** Sender + non-mailing-list recipient names, resolved together in one batch. */
  names: Map<number, string>;
  /** True when a `last_mail_id` page beyond this list may exist (issue #161). */
  headersHasMore: boolean;
  /** This character's mailing lists, for resolving a `mailing_list` recipient's real name (issue #416). */
  mailingLists: MailingList[];
}

/** Stable identity for the loading/failed fallback, so it doesn't churn every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_LABELS: readonly MailLabel[] = [];
const NO_MAILING_LISTS: readonly MailingList[] = [];

/**
 * Sender + recipient ids to look up for these headers. Mailing-list recipient
 * ids are excluded: `/universe/names` can't resolve them and fails the whole
 * batch on an unresolvable id, which would blank every other name in the same
 * mail.
 */
function namePartyIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => [
    ...(header.from !== undefined ? [header.from] : []),
    ...(header.recipients ?? [])
      .filter((r) => r.recipient_type !== 'mailing_list')
      .map((r) => r.recipient_id),
  ]);
}

async function loadMailSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [
    { cached: headersResult, needsReauth: headersNeedsReauth, hasMore: headersHasMore },
    { cached: labelsResult, needsReauth: labelsNeedsReauth },
    { cached: listsResult, needsReauth: listsNeedsReauth },
  ] = await Promise.all([
    loadMailHeaders(characterId),
    loadMailLabels(characterId),
    loadMailingLists(characterId),
  ]);

  // Already superseded: skip the name lookup, its result would be discarded.
  const ids = signal.cancelled ? [] : namePartyIds(headersResult?.data ?? []);
  const names = await resolveNames(ids);
  return {
    headersResult,
    labelsResult,
    needsReauth: headersNeedsReauth || labelsNeedsReauth || listsNeedsReauth,
    names,
    headersHasMore,
    mailingLists: listsResult?.data ?? [],
  };
}

/** Mail: tabbed, two-pane client — list beside reading pane, each scrolling independently (CONTEXT.md round 18). */
export function Mail() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadMailSnapshot,
    undefined,
    { cacheKey: 'mail' }
  );

  // Which folders the list shows. Remembered across visits and device-wide
  // (`mailFolderPref.ts`) — a deliberate promotion from the in-memory,
  // per-character tab memory this replaces. That tier was fine for a tab:
  // forgetting it put you back on All, which hid nothing. A folder filter
  // whose whole point is "stop showing me Sent" has not granted the request
  // if it forgets by the next reload.
  // An array all the way through, not a Set at the point of use: Dexie stores
  // plain structured-cloneable values, so the stored shape is an array either
  // way, and at four possible members a linear scan beats the two hooks it
  // takes to keep a memoised Set's identity stable.
  const folders = useMailFolders((state) => state.value);
  const setFolders = useMailFolders((state) => state.setValue);
  const hydrateFolders = useMailFolders((state) => state.hydrate);
  useEffect(() => {
    void hydrateFolders();
  }, [hydrateFolders]);
  function toggleFolder(folder: MailTab) {
    void setFolders(
      folders.includes(folder) ? folders.filter((f) => f !== folder) : [...folders, folder]
    );
  }

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Local "mark read" state, applied instantly on selection so the dim never
  // waits on the network — independent of `markMailReadOnEsi`'s own write
  // below. Set on selection, not toggled — no manual mark-unread control.
  const [locallyReadIds, setLocallyReadIds] = useState<ReadonlySet<number>>(new Set());
  const [hideRead, setHideRead] = useState(false);
  function markLocalRead(mailId: number) {
    setLocallyReadIds((previous) =>
      previous.has(mailId) ? previous : new Set(previous).add(mailId)
    );
  }

  const [search, setSearch] = useState('');
  // Debounced separately from `search` (matches Assets.tsx/Market.tsx/
  // SkillPicker.tsx's own search debounce, issue #416): the input stays
  // instantly responsive, only the filter over potentially hundreds of
  // headers below waits out the debounce.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);
  const [bodySnapshot, setBodySnapshot] = useState<{
    selectedId: number;
    result: CachedResult<MailBody> | null;
  } | null>(null);

  // Headers loaded via "load more" (issue #161) live outside useRouteSnapshot,
  // which only supports a full reload, not an incremental patch. `null` means
  // "no load-more yet this snapshot" — fall back to the snapshot's own list.
  const [loadedHeaders, setLoadedHeaders] = useState<MailHeader[] | null>(null);
  // Names for those headers: the snapshot only resolved the parties in its own
  // first page, so without this every row past it would read "Unknown".
  const [loadedNames, setLoadedNames] = useState<ReadonlyMap<number, string> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Reset for a new snapshot (character switch, manual refresh, or the
  // initial load) synchronously during render — the same "adjust state while
  // rendering" pattern useRouteSnapshot itself uses — so `hasMore` is already
  // correct on the very render that first shows this snapshot's headers,
  // instead of lagging a render behind through a useEffect.
  const [snapshotForHeaders, setSnapshotForHeaders] = useState<Snapshot | null>(null);
  if (data !== snapshotForHeaders) {
    setSnapshotForHeaders(data);
    setLoadedHeaders(null);
    setLoadedNames(null);
    setHasMore(data?.headersHasMore ?? false);
  }
  // Latest snapshot, readable from handleLoadMore's async closure after an
  // await — a stale closure over `data` would never see the character
  // switch or refresh that superseded the in-flight request.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  // Narrow screens show one column at a time (CONTEXT.md round 18); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width.
  const isDesktop = useIsDesktop();
  // The pilot's Local/EVE-time preference, the same way Contracts,
  // Notifications and Clones thread it into their own timestamps.
  const timeZone = useTimeZone();
  const [bodyScrollerRef, bodyMaxHeight] = useViewportBoundedHeight(VIEWPORT_BOUNDED_BOTTOM_GAP_PX);

  const headersResult = data?.headersResult ?? null;
  const needsReauth = data?.needsReauth ?? false;
  const names = loadedNames ?? data?.names ?? NO_NAMES;
  const labels = data?.labelsResult?.data.labels ?? NO_LABELS;
  const labelTabById = useMemo(() => buildLabelTabMap(labels), [labels]);
  const unreadByTab = useMemo(() => unreadCountsByTab(labels), [labels]);
  const mailingListNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const list of data?.mailingLists ?? NO_MAILING_LISTS)
      map.set(list.mailing_list_id, list.name);
    return map;
  }, [data]);

  const headers = useMemo(
    () =>
      [...(loadedHeaders ?? headersResult?.data ?? [])].sort((a, b) =>
        (b.timestamp ?? '').localeCompare(a.timestamp ?? '')
      ),
    [loadedHeaders, headersResult]
  );

  const visibleHeaders = useMemo(
    () =>
      headers.filter((h) => {
        if (!folders.includes(resolveMailTab(h.labels, labelTabById))) return false;
        const isRead = h.is_read || locallyReadIds.has(h.mail_id);
        if (hideRead && isRead) return false;
        const senderName = h.from === undefined ? undefined : names.get(h.from);
        return mailSearchMatches(h, senderName, debouncedSearch);
      }),
    [headers, folders, labelTabById, hideRead, locallyReadIds, names, debouncedSearch]
  );

  // Rendered-list cap (issue #416): applied after every filter, so it caps
  // what's actually mapped into DOM rows rather than the underlying fetch
  // list — "load more"'s own pagination cursor is untouched by this.
  const { headers: cappedHeaders, truncated: headersTruncated } = useMemo(
    () => capHeadersForDisplay(visibleHeaders),
    [visibleHeaders]
  );

  // The list pane's three states, named once here rather than as a pair of
  // nested ternaries in the middle of the JSX — "empty because nothing matched"
  // and "empty because no folder is on" want different copy and only one of
  // them offers a way out.
  const listState =
    visibleHeaders.length > 0 ? 'rows' : folders.length === 0 ? 'no-folders' : 'no-matches';

  const selectedHeader = headers.find((h) => h.mail_id === selectedId) ?? null;

  /**
   * A header's recipients as display names. A mailing list resolves through
   * this character's own lists rather than `/universe/names`, which cannot
   * resolve a list id at all (see `namePartyIds`).
   */
  function recipientNames(header: MailHeader): string[] {
    return (header.recipients ?? []).map((r) =>
      r.recipient_type === 'mailing_list'
        ? (mailingListNames.get(r.recipient_id) ?? t('mail.mailingList'))
        : (names.get(r.recipient_id) ?? t('mail.unknownRecipient'))
    );
  }

  /** The same recipients, cut to one name plus a count — a list row has one line for them. */
  function recipientSummary(header: MailHeader): string {
    const all = recipientNames(header);
    if (all.length === 0) return t('mail.unknownRecipient');
    if (all.length === 1) return all[0];
    return t('mail.recipientMore', { name: all[0], count: all.length - 1 });
  }

  async function handleLoadMore() {
    if (activeCharacterId === null || loadingMore) return;
    const requestSnapshot = data;
    setLoadingMore(true);
    try {
      const result = await loadMoreMailHeaders(activeCharacterId, headers);
      const names = await resolveNames(namePartyIds(result.headers));
      // A character switch or refresh landed while this was in flight and
      // already reset loadedHeaders/loadedNames for the new snapshot —
      // applying this result now would overwrite it with stale mail.
      if (dataRef.current !== requestSnapshot) return;
      setLoadedHeaders(result.headers);
      setHasMore(result.hasMore);
      setLoadedNames(names);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (activeCharacterId === null || selectedId === null) return;
    let cancelled = false;
    void loadMailBody(activeCharacterId, selectedId).then((result) => {
      if (!cancelled) setBodySnapshot({ selectedId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, selectedId]);

  const body = bodySnapshot?.selectedId === selectedId ? bodySnapshot.result : undefined;

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const showBackControl = !isDesktop && selectedId !== null;
  const recipients = selectedHeader?.recipients ?? [];
  const selectedTab = resolveMailTab(selectedHeader?.labels, labelTabById);
  const selectedSender =
    (selectedHeader?.from === undefined ? undefined : names.get(selectedHeader.from)) ??
    t('mail.unknownSender');

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('mail.title')}
        meta={headersResult && <DataAgeBadge date={headersResult.fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('mail.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : needsReauth ? (
        <ReauthBanner
          title={t('mail.reauthTitle')}
          hint={t('mail.reauthHint')}
          actionLabel={t('mail.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !headersResult || headers.length === 0 ? (
        <EmptyState title={t('mail.emptyTitle')} hint={t('mail.emptyHint')} />
      ) : (
        <>
          {headersResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          {(isDesktop || selectedId === null) && (
            // A toggle-button group, not a tablist: `aria-selected` on a tab
            // promises exactly one visible panel, which stops being true the
            // moment two folders can be on at once. `aria-pressed` on a real
            // button inside a `role="group"` is the APG toggle idiom, and the
            // shape Contacts and Open Orders already ship. Losing the tab
            // bar's arrow-key roving focus is correct rather than a
            // regression — each chip is its own tab stop now.
            <div
              role="group"
              aria-label={t('mail.foldersLabel')}
              className="flex flex-wrap items-center gap-2"
            >
              {MAIL_FOLDERS.map((folder) => {
                // Straight from each System Label's own `unread_count`, never
                // summed across the selected folders: round 18 recorded that
                // these come from ESI as-is, and `total_unread_count` is not
                // their sum once Custom Labels exist, so a client-side total
                // would disagree with the number the game itself shows.
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
                    onToggle={() => toggleFolder(folder)}
                  />
                );
              })}
            </div>
          )}

          {(isDesktop || selectedId === null) && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('mail.searchPlaceholder')}
                aria-label={t('mail.searchLabel')}
                className="min-w-0 flex-1"
              />
              <FilterChip
                label={t('mail.hideRead')}
                selected={hideRead}
                onToggle={() => setHideRead((v) => !v)}
                size="md"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr] lg:items-start xl:grid-cols-[24rem_1fr]">
            <Panel padded={false} className={isDesktop || selectedId === null ? '' : 'hidden'}>
              {listState === 'no-folders' ? (
                // Deselecting every folder is allowed rather than refused — a
                // chip that visibly ignores a press is worse than an empty list
                // that explains itself and hands back the way out. The chip row
                // above sits outside this branch, so the control that undoes it
                // never disappears along with the rows.
                <EmptyState
                  title={t('mail.noFoldersTitle')}
                  hint={t('mail.noFoldersHint')}
                  className="py-6"
                  action={
                    <Button size="sm" onClick={() => void setFolders(MAIL_FOLDERS)}>
                      {t('mail.showAllFolders')}
                    </Button>
                  }
                />
              ) : listState === 'no-matches' ? (
                <EmptyState
                  title={t('mail.noMatchesTitle')}
                  hint={t('mail.noMatchesHint')}
                  className="py-6"
                />
              ) : (
                // Flat cap, not viewport-relative: the "load more" button
                // renders below this list in the same column, so sizing the
                // list to all remaining viewport height would push it off-screen.
                // Raised from 32rem alongside the taller two-line row, so about
                // as many mails stay on screen as before.
                <ul className="max-h-[36rem] divide-y divide-line overflow-y-auto lg:max-h-[44rem]">
                  {cappedHeaders.map((header) => {
                    const tab = resolveMailTab(header.labels, labelTabById);
                    const FolderIcon = FOLDER_ICON[tab];
                    const isRead = header.is_read || locallyReadIds.has(header.mail_id);
                    const isSelected = selectedId === header.mail_id;
                    // Not `cond && get(...) ?? fallback`: `??` passes `false`
                    // straight through, so a header with no sender rendered
                    // nothing at all instead of the fallback.
                    const sender =
                      (header.from === undefined ? undefined : names.get(header.from)) ??
                      t('mail.unknownSender');
                    // A Sent mail's sender is you, so the whole Sent folder read
                    // as a column of your own name. Its recipients are already
                    // resolved for the reading pane, so showing them here costs
                    // no extra lookup and is what makes Sent legible without
                    // spending a colour on it.
                    const party = tab === 'sent' ? recipientSummary(header) : sender;
                    return (
                      <li key={header.mail_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(header.mail_id);
                            markLocalRead(header.mail_id);
                            // Gated on ESI's flag, not `isRead` (which also covers
                            // local state) — a failed write must get another
                            // chance on every reopen, not just the next reload.
                            if (!header.is_read) {
                              void markMailReadOnEsi(activeCharacterId, header.mail_id);
                            }
                          }}
                          // `aria-current={false}` renders the string "false",
                          // which is a valid token meaning "not current" — so
                          // this is tidiness, not a bug fix: it drops an
                          // attribute from every unselected row rather than
                          // spelling out the default.
                          aria-current={isSelected ? 'true' : undefined}
                          className={cx(
                            'flex w-full min-w-0 items-start gap-2 border-l-2 py-1.5 pr-3 pl-2.5 text-left transition-colors',
                            'focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
                            // Selection used to be `bg-panel-2` alone — the same
                            // fill hover already paints, so the open mail was
                            // invisible the moment the pointer moved. The accent
                            // edge carries it now, with the fill still there as
                            // the second, non-colour signal beside it.
                            isSelected
                              ? 'border-l-accent bg-panel-2'
                              : 'border-l-transparent hover:bg-panel-2/60'
                          )}
                        >
                          {/* Unread marker, in a fixed-width gutter so read and
                              unread rows keep one left edge — the empty gutter
                              is itself the "read" signal. */}
                          <span
                            aria-hidden="true"
                            className="mt-1.5 flex w-1.5 shrink-0 justify-center"
                          >
                            {!isRead && <span className="size-1.5 rounded-full bg-accent" />}
                          </span>

                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {/* The subject wraps rather than truncating: a
                                clipped subject was the readability complaint,
                                and it is the field that identifies a mail. */}
                            <span
                              className={cx(
                                'line-clamp-2 text-sm break-words',
                                isRead ? 'font-normal text-text-dim' : 'font-semibold text-text'
                              )}
                            >
                              {header.subject || t('mail.noSubject')}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-text-dim">
                              {/* Glyph *and* the folder's name, not the glyph
                                  alone: DESIGN.md §5 blesses a bare decorative
                                  icon only "beside its own visible text label",
                                  and dropping the name would have made folder
                                  identity harder to see than the uppercase tag
                                  this replaced — the opposite of the point,
                                  now that several folders share one list by
                                  default. */}
                              <FolderIcon
                                aria-hidden="true"
                                size={Icon.ICON_SIZE.sm}
                                className="shrink-0"
                              />
                              <span className="shrink-0 tracking-wide uppercase">
                                {t(TAB_LABEL_KEY[tab])}
                              </span>
                              <span aria-hidden="true" className="shrink-0 text-text-faint">
                                ·
                              </span>
                              <span className="min-w-0 truncate">{party}</span>
                              {header.timestamp && (
                                // `text-text-dim`, not the `text-text-faint` this
                                // shipped with: DESIGN.md §1 restricts faint to
                                // decoration, and a received date is content.
                                <span className="ml-auto shrink-0 tabular-nums">
                                  {formatDateOnly(new Date(header.timestamp), timeZone)}
                                </span>
                              )}
                            </span>
                          </span>

                          {/* The dot and the bold weight say "unread" in
                              colour and typography only — DESIGN.md §7's
                              "colour is never the sole signal" wants it in
                              words too. The folder needs no such gloss: its
                              name is rendered above. */}
                          {!isRead && <span className="sr-only">{t('mail.unread')}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {headersTruncated && (
                <p className="border-t border-line p-2 text-[0.6875rem] text-text-dim">
                  {t('mail.capNotice', { count: cappedHeaders.length })}
                </p>
              )}
              {hasMore && (
                <div className="border-t border-line p-2">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? t('common.loading') : t('mail.loadMore')}
                  </Button>
                </div>
              )}
            </Panel>

            <Panel
              className={isDesktop || selectedId !== null ? '' : 'hidden'}
              // The folder the open mail sits in, not a repeat of the select
              // hint the empty body already renders — that string used to
              // appear twice on the same panel at once.
              title={selectedHeader === null ? undefined : t(TAB_LABEL_KEY[selectedTab])}
              meta={
                selectedHeader?.timestamp ? (
                  <span className="text-xs text-text-dim tabular-nums">
                    {formatTimestamp(new Date(selectedHeader.timestamp), timeZone)}
                  </span>
                ) : undefined
              }
              actions={
                showBackControl && (
                  <Button size="sm" onClick={() => setSelectedId(null)}>
                    {t('mail.backToList')}
                  </Button>
                )
              }
            >
              {selectedId === null ? (
                <EmptyState
                  title={t('mail.selectHint')}
                  icon={<Icon.Social size={Icon.ICON_SIZE.lg} />}
                  className="py-6"
                />
              ) : body === undefined ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" label={t('common.loading')} />
                </div>
              ) : body === null ? (
                <EmptyState title={t('mail.emptyTitle')} className="py-4" />
              ) : (
                <div
                  ref={bodyScrollerRef}
                  className="space-y-2 overflow-y-auto text-xs"
                  style={bodyMaxHeight !== null ? { maxHeight: bodyMaxHeight } : undefined}
                >
                  <p className="text-base font-semibold text-text">
                    {body.data.subject || t('mail.noSubject')}
                  </p>
                  <div className="space-y-0.5 border-b border-line pb-2 text-text-dim">
                    {/* The reading pane never said who sent the mail. */}
                    <p>
                      {t('mail.from')} <span className="text-text">{selectedSender}</span>
                    </p>
                    {selectedHeader !== null && recipients.length > 0 && (
                      <p>
                        {t('mail.to')} {recipientNames(selectedHeader).join(', ')}
                      </p>
                    )}
                  </div>
                  {/* `text-sm text-text`, not `text-xs text-text-dim`: this is
                      the one thing the pilot opened the page to read, and it
                      shipped at the smallest size in the dimmest readable
                      tier. `break-words` so an unbroken URL cannot push the
                      pane sideways. */}
                  <p className="text-sm whitespace-pre-wrap text-text break-words">
                    {body.data.body ? stripEveMarkup(body.data.body) : ''}
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

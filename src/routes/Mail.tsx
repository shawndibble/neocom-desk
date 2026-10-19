import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  CachedEmptyState,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  Toast,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner, GrantNote } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { loadMailBody, markMailReadOnEsi } from '@/features/character/mail';
import { useMailScopeSwitch } from '@/features/character/useMailScopeSwitch';
import {
  loadAllMailSnapshot,
  loadMailSnapshot,
  NO_MAILING_LISTS,
  NO_OWNERS,
} from '@/features/character/mailSnapshot';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { NewMailComposer, type NewMailCloseReason } from '@/features/character/NewMailComposer';
import { MailListPane } from '@/features/character/MailListPane';
import { MailReaderBody } from '@/features/character/MailReaderBody';
import { useMailPaging } from '@/features/character/useMailPaging';
import { TAB_LABEL_KEY, type MailRow } from '@/features/character/mailDisplay';
import type { CachedResult } from '@/esi/cache';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { useMailFolders } from '@/features/character/mailFolderPref';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, textParam } from '@/lib/urlState';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import { useNow } from '@/lib/useNow';
import { groupMailByAge } from '@/engine/mail/mailAge';
import {
  capHeadersForDisplay,
  mailKey,
  mailSearchMatches,
  mergeOwnedMail,
  resolveMailTab,
  sumUnreadByTab,
  MAIL_FOLDERS,
  type ComposeKind,
  type MailTab,
} from '@/engine/mail/mail';
import type { MailBody, MailHeader } from '@/esi/endpoints';

const SEARCH_PARAM = textParam();
const HIDE_READ_PARAM = boolParam();
const MAIL_FILTER_PARAMS = { search: SEARCH_PARAM, hideRead: HIDE_READ_PARAM };

interface MailViewProps {
  scope: CharacterFilterValue;
  /** The This/All picker (with per-Character unread), null when there is one Character to offer. */
  scopeControl: ReactNode;
}

/** Mail's two-pane client for one scope: list beside reading pane, the list scrolls on its own, the reading pane grows with the page (docs/context/decisions/20261012-161659-mail-reading-pane-scrolls-with-the-page-not.md). */
function MailView({ scope, scopeControl }: MailViewProps) {
  const { t } = useTranslation();
  const isAll = scope === 'all';
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    isAll ? loadAllMailSnapshot : loadMailSnapshot,
    undefined,
    { cacheKey: isAll ? 'mail-all' : 'mail' }
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
  useHydratedStore(useMailFolders);
  function toggleFolder(folder: MailTab) {
    void setFolders(
      folders.includes(folder) ? folders.filter((f) => f !== folder) : [...folders, folder]
    );
  }

  // The open mail, as owner + `mail_id`: the id alone repeats across mailboxes.
  const [selected, setSelected] = useState<{
    ownerId: number;
    mailId: number;
    key: string;
  } | null>(null);
  const selectedKey = selected?.key ?? null;
  // Which compose box is open, if any (mail-reply-and-forward decision) —
  // reset below whenever the selected mail changes, so switching mails never
  // leaves a stale Reply/Forward box open against the wrong header.
  const [composeKind, setComposeKind] = useState<ComposeKind | null>(null);
  // New Mail compose (full-pane on a phone, inline in the reading pane on a
  // wide screen) and the one-line notice it leaves behind.
  const [newMailOpen, setNewMailOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Whichever Compose button is on screen (header on a wide screen, floating
  // on a phone); focus returns to it when the composer closes.
  const composeButtonRef = useRef<HTMLButtonElement>(null);
  const composerWasOpenRef = useRef(false);
  useEffect(() => {
    if (newMailOpen) {
      composerWasOpenRef.current = true;
    } else if (composerWasOpenRef.current) {
      composerWasOpenRef.current = false;
      composeButtonRef.current?.focus();
    }
  }, [newMailOpen]);
  function selectMail(target: { ownerId: number; mailId: number } | null) {
    setSelected(target && { ...target, key: mailKey(target.ownerId, target.mailId) });
    setComposeKind(null);
  }

  // Focus management below the `lg:` breakpoint (issue #1485), where opening
  // a mail hides the list Panel and Back hides the reader Panel again — both
  // CSS `hidden`, not an unmount, so nothing here needs a mount effect, only
  // a place to land focus once the swap has happened.
  const isDesktop = useIsDesktop();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The exact row button last clicked to open a mail — a DOM node, not a
  // mail id + `querySelector`, so a row the "Hide read" filter has since
  // removed from the list is simply not `.isConnected` rather than matching
  // some other row that happens to share an id after a re-render.
  const openedRowRef = useRef<HTMLButtonElement | null>(null);
  // Reader heading focus: fires once `body` has actually resolved for the
  // newly selected mail, not the instant `selectedKey` changes — focusing a
  // still-loading pane would land on a spinner, not the subject the pilot
  // asked to read. `null` on desktop (both panes stay on screen; the clicked
  // row already keeps its own focus there) and while nothing is selected.
  const readerHeadingRef = useRef<HTMLElement>(null);
  function selectMailFromRow(target: { ownerId: number; mailId: number }, row: HTMLButtonElement) {
    openedRowRef.current = row;
    selectMail(target);
  }
  // Back-to-list focus restore: only when the pilot actually pressed Back
  // (captured below), never for an unrelated `selectedKey` reset — e.g.
  // switching characters, which also lands on `selectedKey === null`.
  const backToListRef = useRef(false);
  function handleBackToList() {
    backToListRef.current = true;
    selectMail(null);
  }
  useEffect(() => {
    if (selectedKey !== null) return;
    // Cleared unconditionally the moment `selectedKey` goes null, before the
    // `isDesktop` check below — otherwise a resize straight after the Back
    // click (landing between the click and this effect's commit) could skip
    // the reset entirely, leaving a stale flag that a later, unrelated
    // `selectedKey` reset (a character switch) would misread as "Back was
    // pressed" and wrongly steal focus for.
    const wasBackPressed = backToListRef.current;
    backToListRef.current = false;
    if (!wasBackPressed || isDesktop) return;
    const row = openedRowRef.current;
    if (row && row.isConnected) row.focus();
    else searchInputRef.current?.focus();
  }, [selectedKey, isDesktop]);

  // Reply/Forward focus restore (issue #1485): both buttons unmount the
  // instant `composeKind` is set (replaced by the compose box in the same
  // spot), so Cancel/Send — which unmount the compose box in turn — have
  // nothing to hand focus back to unless it's remembered up front. Records
  // which button opened it and which mail it opened it for; a mail switch
  // clears `composeKind` too (see `selectMail`), and that must NOT steal
  // focus back to a Reply/Forward button on a mail the pilot has since left.
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const composeOpenedFromRef = useRef<{ kind: ComposeKind; key: string } | null>(null);
  function openCompose(kind: ComposeKind, key: string) {
    composeOpenedFromRef.current = { kind, key };
    setComposeKind(kind);
  }
  useEffect(() => {
    if (composeKind !== null) return;
    const opened = composeOpenedFromRef.current;
    if (opened === null) return;
    composeOpenedFromRef.current = null;
    if (selectedKey !== opened.key) return;
    const button = opened.kind === 'reply' ? replyButtonRef.current : forwardButtonRef.current;
    button?.focus();
  }, [composeKind, selectedKey]);
  // Local "mark read" state, applied instantly on selection so the dim never
  // waits on the network — independent of `markMailReadOnEsi`'s own write
  // below. Set on selection, not toggled — no manual mark-unread control.
  const [locallyReadKeys, setLocallyReadKeys] = useState<ReadonlySet<string>>(new Set());
  function markLocalRead(key: string) {
    setLocallyReadKeys((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  }

  // Short-lived view state (ADR 0015): survives a reload, absent when default.
  const [filters, setFilters] = useUrlParams(MAIL_FILTER_PARAMS);
  const { search, hideRead } = filters;
  const setSearch = (value: string) => setFilters({ search: value });
  const setHideRead = (value: boolean) => setFilters({ hideRead: value });
  // Debounced separately from `search` (matches Assets.tsx/Market.tsx/
  // SkillPicker.tsx's own search debounce, issue #416): the input stays
  // instantly responsive, only the filter over potentially hundreds of
  // headers below waits out the debounce.
  const [debouncedSearch, setDebouncedSearch] = useDebouncedValue(search);
  const [bodySnapshot, setBodySnapshot] = useState<{
    key: string;
    result: CachedResult<MailBody> | null;
  } | null>(null);
  /** Bumped by "Try again" on a body that could not be read, to refetch it. */
  const [bodyAttempt, setBodyAttempt] = useState(0);
  const online = useOnline();

  // The pilot's Local/EVE-time preference, the same way Contracts,
  // Notifications and Clones thread it into their own timestamps.
  const timeZone = useTimeZone();
  const weekStart = useCalendarWeekStart((state) => state.value);
  // Minute clock, so a list left open past midnight moves its mail out of Today.
  const now = useNow();

  const owners = data?.owners ?? NO_OWNERS;
  const ownerById = useMemo(() => new Map(owners.map((o) => [o.characterId, o])), [owners]);

  const {
    loadedHeaders,
    names,
    senderAffiliations,
    hasMore,
    loadingMore,
    loadMoreFailure,
    handleLoadMore,
    refetchOwnerHeaders,
  } = useMailPaging(data, owners, ownerById);
  // The first mailbox stands in for the whole view in the empty state: with
  // none cached anywhere there is nothing better to say about it.
  const headersResult = owners[0]?.headersResult ?? null;
  const offline = owners.some((o) => o.headersResult?.fromCache);
  // The oldest read governs: a view is only as fresh as its stalest mailbox.
  const fetchedAt = owners.reduce<Date | null>((oldest, o) => {
    const at = o.headersResult?.fetchedAt;
    return at && (oldest === null || at < oldest) ? at : oldest;
  }, null);
  const needsReauth = data?.needsReauth ?? false;
  const unreadByTab = useMemo(() => sumUnreadByTab(owners.map((o) => o.labels)), [owners]);
  const mailingListNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const list of data?.mailingLists ?? NO_MAILING_LISTS)
      map.set(list.mailing_list_id, list.name);
    return map;
  }, [data]);

  const rows = useMemo<MailRow[]>(
    () =>
      mergeOwnedMail(
        owners.map((o) => ({
          characterId: o.characterId,
          characterName: o.name,
          headers: loadedHeaders?.get(o.characterId) ?? o.headersResult?.data ?? [],
        }))
      ).map(({ ownerId, ownerName, header }) => ({
        key: mailKey(ownerId, header.mail_id),
        ownerId,
        ownerName,
        header,
        tab: resolveMailTab(header.labels, ownerById.get(ownerId)?.labelTabById ?? new Map()),
      })),
    [owners, ownerById, loadedHeaders]
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
        ? searchRows.filter((row) => !(row.header.is_read || locallyReadKeys.has(row.key)))
        : searchRows,
    [searchRows, hideRead, locallyReadKeys]
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

  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;
  const selectedHeader = selectedRow?.header ?? null;
  const selectedOwner = selectedRow ? ownerById.get(selectedRow.ownerId) : undefined;
  // The open mail's mailbox is gone (character switch, scope flip, a refresh
  // that dropped it): close it rather than read someone else's body into it.
  if (selected !== null && data !== null && !ownerById.has(selected.ownerId)) selectMail(null);

  /**
   * A recipient's display name. A mailing list resolves through the
   * mailboxes' own lists rather than `/universe/names`, which cannot
   * resolve a list id at all (see `namePartyIds`).
   */
  function resolveRecipientName(r: { recipient_id: number; recipient_type: string }): string {
    return r.recipient_type === 'mailing_list'
      ? (mailingListNames.get(r.recipient_id) ?? t('mail.mailingList'))
      : (names.get(r.recipient_id) ?? t('mail.unknownRecipient'));
  }

  /** A header's recipients as display names. */
  function recipientNames(header: MailHeader): string[] {
    return (header.recipients ?? []).map(resolveRecipientName);
  }

  /** The same recipients, cut to one name plus a count — a list row has one line for them. */
  function recipientSummary(header: MailHeader): string {
    const all = recipientNames(header);
    if (all.length === 0) return t('mail.unknownRecipient');
    if (all.length === 1) return all[0];
    return t('mail.recipientMore', { name: all[0], count: all.length - 1 });
  }

  /** After a successful Reply/Forward/New Mail send: close any compose box, refetch that mailbox's headers. */
  function handleSent(ownerId: number) {
    setComposeKind(null);
    void refetchOwnerHeaders(ownerId);
  }

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    void loadMailBody(selected.ownerId, selected.mailId).then((result) => {
      if (!cancelled) setBodySnapshot({ key: selected.key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, bodyAttempt]);

  const body = bodySnapshot?.key === selectedKey ? bodySnapshot.result : undefined;
  const [bodyRetryRef, , holdBodyFocus] = useRetryFocus<HTMLDivElement>(
    body === undefined ? 'busy' : body === null ? 'failed' : 'ok',
    selectedKey
  );
  // Stripped once, shared by the reading pane's own paragraph and the
  // compose box's auto-quote — both must quote exactly what the pilot reads.
  const bodyText = body?.data.body ? stripEveMarkup(body.data.body) : '';

  // `enabled: !isDesktop` — narrow-only; see `useFocusHeading`'s own doc
  // comment for why that's a separate param rather than folded into the key.
  // Off while composing too: Reply/Forward render from the header alone, so a
  // pilot can open one before the body loads — the compose box then mounts
  // with the body, and its own focus must not lose to this heading's.
  useFocusHeading(
    readerHeadingRef,
    body === undefined ? null : selectedKey,
    !isDesktop && composeKind === null
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const composeCharacterId = activeCharacterId;
  function openNewMail() {
    setNewMailOpen(true);
  }
  function openRow(row: MailRow, button: HTMLButtonElement) {
    selectMailFromRow({ ownerId: row.ownerId, mailId: row.header.mail_id }, button);
    markLocalRead(row.key);
    // Gated on ESI's flag, not the row's `isRead` (which also covers local
    // state) — a failed write must get another chance on every reopen, not
    // just the next reload.
    if (!row.header.is_read) {
      void markMailReadOnEsi(row.ownerId, row.header.mail_id);
    }
  }
  function clearSearch() {
    setSearch('');
    setDebouncedSearch('');
    searchInputRef.current?.focus();
  }
  function showRead() {
    setHideRead(false);
    // The pressed button unmounts with the empty state; land on the filter row (Hide read is next).
    searchInputRef.current?.focus();
  }
  function closeNewMail(reason: NewMailCloseReason) {
    setNewMailOpen(false);
    if (reason === 'kept') setNotice(t('mail.draftSaved'));
  }
  function handleNewMailSent() {
    setNewMailOpen(false);
    setNotice(t('mail.sentToast'));
    handleSent(composeCharacterId);
  }

  // The composer takes the reader's place on a wide screen.
  const newMailInline = newMailOpen && isDesktop;
  const readerVisible = !newMailInline && (isDesktop || selectedKey !== null);
  const showBackControl = !isDesktop && selectedKey !== null;
  const selectedTab = selectedRow?.tab ?? 'inbox';
  const selectedSender =
    (selectedHeader?.from === undefined ? undefined : names.get(selectedHeader.from)) ??
    t('mail.unknownSender');

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('mail.title')}
        meta={
          <>
            {fetchedAt && <DataAgeBadge date={fetchedAt} />}
            {scopeControl}
            {isAll && data && data.skipped.length > 0 && (
              <CharacterScopeReadout
                scope="all"
                total={owners.length + data.skipped.length}
                missing={data.skipped.map((c) => c.name)}
              />
            )}
          </>
        }
        actions={
          <>
            {isDesktop && !newMailOpen && (
              <Button ref={composeButtonRef} size="md" onClick={openNewMail}>
                <Icon.MailCompose size={Icon.ICON_SIZE.sm} /> {t('mail.compose')}
              </Button>
            )}
            <IconButton
              icon={<Icon.Refresh />}
              label={t('mail.refresh')}
              onClick={refresh}
              busy={loading}
            />
          </>
        }
      />

      {isAll &&
        data?.skipped
          .filter((c) => !c.granted)
          .map((c) => (
            // Shown only while that Character's stored grant really lacks the mail scope.
            <GrantNote
              key={c.characterId}
              characterId={c.characterId}
              characterName={c.name}
              endpoints={['getCharacterMailHeaders']}
              title={t('mail.reauthTitle')}
              hint={t('mail.reauthHint')}
              actionLabel={t('mail.reauthAction')}
            />
          ))}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : needsReauth && (!headersResult || rows.length === 0) ? (
        // A lapsed grant with no saved mail: the full banner. With saved mail
        // the list stays and a small note sits above it.
        <GrantBanner
          characterId={activeCharacterId}
          endpoints={['getCharacterMailHeaders']}
          title={t('mail.reauthTitle')}
          hint={t('mail.reauthHint')}
          actionLabel={t('mail.reauthAction')}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !headersResult || rows.length === 0 ? (
        <CachedEmptyState
          result={headersResult}
          title={t('mail.emptyTitle')}
          hint={t('mail.emptyHint')}
          fetchedTitle={t('mail.emptyFetchedTitle')}
        />
      ) : (
        <>
          {needsReauth && (
            <ReauthCachedNote
              characterId={activeCharacterId}
              endpoints={['getCharacterMailHeaders']}
            />
          )}
          {offline && <CachedNotice fetchedAt={fetchedAt} />}

          {(isDesktop || selectedKey === null) && (
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
                    onToggle={() => toggleFolder(folder)}
                  />
                );
              })}
            </div>
          )}

          {(isDesktop || selectedKey === null) && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('mail.searchPlaceholder')}
                aria-label={t('mail.searchLabel')}
                className="min-w-0 flex-1"
              />
              <FilterChip
                label={t('mail.hideRead')}
                selected={hideRead}
                onToggle={() => setHideRead(!hideRead)}
                size="md"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[24rem_minmax(0,1fr)]">
            <MailListPane
              visible={isDesktop || selectedKey === null}
              listState={listState}
              folderCount={folders.length}
              hasMore={hasMore}
              offline={offline}
              onShowAllFolders={() => void setFolders(MAIL_FOLDERS)}
              onClearSearch={clearSearch}
              onShowRead={showRead}
              rowSections={rowSections}
              isAll={isAll}
              names={names}
              locallyReadKeys={locallyReadKeys}
              selectedKey={selectedKey}
              timeZone={timeZone}
              recipientSummary={recipientSummary}
              onOpenRow={openRow}
              headersTruncated={headersTruncated}
              cappedCount={cappedRows.length}
              loadingMore={loadingMore}
              loadMoreFailure={loadMoreFailure}
              onLoadMore={() => void handleLoadMore()}
            />

            {newMailInline && (
              <Panel className="min-w-0">
                <NewMailComposer
                  key={composeCharacterId}
                  characterId={composeCharacterId}
                  fullPane={false}
                  onClose={closeNewMail}
                  onSent={handleNewMailSent}
                />
              </Panel>
            )}

            <Panel
              className={readerVisible ? 'min-w-0' : 'hidden'}
              // The folder the open mail sits in, not a repeat of the select
              // hint the empty body already renders — that string used to
              // appear twice on the same panel at once.
              title={selectedHeader === null ? undefined : t(TAB_LABEL_KEY[selectedTab])}
              meta={
                selectedHeader?.timestamp || (isAll && selectedRow) ? (
                  <span className="flex items-center gap-2 text-xs text-text-dim">
                    {isAll && selectedRow && (
                      <span className="inline-flex items-center gap-1">
                        <CharacterAvatar
                          characterId={selectedRow.ownerId}
                          size="sm"
                          loading="lazy"
                          className="rounded-full"
                        />
                        {t('mail.readingFor', { name: selectedRow.ownerName })}
                      </span>
                    )}
                    {selectedHeader?.timestamp && (
                      <span className="tabular-nums">
                        {formatTimestamp(new Date(selectedHeader.timestamp), timeZone)}
                      </span>
                    )}
                  </span>
                ) : undefined
              }
              actions={
                (selectedRow !== null && composeKind === null) || showBackControl ? (
                  <div className="flex items-center gap-2">
                    {selectedRow !== null && composeKind === null && (
                      <>
                        <IconButton
                          ref={replyButtonRef}
                          icon={<Icon.MailReply size={Icon.ICON_SIZE.sm} />}
                          label={t('mail.reply')}
                          size="row"
                          onClick={() => openCompose('reply', selectedRow.key)}
                        />
                        <IconButton
                          ref={forwardButtonRef}
                          icon={<Icon.MailForward size={Icon.ICON_SIZE.sm} />}
                          label={t('mail.forward')}
                          size="row"
                          onClick={() => openCompose('forward', selectedRow.key)}
                        />
                      </>
                    )}
                    {showBackControl && (
                      <Button size="sm" onClick={handleBackToList}>
                        {t('mail.backToList')}
                      </Button>
                    )}
                  </div>
                ) : undefined
              }
            >
              <MailReaderBody
                bodyRetryRef={bodyRetryRef}
                selectedKey={selectedKey}
                readerVisible={readerVisible}
                body={body}
                bodyText={bodyText}
                online={online}
                readerHeadingRef={readerHeadingRef}
                onCompose={openNewMail}
                onRetry={() => {
                  // The retry button unmounts while the body loads: the wrapper holds focus meanwhile.
                  holdBodyFocus();
                  setBodySnapshot(null);
                  setBodyAttempt((n) => n + 1);
                }}
                selectedRow={selectedRow}
                selectedOwner={selectedOwner}
                selectedSender={selectedSender}
                senderAffiliations={senderAffiliations}
                resolveRecipientName={resolveRecipientName}
                composeKind={composeKind}
                timeZone={timeZone}
                onCloseCompose={() => setComposeKind(null)}
                onSent={handleSent}
              />
            </Panel>
          </div>
        </>
      )}

      {newMailOpen && !isDesktop && (
        <NewMailComposer
          key={composeCharacterId}
          characterId={composeCharacterId}
          fullPane
          onClose={closeNewMail}
          onSent={handleNewMailSent}
        />
      )}
      {!isDesktop && !newMailOpen && selectedKey === null && (
        // 5rem clears the bottom nav (Layout's `<nav>`, which has no shared height token).
        <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30">
          <Button
            ref={composeButtonRef}
            variant="primary"
            className="shadow-lg"
            onClick={openNewMail}
          >
            <Icon.MailCompose size={Icon.ICON_SIZE.sm} /> {t('mail.compose')}
          </Button>
        </div>
      )}
      {notice !== null && <Toast message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

/**
 * Mail: This character or All characters (issue #2867). The scope picker is the
 * shared `CharacterFilterControl` (#2846); the choice is remembered device-wide
 * like the folder selection, and a `scope` URL param overrides it for one view.
 * `MailView` is keyed on the scope so each one loads on its own snapshot.
 */
export function Mail() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { scope, scopeHydrated, offered, characterCount, unreadByCharacter, changeScope } =
    useMailScopeSwitch();

  if (!scopeHydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  return (
    <MailView
      key={scope}
      scope={scope}
      scopeControl={
        offered ? (
          <CharacterFilterControl
            activeCharacterId={activeCharacterId}
            value={scope}
            onChange={changeScope}
            characterCount={characterCount}
            unreadByCharacter={unreadByCharacter}
            size="md"
          />
        ) : null
      }
    />
  );
}

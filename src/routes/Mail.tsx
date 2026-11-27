import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  CachedEmptyState,
  LoadFailedState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Toast,
  CachedNotice,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import * as Icon from '@/components/ui/icons';
import { GrantBanner, GrantNote } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { markMailReadOnEsi } from '@/features/character/mail';
import { useMailScopeSwitch } from '@/features/character/useMailScopeSwitch';
import { useMailOpenParam, type MailOpenTarget } from '@/features/character/useMailOpenParam';
import {
  loadAllMailSnapshot,
  loadMailSnapshot,
  NO_MAILING_LISTS,
  NO_OWNERS,
} from '@/features/character/mailSnapshot';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { NewMailComposer, type NewMailCloseReason } from '@/features/character/NewMailComposer';
import { MailListPane } from '@/features/character/MailListPane';
import { MailFilterBar } from '@/features/character/MailFilterBar';
import { MailReaderBody } from '@/features/character/MailReaderBody';
import { useMailPaging } from '@/features/character/useMailPaging';
import { useMailSelection } from '@/features/character/useMailSelection';
import { useMailBody } from '@/features/character/useMailBody';
import { useMailRows } from '@/features/character/useMailRows';
import { isMailRead, TAB_LABEL_KEY, type MailRow } from '@/features/character/mailDisplay';
import { MailRowMenu } from '@/features/character/MailRowMenu';
import { MailSelectionBar } from '@/features/character/MailSelectionBar';
import { useMailOrganize, useMailReadState } from '@/features/character/useMailOrganize';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useMailFolders } from '@/features/character/mailFolderPref';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, textParam } from '@/lib/urlState';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import { useNow } from '@/lib/useNow';
import { applyUnreadDelta, sumUnreadByTab, MAIL_FOLDERS, type MailTab } from '@/engine/mail/mail';
import type { MailHeader } from '@/esi/endpoints';

const SEARCH_PARAM = textParam();
const HIDE_READ_PARAM = boolParam();
const MAIL_FILTER_PARAMS = { search: SEARCH_PARAM, hideRead: HIDE_READ_PARAM };

interface MailViewProps {
  scope: CharacterFilterValue;
  openTarget: MailOpenTarget | null;
  scopeControl: (state: { missingNames?: readonly string[]; loading: boolean }) => ReactNode;
}

function MailView({ scope, scopeControl, openTarget }: MailViewProps) {
  const { t } = useTranslation();
  const isAll = scope === 'all';
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    isAll ? loadAllMailSnapshot : loadMailSnapshot,
    undefined,
    { cacheKey: isAll ? 'mail-all' : 'mail' }
  );

  const folders = useMailFolders((state) => state.value);
  const setFolders = useMailFolders((state) => state.setValue);
  useHydratedStore(useMailFolders);
  function toggleFolder(folder: MailTab) {
    void setFolders(
      folders.includes(folder) ? folders.filter((f) => f !== folder) : [...folders, folder]
    );
  }

  const [newMailOpen, setNewMailOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
  const isDesktop = useIsDesktop();
  const {
    selected,
    selectedKey,
    composeKind,
    setComposeKind,
    selectMail,
    selectMailFromRow,
    handleBackToList,
    openCompose,
    searchInputRef,
    replyButtonRef,
    forwardButtonRef,
  } = useMailSelection(isDesktop);
  const readState = useMailReadState();
  const { locallyReadKeys, locallyUnreadKeys, deletedKeys, markLocalRead } = readState;

  const [filters, setFilters] = useUrlParams(MAIL_FILTER_PARAMS);
  const { search, hideRead } = filters;
  const setSearch = (value: string) => setFilters({ search: value });
  const setHideRead = (value: boolean) => setFilters({ hideRead: value });
  const [debouncedSearch, setDebouncedSearch] = useDebouncedValue(search);
  const online = useOnline();

  const timeZone = useTimeZone();
  const weekStart = useCalendarWeekStart((state) => state.value);
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
  const headersResult = owners[0]?.headersResult ?? null;
  const offline = owners.some((o) => o.headersResult?.fromCache);
  const fetchedAt = owners.reduce<Date | null>((oldest, o) => {
    const at = o.headersResult?.fetchedAt;
    return at && (oldest === null || at < oldest) ? at : oldest;
  }, null);
  const needsReauth = data?.needsReauth ?? false;
  const labelUnreadByTab = useMemo(() => sumUnreadByTab(owners.map((o) => o.labels)), [owners]);
  const mailingListNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const list of data?.mailingLists ?? NO_MAILING_LISTS)
      map.set(list.mailing_list_id, list.name);
    return map;
  }, [data]);

  const { rows, cappedRows, headersTruncated, rowSections, listState, unreadDelta } = useMailRows({
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
  });

  const unreadByTab = useMemo(
    () => applyUnreadDelta(labelUnreadByTab, unreadDelta),
    [labelUnreadByTab, unreadDelta]
  );
  const organize = useMailOrganize({
    owners,
    rows: cappedRows,
    readState,
    selectedKey,
    onDeletedSelected: () => selectMail(null),
    notify: setNotice,
  });
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;
  const selectedHeader = selectedRow?.header ?? null;
  const selectedOwner = selectedRow ? ownerById.get(selectedRow.ownerId) : undefined;
  if (selected !== null && data !== null && !ownerById.has(selected.ownerId)) selectMail(null);

  function resolveRecipientName(r: { recipient_id: number; recipient_type: string }): string {
    return r.recipient_type === 'mailing_list'
      ? (mailingListNames.get(r.recipient_id) ?? t('mail.mailingList'))
      : (names.get(r.recipient_id) ?? t('mail.unknownRecipient'));
  }

  function recipientNames(header: MailHeader): string[] {
    return (header.recipients ?? []).map(resolveRecipientName);
  }

  function recipientSummary(header: MailHeader): string {
    const all = recipientNames(header);
    if (all.length === 0) return t('mail.unknownRecipient');
    if (all.length === 1) return all[0];
    return t('mail.recipientMore', { name: all[0], count: all.length - 1 });
  }

  function handleSent(ownerId: number) {
    setComposeKind(null);
    void refetchOwnerHeaders(ownerId);
  }

  const [openedFor, setOpenedFor] = useState<MailOpenTarget | null>(null);
  const openWanted = openTarget;
  if (openWanted !== null && openedFor !== openWanted) {
    const row = rows.find(
      (r) =>
        r.header.mail_id === openWanted.mailId &&
        r.ownerId === (openWanted.ownerId ?? activeCharacterId)
    );
    if (row) {
      setOpenedFor(openWanted);
      selectMail({ ownerId: row.ownerId, mailId: row.header.mail_id });
      markLocalRead(row.key);
    }
  }
  useEffect(() => {
    if (openedFor === null || !selectedRow || selectedRow.header.is_read) return;
    void markMailReadOnEsi(selectedRow.ownerId, selectedRow.header.mail_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedFor]);

  const { body, bodyText, bodyRetryRef, readerHeadingRef, retry } = useMailBody(
    selected,
    isDesktop,
    composeKind
  );

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const composeCharacterId = activeCharacterId;
  function openNewMail() {
    setNewMailOpen(true);
  }
  function openRow(row: MailRow, button: HTMLButtonElement) {
    selectMailFromRow({ ownerId: row.ownerId, mailId: row.header.mail_id }, button);
    markLocalRead(row.key);
    if (!row.header.is_read || locallyUnreadKeys.has(row.key)) {
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

  const newMailInline = newMailOpen && isDesktop;
  const newMailPanel = newMailInline ? (
    <Panel className="min-w-0">
      <NewMailComposer
        key={composeCharacterId}
        characterId={composeCharacterId}
        fullPane={false}
        onClose={closeNewMail}
        onSent={handleNewMailSent}
      />
    </Panel>
  ) : null;
  const readerVisible = !newMailInline && (isDesktop || selectedKey !== null);
  const showBackControl = !isDesktop && selectedKey !== null;
  const selectedTab = selectedRow?.tab ?? 'inbox';
  const selectedSender =
    (selectedHeader?.from === undefined ? undefined : names.get(selectedHeader.from)) ??
    t('mail.unknownSender');

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title={t('mail.title')}
        meta={fetchedAt && <DataAgeBadge date={fetchedAt} />}
        scope={scopeControl({
          missingNames: isAll ? data?.skipped.map((c) => c.name) : undefined,
          loading: loading && !data,
        })}
        actions={
          <>
            {isDesktop && !newMailOpen && (
              <Button ref={composeButtonRef} size="md" onClick={openNewMail}>
                <Icon.MailCompose size={Icon.ICON_SIZE.sm} /> {t('mail.compose')}
              </Button>
            )}
            {organize.anyOrganizable && rows.length > 0 && !newMailOpen && (
              <Button size="md" onClick={() => organize.setSelecting(!organize.selecting)}>
                {organize.selecting ? t('mail.doneSelecting') : t('mail.select')}
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
            <GrantNote
              key={c.characterId}
              characterId={c.characterId}
              characterName={c.name}
              endpoints={['getCharacterMailHeaders']}
              title={t('mail.reauthTitle')}
            />
          ))}

      {loading && !data ? (
        <Spinner block="page" label={t('common.loading')} />
      ) : needsReauth && (!headersResult || rows.length === 0) ? (
        <>
          {newMailPanel}
          <GrantBanner characterId={activeCharacterId} endpoints={['getCharacterMailHeaders']} />
        </>
      ) : error ? (
        (newMailPanel ?? <LoadFailedState title={t('common.loadFailed.mail')} onRetry={refresh} />)
      ) : !headersResult || rows.length === 0 ? (
        (newMailPanel ?? (
          <CachedEmptyState
            result={headersResult}
            title={t('mail.emptyTitle')}
            hint={t('mail.emptyHint')}
            fetchedTitle={t('mail.emptyFetchedTitle')}
            fetchedHint={t('mail.emptyFetchedHint')}
          />
        ))
      ) : (
        <>
          {needsReauth && (
            <ReauthCachedNote
              characterId={activeCharacterId}
              endpoints={['getCharacterMailHeaders']}
            />
          )}
          {offline && <CachedNotice withBadge fetchedAt={fetchedAt} />}
          <GrantNote
            compact
            endpoints={['putCharacterMail']}
            title={t('mail.markReadGrantTitle')}
          />

          {(isDesktop || selectedKey === null) && (
            <MailFilterBar
              folders={folders}
              unreadByTab={unreadByTab}
              onToggleFolder={toggleFolder}
              search={search}
              onSearchChange={setSearch}
              hideRead={hideRead}
              onToggleHideRead={() => setHideRead(!hideRead)}
              searchInputRef={searchInputRef}
            />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[24rem_minmax(0,1fr)] pb-12 lg:pb-0">
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
              locallyUnreadKeys={locallyUnreadKeys}
              organize={{
                canOrganize: organize.canOrganize,
                selecting: organize.selecting,
                checkedKeys: organize.checkedKeys,
                onToggleCheck: organize.toggleCheck,
                onSetRead: (row, read) => void organize.setRead([row], read),
                onDelete: (row) => organize.requestDelete([row]),
              }}
              selectionBar={
                <MailSelectionBar
                  count={organize.checkedRows.length}
                  busy={organize.busy}
                  onMarkRead={() => void organize.setRead(organize.checkedRows, true)}
                  onMarkUnread={() => void organize.setRead(organize.checkedRows, false)}
                  onDelete={() => organize.requestDelete(organize.checkedRows)}
                />
              }
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

            {newMailPanel}

            <Panel
              className={readerVisible ? 'min-w-0' : 'hidden'}
              title={
                selectedHeader === null || !isDesktop ? undefined : t(TAB_LABEL_KEY[selectedTab])
              }
              leading={
                showBackControl ? (
                  <IconButton
                    size="sm"
                    icon={<Icon.Back />}
                    label={t('mail.backToList')}
                    onClick={handleBackToList}
                  />
                ) : undefined
              }
              meta={
                isDesktop && (selectedHeader?.timestamp || (isAll && selectedRow)) ? (
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
                selectedRow !== null && composeKind === null ? (
                  <div className="flex items-center gap-2">
                    {selectedRow !== null && composeKind === null && (
                      <>
                        {isDesktop && (
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
                        {organize.canOrganize(selectedRow) && (
                          <MailRowMenu
                            variant="ghost"
                            label={t('common.moreActions')}
                            isRead={isMailRead(selectedRow, locallyReadKeys, locallyUnreadKeys)}
                            onSetRead={(read) => void organize.setRead([selectedRow], read)}
                            onDelete={() => organize.requestDelete([selectedRow])}
                          />
                        )}
                      </>
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
                onRetry={retry}
                selectedRow={selectedRow}
                selectedOwner={selectedOwner}
                selectedSender={selectedSender}
                senderAffiliations={senderAffiliations}
                resolveRecipientName={resolveRecipientName}
                composeKind={composeKind}
                timeZone={timeZone}
                isDesktop={isDesktop}
                isAll={isAll}
                onCloseCompose={() => setComposeKind(null)}
                onSent={handleSent}
              />
              {!isDesktop && selectedRow !== null && composeKind === null && (
                <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 -mx-3 mt-4 -mb-3 flex gap-2 border-t border-line bg-panel p-3">
                  <Button
                    ref={replyButtonRef}
                    variant="primary"
                    className="flex-1"
                    onClick={() => openCompose('reply', selectedRow.key)}
                  >
                    <Icon.MailReply size={Icon.ICON_SIZE.sm} /> {t('mail.reply')}
                  </Button>
                  <Button
                    ref={forwardButtonRef}
                    className="flex-1"
                    onClick={() => openCompose('forward', selectedRow.key)}
                  >
                    <Icon.MailForward size={Icon.ICON_SIZE.sm} /> {t('mail.forward')}
                  </Button>
                </div>
              )}
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
        <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30">
          <Button ref={composeButtonRef} variant="primary" size="sm" onClick={openNewMail}>
            <Icon.MailCompose size={Icon.ICON_SIZE.sm} /> {t('mail.compose')}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={organize.deleteTargets !== null}
        title={t('mail.deleteTitle', { count: organize.deleteTargets?.length ?? 1 })}
        body={t('mail.deleteBody', { count: organize.deleteTargets?.length ?? 1 })}
        actionLabel={t('mail.deleteAction', { count: organize.deleteTargets?.length ?? 1 })}
        cancelLabel={t('common.cancel')}
        returnFocusFallback={() => searchInputRef.current}
        failedLabel={t('mail.deleteFailed')}
        onConfirm={organize.confirmDelete}
        onClose={organize.cancelDelete}
      />
      {notice !== null && <Toast message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

export function Mail() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { scope, scopeHydrated, characterCount, unreadByCharacter, changeScope } =
    useMailScopeSwitch();
  const openTarget = useMailOpenParam();

  if (!scopeHydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  return (
    <MailView
      key={scope}
      scope={scope}
      openTarget={openTarget}
      scopeControl={({ missingNames, loading }) => (
        <CharacterFilterControl
          activeCharacterId={activeCharacterId}
          value={scope}
          onChange={changeScope}
          characterCount={characterCount}
          unreadByCharacter={unreadByCharacter}
          missingNames={missingNames}
          loading={loading}
        />
      )}
    />
  );
}

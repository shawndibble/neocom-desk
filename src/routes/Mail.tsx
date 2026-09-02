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
  Spinner,
  Tabs,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import {
  loadMailHeaders,
  loadMailBody,
  loadMailLabels,
  loadMoreMailHeaders,
} from '@/features/character/mail';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import {
  buildCustomLabelList,
  buildLabelTabMap,
  resolveMailTab,
  unreadCountsByTab,
  type MailTab,
} from '@/engine/mail';
import type { MailBody, MailHeader, MailLabel, MailLabels } from '@/esi/endpoints';

type ActiveTab = 'all' | MailTab;

const TAB_LABEL_KEY: Record<MailTab, string> = {
  inbox: 'mail.tabInbox',
  sent: 'mail.tabSent',
  corp: 'mail.tabCorp',
  alliance: 'mail.tabAlliance',
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
}

/** Stable identity for the loading/failed fallback, so it doesn't churn every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_LABELS: readonly MailLabel[] = [];

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
  ] = await Promise.all([loadMailHeaders(characterId), loadMailLabels(characterId)]);

  // Already superseded: skip the name lookup, its result would be discarded.
  const ids = signal.cancelled ? [] : namePartyIds(headersResult?.data ?? []);
  const names = await resolveNames(ids);
  return {
    headersResult,
    labelsResult,
    needsReauth: headersNeedsReauth || labelsNeedsReauth,
    names,
    headersHasMore,
  };
}

/** Mail: tabbed, two-pane client — list beside reading pane, each scrolling independently (CONTEXT.md round 18). */
export function Mail() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadMailSnapshot);

  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
  const [selectedLabelIds, setSelectedLabelIds] = useState<ReadonlySet<number>>(new Set());
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
  // Custom-label filters belong to a character, not a refresh: reset them
  // only when the character itself changes, so a manual refresh of the same
  // character keeps the filter the user picked.
  const [labelFilterCharacterId, setLabelFilterCharacterId] = useState(activeCharacterId);
  if (activeCharacterId !== labelFilterCharacterId) {
    setLabelFilterCharacterId(activeCharacterId);
    setSelectedLabelIds(new Set());
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

  const headersResult = data?.headersResult ?? null;
  const needsReauth = data?.needsReauth ?? false;
  const names = loadedNames ?? data?.names ?? NO_NAMES;
  const labels = data?.labelsResult?.data.labels ?? NO_LABELS;
  const labelTabById = useMemo(() => buildLabelTabMap(labels), [labels]);
  const unreadByTab = useMemo(() => unreadCountsByTab(labels), [labels]);
  const customLabels = useMemo(() => buildCustomLabelList(labels), [labels]);

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
        if (activeTab !== 'all' && resolveMailTab(h.labels, labelTabById) !== activeTab) {
          return false;
        }
        if (selectedLabelIds.size === 0) return true;
        return (h.labels ?? []).some((id) => selectedLabelIds.has(id));
      }),
    [headers, activeTab, labelTabById, selectedLabelIds]
  );

  const selectedHeader = headers.find((h) => h.mail_id === selectedId) ?? null;

  function toggleLabelFilter(labelId: number) {
    setSelectedLabelIds((previous) => {
      const next = new Set(previous);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
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

      {loading ? (
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
            <Tabs
              tabs={[
                {
                  id: 'all',
                  label: t('mail.tabAll'),
                  badge: data?.labelsResult?.data.total_unread_count,
                },
                { id: 'inbox', label: t('mail.tabInbox'), badge: unreadByTab.get('inbox') },
                { id: 'corp', label: t('mail.tabCorp'), badge: unreadByTab.get('corp') },
                {
                  id: 'alliance',
                  label: t('mail.tabAlliance'),
                  badge: unreadByTab.get('alliance'),
                },
                { id: 'sent', label: t('mail.tabSent') },
              ]}
              value={activeTab}
              onChange={(id) => setActiveTab(id as ActiveTab)}
              label={t('mail.tabsLabel')}
              className="overflow-x-auto"
            />
          )}

          {customLabels.length > 0 && (isDesktop || selectedId === null) && (
            <div
              role="group"
              aria-label={t('mail.labelsFilterLabel')}
              className="flex flex-wrap gap-2"
            >
              {customLabels.map((label) => (
                <FilterChip
                  key={label.label_id}
                  label={label.name ?? ''}
                  selected={selectedLabelIds.has(label.label_id)}
                  onToggle={() => toggleLabelFilter(label.label_id)}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
            <Panel padded={false} className={isDesktop || selectedId === null ? '' : 'hidden'}>
              {visibleHeaders.length === 0 ? (
                <p className="p-3 text-xs text-text-dim">{t('mail.emptyTitle')}</p>
              ) : (
                <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
                  {visibleHeaders.map((header) => {
                    const tab = resolveMailTab(header.labels, labelTabById);
                    const unread = header.is_read ? 'text-text-dim' : 'font-semibold';
                    return (
                      <li key={header.mail_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(header.mail_id)}
                          aria-current={selectedId === header.mail_id}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-panel-2 ${
                            selectedId === header.mail_id ? 'bg-panel-2' : ''
                          }`}
                        >
                          <span className={`w-20 shrink-0 truncate ${unread}`}>
                            {/* Not `cond && get(...) ?? fallback`: `??` passes `false`
                                straight through, so a header with no sender rendered
                                nothing at all instead of the fallback. */}
                            {(header.from === undefined ? undefined : names.get(header.from)) ??
                              t('mail.unknownSender')}
                          </span>
                          <span className={`min-w-0 flex-1 truncate ${unread}`}>
                            {header.subject || t('mail.noSubject')}
                          </span>
                          {header.timestamp && (
                            <span className="hidden shrink-0 text-text-faint sm:inline">
                              {new Date(header.timestamp).toLocaleDateString()}
                            </span>
                          )}
                          <span className="shrink-0 rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 text-[0.625rem] tracking-wide text-text-dim uppercase">
                            {t(TAB_LABEL_KEY[tab])}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
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
              title={selectedId !== null ? undefined : t('mail.selectHint')}
              actions={
                showBackControl && (
                  <Button size="sm" onClick={() => setSelectedId(null)}>
                    {t('mail.backToList')}
                  </Button>
                )
              }
            >
              {selectedId === null ? (
                <p className="text-xs text-text-dim">{t('mail.selectHint')}</p>
              ) : body === undefined ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" label={t('common.loading')} />
                </div>
              ) : body === null ? (
                <EmptyState title={t('mail.emptyTitle')} className="py-4" />
              ) : (
                <div className="max-h-[32rem] space-y-2 overflow-y-auto text-xs">
                  <p className="font-semibold">{body.data.subject || t('mail.noSubject')}</p>
                  {recipients.length > 0 && (
                    <p className="text-text-dim">
                      {t('mail.to')}{' '}
                      {recipients
                        .map((r) =>
                          r.recipient_type === 'mailing_list'
                            ? t('mail.mailingList')
                            : (names.get(r.recipient_id) ?? t('mail.unknownRecipient'))
                        )
                        .join(', ')}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-text-dim">
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

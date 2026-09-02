import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadMailHeaders, loadMailBody, loadMailLabels } from '@/features/character/mail';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { buildLabelTabMap, resolveMailTab, unreadCountsByTab, type MailTab } from '@/engine/mail';
import type { MailBody, MailHeader, MailLabel, MailLabels } from '@/esi/endpoints';

/** Matches the `lg:` breakpoint the two-column grid switches on below (same precedent as Market). */
const DESKTOP_QUERY = '(min-width: 64rem)';

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
}

/** Stable identity for the loading/failed fallback, so it doesn't churn every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_LABELS: readonly MailLabel[] = [];

async function loadMailSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [
    { cached: headersResult, needsReauth: headersNeedsReauth },
    { cached: labelsResult, needsReauth: labelsNeedsReauth },
  ] = await Promise.all([loadMailHeaders(characterId), loadMailLabels(characterId)]);

  // Already superseded: skip the name lookup, its result would be discarded.
  // Mailing-list recipient ids are excluded: `/universe/names` can't resolve
  // them and fails the whole batch on an unresolvable id, which would blank
  // every other name in the same mail.
  const ids = signal.cancelled
    ? []
    : (headersResult?.data ?? []).flatMap((header) => [
        ...(header.from !== undefined ? [header.from] : []),
        ...(header.recipients ?? [])
          .filter((r) => r.recipient_type !== 'mailing_list')
          .map((r) => r.recipient_id),
      ]);
  const names = await resolveNames(ids);
  return {
    headersResult,
    labelsResult,
    needsReauth: headersNeedsReauth || labelsNeedsReauth,
    names,
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

  // Narrow screens show one column at a time (CONTEXT.md round 18); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  const headersResult = data?.headersResult ?? null;
  const needsReauth = data?.needsReauth ?? false;
  const names = data?.names ?? NO_NAMES;
  const labels = data?.labelsResult?.data.labels ?? NO_LABELS;
  const labelTabById = useMemo(() => buildLabelTabMap(labels), [labels]);
  const unreadByTab = useMemo(() => unreadCountsByTab(labels), [labels]);

  const headers = useMemo(
    () =>
      [...(headersResult?.data ?? [])].sort((a, b) =>
        (b.timestamp ?? '').localeCompare(a.timestamp ?? '')
      ),
    [headersResult]
  );

  const visibleHeaders = useMemo(
    () =>
      activeTab === 'all'
        ? headers
        : headers.filter((h) => resolveMailTab(h.labels, labelTabById) === activeTab),
    [headers, activeTab, labelTabById]
  );

  const selectedHeader = headers.find((h) => h.mail_id === selectedId) ?? null;

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
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('mail.title')}</h1>
        <div className="flex items-center gap-2">
          {headersResult && <DataAgeBadge date={headersResult.fetchedAt} />}
          <IconButton
            icon={<Icon.Refresh />}
            label={t('mail.refresh')}
            onClick={refresh}
            disabled={loading}
          />
        </div>
      </header>

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

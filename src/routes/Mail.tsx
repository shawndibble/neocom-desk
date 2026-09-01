import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, ReauthBanner, Spinner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { loadMailHeaders, loadMailBody } from '@/features/character/mail';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { downloadCsv } from '@/lib/downloadCsv';
import { mailCsvColumns } from '@/features/character/mailCsv';
import type { MailBody, MailHeader } from '@/esi/endpoints';

interface Snapshot {
  headersResult: CachedResult<MailHeader[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  headersNeedsReauth: boolean;
  senderNames: Map<number, string>;
}

/** Stable identity for the loading/failed fallback, so it doesn't churn every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

async function loadMailSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: headersResult, needsReauth: headersNeedsReauth } =
    await loadMailHeaders(characterId);
  // Already superseded: skip the name lookup, its result would be discarded.
  const senderIds = signal.cancelled
    ? []
    : (headersResult?.data ?? []).map((h) => h.from).filter((id): id is number => id !== undefined);
  const senderNames = await resolveNames(senderIds);
  return { headersResult, headersNeedsReauth, senderNames };
}

/** Mail: recent headers list + body on click. Read-only, cached for offline. */
export function Mail() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadMailSnapshot);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bodySnapshot, setBodySnapshot] = useState<{
    selectedId: number;
    result: CachedResult<MailBody> | null;
  } | null>(null);

  const headersResult = data?.headersResult ?? null;
  const headersNeedsReauth = data?.headersNeedsReauth ?? false;
  const senderNames = data?.senderNames ?? NO_NAMES;

  const headers = useMemo(
    () =>
      [...(headersResult?.data ?? [])].sort((a, b) =>
        (b.timestamp ?? '').localeCompare(a.timestamp ?? '')
      ),
    [headersResult]
  );

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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('mail.title')}</h1>
        <div className="flex items-center gap-2">
          {headersResult && <DataAgeBadge date={headersResult.fetchedAt} />}
          <Button
            size="sm"
            disabled={headers.length === 0}
            onClick={() =>
              downloadCsv(
                'mail',
                headers,
                mailCsvColumns(t, (id) => senderNames.get(id) ?? t('mail.unknownSender'))
              )
            }
          >
            {t('mail.exportCsv')}
          </Button>
          <Button size="sm" onClick={refresh} disabled={loading}>
            {t('mail.refresh')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : headersNeedsReauth ? (
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
          <Panel padded={false}>
            <ul className="divide-y divide-line">
              {headers.map((header) => (
                <li key={header.mail_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(header.mail_id)}
                    aria-current={selectedId === header.mail_id}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition-colors hover:bg-panel-2 ${
                      selectedId === header.mail_id ? 'bg-panel-2' : ''
                    }`}
                  >
                    <span
                      className={`truncate ${header.is_read ? 'text-text-dim' : 'font-semibold'}`}
                    >
                      {header.subject || t('mail.noSubject')}
                    </span>
                    <span className="truncate text-text-faint">
                      {/* Not `cond && get(...) ?? fallback`: `??` passes `false`
                          straight through, so a header with no sender rendered
                          nothing at all instead of the fallback. */}
                      {(header.from === undefined ? undefined : senderNames.get(header.from)) ??
                        t('mail.unknownSender')}
                      {header.timestamp && ` · ${new Date(header.timestamp).toLocaleString()}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={selectedId !== null ? undefined : t('mail.selectHint')}>
            {selectedId === null ? (
              <p className="text-xs text-text-dim">{t('mail.selectHint')}</p>
            ) : body === undefined ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" label={t('common.loading')} />
              </div>
            ) : body === null ? (
              <EmptyState title={t('mail.emptyTitle')} className="py-4" />
            ) : (
              <div className="space-y-2 text-xs">
                <p className="font-semibold">{body.data.subject || t('mail.noSubject')}</p>
                <p className="whitespace-pre-wrap text-text-dim">
                  {body.data.body ? stripEveMarkup(body.data.body) : ''}
                </p>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

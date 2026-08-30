import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadMailHeaders, loadMailBody } from '@/features/character/mail';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import type { MailBody, MailHeader } from '@/esi/endpoints';

interface Snapshot {
  requestKey: string;
  headersResult: CachedResult<MailHeader[]> | null;
  senderNames: Map<number, string>;
}

/** Mail: recent headers list + body on click. Read-only, cached for offline. */
export function Mail() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bodySnapshot, setBodySnapshot] = useState<{
    selectedId: number;
    result: CachedResult<MailBody> | null;
  } | null>(null);
  const requestKey = `${activeCharacterId}:${refreshKey}`;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const headersResult = await loadMailHeaders(activeCharacterId);
      if (cancelled) return;
      const senderIds = (headersResult?.data ?? [])
        .map((h) => h.from)
        .filter((id): id is number => id !== undefined);
      const senderNames = await resolveNames(senderIds);
      if (cancelled) return;
      setSnapshot({ requestKey, headersResult, senderNames });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [activeCharacterId, refreshKey]);

  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const loading = current === null;
  const headersResult = current?.headersResult ?? null;
  const senderNames = current?.senderNames ?? new Map<number, string>();

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
          <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            {t('mail.refresh')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
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
                      {(header.from !== undefined && senderNames.get(header.from)) ??
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

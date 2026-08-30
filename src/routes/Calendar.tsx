import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { loadCalendarEvents, loadCalendarEvent } from '@/features/character/calendar';
import type { CachedResult } from '@/esi/cache';
import type { CalendarEventDetail, CalendarEventSummary } from '@/esi/endpoints';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { stripEveMarkup } from '@/features/skills/typeDisplay';

interface Snapshot {
  eventsResult: CachedResult<CalendarEventSummary[]> | null;
}

const RESPONSE_KEY: Record<CalendarEventSummary['event_response'], string> = {
  accepted: 'calendar.responseAccepted',
  declined: 'calendar.responseDeclined',
  tentative: 'calendar.responseTentative',
  not_responded: 'calendar.responseNotResponded',
};

async function loadCalendarSnapshot(characterId: number): Promise<Snapshot> {
  const eventsResult = await loadCalendarEvents(characterId);
  return { eventsResult };
}

/** Calendar: upcoming event list + detail on click. Read-only (no respond), cached for offline. */
export function Calendar() {
  const { t } = useTranslation();
  const { data, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadCalendarSnapshot);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<{
    selectedId: number;
    result: CachedResult<CalendarEventDetail> | null;
  } | null>(null);

  const eventsResult = data?.eventsResult ?? null;

  const events = useMemo(
    () => [...(eventsResult?.data ?? [])].sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [eventsResult]
  );

  useEffect(() => {
    if (activeCharacterId === null || selectedId === null) return;
    let cancelled = false;
    void loadCalendarEvent(activeCharacterId, selectedId).then((result) => {
      if (!cancelled) setDetailSnapshot({ selectedId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, selectedId]);

  const detail = detailSnapshot?.selectedId === selectedId ? detailSnapshot.result : undefined;

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
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('calendar.title')}</h1>
        <div className="flex items-center gap-2">
          {eventsResult && <DataAgeBadge date={eventsResult.fetchedAt} />}
          <Button size="sm" onClick={refresh} disabled={loading}>
            {t('calendar.refresh')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !eventsResult || events.length === 0 ? (
        <EmptyState title={t('calendar.emptyTitle')} hint={t('calendar.emptyHint')} />
      ) : (
        <>
          {eventsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          <Panel padded={false}>
            <ul className="divide-y divide-line">
              {events.map((event) => (
                <li key={event.event_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(event.event_id)}
                    aria-current={selectedId === event.event_id}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition-colors hover:bg-panel-2 ${
                      selectedId === event.event_id ? 'bg-panel-2' : ''
                    }`}
                  >
                    <span className="truncate font-semibold">{event.title}</span>
                    <span className="truncate text-text-faint">
                      {new Date(event.event_date).toLocaleString()} ·{' '}
                      {t(RESPONSE_KEY[event.event_response])}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={selectedId === null ? undefined : t('calendar.title')}>
            {selectedId === null ? (
              <p className="text-xs text-text-dim">{t('calendar.selectHint')}</p>
            ) : detail === undefined ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" label={t('common.loading')} />
              </div>
            ) : detail === null ? (
              <EmptyState title={t('calendar.emptyTitle')} className="py-4" />
            ) : (
              <div className="space-y-2 text-xs">
                <p className="font-semibold">{detail.data.title}</p>
                <p className="text-text-dim">
                  {new Date(detail.data.date).toLocaleString()} ·{' '}
                  {t('calendar.importance', { value: detail.data.importance })}
                </p>
                <p className="whitespace-pre-wrap text-text-dim">
                  {stripEveMarkup(detail.data.text)}
                </p>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

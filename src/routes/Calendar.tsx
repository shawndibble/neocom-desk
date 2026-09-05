import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  ReauthBanner,
  Spinner,
  Tabs,
  TextInput,
} from '@/components/ui';
import type { TabItem } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadCalendarEvents } from '@/features/character/calendar';
import { EventDetailModal } from '@/features/character/EventDetailModal';
import { CalendarMonthView } from '@/features/character/CalendarMonthView';
import { CalendarWeekView } from '@/features/character/CalendarWeekView';
import { CalendarAgendaView } from '@/features/character/CalendarAgendaView';
import { useCalendarView, type CalendarViewMode } from '@/features/character/calendarViewPref';
import {
  addMonths,
  addWeeks,
  dayKey,
  formatMonthLabel,
  formatWeekLabel,
  parseJumpDate,
} from '@/lib/calendarGrid';
import type { CachedResult } from '@/esi/cache';
import type { CalendarEventSummary } from '@/esi/endpoints';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { downloadCsv } from '@/lib/downloadCsv';
import { calendarCsvColumns } from '@/features/character/calendarCsv';

interface Snapshot {
  eventsResult: CachedResult<CalendarEventSummary[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  eventsNeedsReauth: boolean;
}

async function loadCalendarSnapshot(characterId: number): Promise<Snapshot> {
  const { cached: eventsResult, needsReauth: eventsNeedsReauth } =
    await loadCalendarEvents(characterId);
  return { eventsResult, eventsNeedsReauth };
}

/** Calendar: Month/Week/Agenda views + detail modal. Read-only (no respond), cached for offline. */
export function Calendar() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadCalendarSnapshot);

  const viewMode = useCalendarView((state) => state.value);
  const setViewMode = useCalendarView((state) => state.setValue);
  const hydrateViewMode = useCalendarView((state) => state.hydrate);
  useEffect(() => {
    void hydrateViewMode();
  }, [hydrateViewMode]);

  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventSummary | null>(null);

  const eventsResult = data?.eventsResult ?? null;
  const eventsNeedsReauth = data?.eventsNeedsReauth ?? false;

  const events = useMemo(
    () => [...(eventsResult?.data ?? [])].sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [eventsResult]
  );

  const tabs: TabItem[] = [
    { id: 'month', label: t('calendar.viewMonth') },
    { id: 'week', label: t('calendar.viewWeek') },
    { id: 'agenda', label: t('calendar.viewAgenda') },
  ];

  function goToday() {
    const today = new Date();
    setMonthAnchor(today);
    setWeekAnchor(today);
  }

  function expandDay(date: Date) {
    setWeekAnchor(date);
    void setViewMode('week');
  }

  /** Row context menu's "Add to Month View" (issue #416): jump Month view to an event's date, from Week or Agenda. */
  function addToMonthView(date: Date) {
    setMonthAnchor(date);
    void setViewMode('month');
  }

  /** "Jump to date" (issue #416): moves whichever anchor the current view navigates by. Agenda has no anchor to jump — it shows every event unfiltered. */
  function jumpToDate(raw: string) {
    const date = parseJumpDate(raw);
    if (!date) return;
    if (viewMode === 'month') setMonthAnchor(date);
    else if (viewMode === 'week') setWeekAnchor(date);
  }

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('calendar.title')}
        meta={eventsResult && <DataAgeBadge date={eventsResult.fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Download />}
              label={t('calendar.exportCsv')}
              disabled={events.length === 0}
              onClick={() => downloadCsv('calendar', events, calendarCsvColumns(t))}
            />
            <IconButton
              icon={<Icon.Refresh />}
              label={t('calendar.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={tabs}
          value={viewMode}
          onChange={(id) => void setViewMode(id as CalendarViewMode)}
          label={t('calendar.viewSwitcherLabel')}
        />
        {viewMode !== 'agenda' && (
          // Period label first, then the controls. "Previous month"/"Next
          // month" as text buttons wrapped onto two lines each at 390px and
          // squeezed the label — which is the one thing here you actually
          // read — down to a wrapped fragment. Chevrons don't wrap, and the
          // label leads.
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-dim">
              {viewMode === 'month' ? formatMonthLabel(monthAnchor) : formatWeekLabel(weekAnchor)}
            </span>
            <IconButton
              size="sm"
              icon={<Icon.Back />}
              label={viewMode === 'month' ? t('calendar.prevMonth') : t('calendar.prevWeek')}
              onClick={() =>
                viewMode === 'month'
                  ? setMonthAnchor((d) => addMonths(d, -1))
                  : setWeekAnchor((d) => addWeeks(d, -1))
              }
            />
            <Button size="sm" onClick={goToday}>
              {t('calendar.today')}
            </Button>
            <IconButton
              size="sm"
              icon={<Icon.Descend />}
              label={viewMode === 'month' ? t('calendar.nextMonth') : t('calendar.nextWeek')}
              onClick={() =>
                viewMode === 'month'
                  ? setMonthAnchor((d) => addMonths(d, 1))
                  : setWeekAnchor((d) => addWeeks(d, 1))
              }
            />
            <TextInput
              type="date"
              size="sm"
              aria-label={t('calendar.jumpToDate')}
              value={dayKey(viewMode === 'month' ? monthAnchor : weekAnchor)}
              onChange={(e) => jumpToDate(e.target.value)}
              className="w-36"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : eventsNeedsReauth ? (
        <ReauthBanner
          title={t('calendar.reauthTitle')}
          hint={t('calendar.reauthHint')}
          actionLabel={t('calendar.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !eventsResult || events.length === 0 ? (
        <EmptyState title={t('calendar.emptyTitle')} hint={t('calendar.emptyHint')} />
      ) : (
        <>
          {eventsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          {viewMode === 'month' && (
            <CalendarMonthView
              monthAnchor={monthAnchor}
              events={events}
              onSelectEvent={setSelectedEvent}
              onExpandDay={expandDay}
            />
          )}
          {viewMode === 'week' && (
            <CalendarWeekView
              weekAnchor={weekAnchor}
              events={events}
              onSelectEvent={setSelectedEvent}
              onAddToMonthView={addToMonthView}
            />
          )}
          {viewMode === 'agenda' && (
            <CalendarAgendaView
              events={events}
              onSelectEvent={setSelectedEvent}
              onAddToMonthView={addToMonthView}
            />
          )}
        </>
      )}

      {selectedEvent && activeCharacterId !== null && (
        <EventDetailModal
          characterId={activeCharacterId}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

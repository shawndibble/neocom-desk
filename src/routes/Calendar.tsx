import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  LoadFailedState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  CachedNotice,
  Toast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { loadCalendarBoard } from '@/features/character/calendarBoardData';
import { EventDetailModal } from '@/features/character/EventDetailModal';
import { skyhookRaidDetail } from '@/features/character/skyhookRaidDetail';
import { sharedPopDetail } from '@/features/character/sharedPopDetail';
import { useSharedPopParam } from '@/features/character/sharedPopLink';
import {
  boardSourcesWithSharedPops,
  sharedPopDeadlineMs,
} from '@/features/character/calendarSharedPops';
import { useSharedPopTime } from '@/features/character/calendarSharedPopTime';
import { RowDetailModal } from '@/features/overview/widgets/RowDetailModal';
import { CalendarMap } from '@/features/character/CalendarMap';
import { CalendarWeekSummary } from '@/features/character/CalendarWeekSummary';
import { CalendarDayTicker } from '@/features/character/CalendarDayTicker';
import { ComingUpRail } from '@/features/character/ComingUpRail';
import { CalendarReauthNotice } from '@/features/character/CalendarReauthNotice';
import { CalendarKindFilterMenu } from '@/features/character/CalendarKindFilterMenu';
import { useCalendarDensity } from '@/features/character/calendarViewPref';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import {
  useCalendarHiddenKinds,
  shownKinds,
  toggleHiddenKind,
} from '@/features/character/calendarKindFilter';
import {
  activeCorpFilter,
  useCalendarCorpFilter,
  useCalendarSharingCorpFilter,
} from '@/features/character/calendarCorpFilter';
import { buildCharacterBoard, type CharacterBoardItemKind } from '@/engine/character/board';
import {
  countsByDay,
  countsByKind,
  filterByCorporation,
  filterByKinds,
  filterBySharingCorporation,
} from '@/engine/character/deadlines';
import {
  addDays,
  addMonths,
  addWeeks,
  buildDaysFrom,
  buildFortnightDays,
  buildMonthGrid,
  dayKey,
  formatFortnightLabel,
  formatMonthLabel,
} from '@/lib/calendarGrid';
import { cellOf, dayStart, type DayZone } from '@/engine/localDay';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useOpenParam } from '@/lib/useOpenParam';
import { useUrlParam } from '@/lib/useUrlState';
import type { UrlParamCodec } from '@/lib/urlState';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { CalendarSettingsForm } from '@/features/settings/CalendarSettingsForm';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { calendarCsvColumns } from '@/features/character/calendarCsv';
import type { CalendarRsvpResponse } from '@/esi/endpoints';

function anchorParam(defaultKey: string): UrlParamCodec<string> {
  return {
    parse: (raw) => {
      if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return defaultKey;
      return dayKey(parseAnchorKey(raw)) === raw ? raw : defaultKey;
    },
    serialize: (value) => (value === defaultKey ? null : value),
  };
}

function parseAnchorKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const TICKER_DAYS = 14;

function applyResponseOverrides<T>(
  items: readonly T[],
  overrides: Map<number, CalendarRsvpResponse> | undefined,
  idOf: (item: T) => number,
  withResponse: (item: T, response: CalendarRsvpResponse) => T
): T[] {
  if (!overrides || overrides.size === 0) return [...items];
  return items.map((item) => {
    const response = overrides.get(idOf(item));
    return response === undefined ? item : withResponse(item, response);
  });
}

export function Calendar() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadCalendarBoard,
    undefined,
    { cacheKey: 'calendar' }
  );
  const isNarrow = useIsNarrow();
  const zone = useTimeZone();

  const density = useCalendarDensity((state) => state.value);
  const setDensity = useCalendarDensity((state) => state.setValue);
  const hiddenKinds = useCalendarHiddenKinds((state) => state.value);
  const setHiddenKinds = useCalendarHiddenKinds((state) => state.setValue);
  const weekStart = useCalendarWeekStart((state) => state.value);
  const sharedPopTime = useSharedPopTime((state) => state.value);
  const savedCorpFilter = useCalendarCorpFilter((state) => state.value);
  const setCorpFilter = useCalendarCorpFilter((state) => state.setValue);
  const savedSharingCorpFilter = useCalendarSharingCorpFilter((state) => state.value);
  const setSharingCorpFilter = useCalendarSharingCorpFilter((state) => state.setValue);
  useHydratedStore(
    useCalendarDensity,
    useCalendarHiddenKinds,
    useCalendarCorpFilter,
    useCalendarSharingCorpFilter,
    useCalendarWeekStart,
    useSharedPopTime
  );

  const [defaultAnchorKey] = useState(() => dayKey(cellOf(Date.now(), zone)));
  const anchorCodec = useMemo(() => anchorParam(defaultAnchorKey), [defaultAnchorKey]);
  const [anchorKey, setAnchorKey] = useUrlParam('anchor', anchorCodec);
  const anchor = useMemo(() => parseAnchorKey(anchorKey), [anchorKey]);
  const anchorKeyRef = useRef(anchorKey);
  useEffect(() => {
    anchorKeyRef.current = anchorKey;
  }, [anchorKey]);
  function setAnchor(next: Date) {
    const key = dayKey(next);
    anchorKeyRef.current = key;
    setAnchorKey(key);
  }
  const [selectedDay, setSelectedDay] = useState<{ zone: DayZone; ms: number } | null>(null);
  const selectedDayMs = selectedDay !== null && selectedDay.zone === zone ? selectedDay.ms : null;
  const setSelectedDayMs = (ms: number | null) => setSelectedDay(ms === null ? null : { zone, ms });
  const openParamId = useOpenParam();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(openParamId);
  const [selectedSkyhookId, setSelectedSkyhookId] = useState<number | null>(null);
  const popParam = useSharedPopParam();
  const [selectedPopId, setSelectedPopId] = useState<string | null>(popParam);

  const [responseOverrides, setResponseOverrides] = useState<
    ReadonlyMap<number, { response: CalendarRsvpResponse; atMs: number }>
  >(new Map());
  const activeOverrides = useMemo(() => {
    if (!data) return undefined;
    const active = new Map<number, CalendarRsvpResponse>();
    for (const [eventId, { response, atMs }] of responseOverrides) {
      if (data.loadedAtMs <= atMs) active.set(eventId, response);
    }
    return active.size > 0 ? active : undefined;
  }, [data, responseOverrides]);

  const nowMs = data?.loadedAtMs ?? 0;

  const eventsWithOverrides = useMemo(
    () =>
      data
        ? applyResponseOverrides(
            data.events,
            activeOverrides,
            (event) => event.event_id,
            (event, response) => ({ ...event, event_response: response })
          )
        : undefined,
    [data, activeOverrides]
  );

  const boardSources = useMemo(
    () =>
      data &&
      boardSourcesWithSharedPops(
        data,
        sharedPopTime,
        data.calendarEvents &&
          applyResponseOverrides(
            data.calendarEvents,
            activeOverrides,
            (source) => Number(source.id),
            (source, response) => ({ ...source, response })
          )
      ),
    [data, activeOverrides, sharedPopTime]
  );

  const board = useMemo(
    () => (boardSources ? buildCharacterBoard({ nowMs, ...boardSources }) : []),
    [boardSources, nowMs]
  );

  const selected = useMemo(() => shownKinds(hiddenKinds), [hiddenKinds]);
  const corpFilter = activeCorpFilter(savedCorpFilter, data?.corporations ?? []);
  const sharingCorpFilter = activeCorpFilter(
    savedSharingCorpFilter,
    data?.sharingCorporations ?? []
  );
  const visible = useMemo(
    () =>
      filterByKinds(
        filterBySharingCorporation(filterByCorporation(board, corpFilter), sharingCorpFilter),
        selected
      ),
    [board, corpFilter, sharingCorpFilter, selected]
  );
  const loads = useMemo(() => countsByDay(visible, zone), [visible, zone]);
  const counts = useMemo(() => countsByKind(board), [board]);

  const railItems = useMemo(
    () =>
      selectedDayMs === null
        ? visible
        : visible.filter((item) => dayStart(item.deadlineMs, zone) === selectedDayMs),
    [visible, selectedDayMs, zone]
  );

  const days = useMemo(() => {
    const today = cellOf(nowMs, zone);
    if (isNarrow) return buildDaysFrom(anchor, TICKER_DAYS, today);
    return density === 'month'
      ? buildMonthGrid(anchor, today, weekStart)
      : buildFortnightDays(anchor, today, weekStart);
  }, [anchor, density, isNarrow, nowMs, weekStart, zone]);

  const events = useMemo(() => eventsWithOverrides ?? [], [eventsWithOverrides]);
  const selectedEvent = events.find((event) => event.event_id === selectedEventId) ?? null;
  const skyhookDetail = useMemo(() => {
    const raid = data?.skyhookRaidDetails.find((r) => r.id === selectedSkyhookId);
    return raid === undefined ? null : skyhookRaidDetail(raid, nowMs, t, zone);
  }, [data, selectedSkyhookId, nowMs, t, zone]);
  const popDetail = useMemo(() => {
    const entry = data?.sharedPops.find((e) => e.pop.id === selectedPopId);
    return entry === undefined ? null : sharedPopDetail(entry, nowMs, t, zone, sharedPopTime);
  }, [data, selectedPopId, nowMs, t, zone, sharedPopTime]);
  const [popDayPending, setPopDayPending] = useState(popParam !== null);
  const [popAnchorKey, setPopAnchorKey] = useState<string | null>(null);
  const [popUnavailable, setPopUnavailable] = useState(false);
  if (popDayPending && data) {
    const entry = data.sharedPops.find((e) => e.pop.id === popParam);
    if (entry === undefined) {
      if (!loading) {
        setPopDayPending(false);
        setSelectedPopId(null);
        if (!error && data.sharedMoonPops !== undefined) setPopUnavailable(true);
      }
    } else {
      setPopDayPending(false);
      const deadlineMs = sharedPopDeadlineMs(entry.pop, sharedPopTime);
      if (!Number.isNaN(deadlineMs)) {
        setSelectedDay({ zone, ms: dayStart(deadlineMs, zone) });
        setPopAnchorKey(dayKey(cellOf(deadlineMs, zone)));
      }
    }
  }
  useEffect(() => {
    if (popAnchorKey === null) return;
    anchorKeyRef.current = popAnchorKey;
    setAnchorKey(popAnchorKey);
  }, [popAnchorKey, setAnchorKey]);

  function goToday() {
    setAnchor(cellOf(Date.now(), zone));
    setSelectedDayMs(null);
  }

  function step(delta: number) {
    const current = parseAnchorKey(anchorKeyRef.current);
    if (isNarrow) {
      setAnchor(addDays(current, delta * TICKER_DAYS));
      return;
    }
    setAnchor(density === 'month' ? addMonths(current, delta) : addWeeks(current, delta));
  }

  const csvColumns = useMemo(() => calendarCsvColumns(t), [t]);
  const eventsExport = useTableExport({
    surface: 'calendar',
    rows: railItems,
    columns: csvColumns,
    source: 'rows',
  });

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const periodLabel =
    density === 'month' ? formatMonthLabel(anchor) : formatFortnightLabel(anchor, weekStart);

  const periodControls = (
    <div className="flex items-center gap-1.5">
      <IconButton
        size="md"
        icon={<Icon.Back />}
        label={density === 'month' ? t('calendar.prevMonth') : t('calendar.prevFortnight')}
        onClick={() => step(-1)}
      />
      <Button size="md" onClick={goToday}>
        {t('calendar.map.today')}
      </Button>
      <IconButton
        size="md"
        icon={<Icon.Descend />}
        label={density === 'month' ? t('calendar.nextMonth') : t('calendar.nextFortnight')}
        onClick={() => step(1)}
      />
      {!isNarrow && (
        <IconButton
          size="md"
          icon={<Icon.CalendarEvent />}
          label={t('calendar.density.fortnightView')}
          tooltip={
            density === 'month' ? t('calendar.density.toFortnight') : t('calendar.density.toMonth')
          }
          pressed={density === 'fortnight'}
          onClick={() => void setDensity(density === 'month' ? 'fortnight' : 'month')}
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-page space-y-3">
      <PageHeader
        title={t('calendar.title')}
        meta={data?.oldestFetchedAt ? <DataAgeBadge date={data.oldestFetchedAt} /> : undefined}
        actions={
          <>
            <CalendarKindFilterMenu
              hidden={hiddenKinds}
              onToggle={(kind: CharacterBoardItemKind) =>
                void setHiddenKinds(toggleHiddenKind(hiddenKinds, kind))
              }
              onShowAll={() => void setHiddenKinds([])}
              onHideAll={(kinds) => void setHiddenKinds(kinds)}
              counts={counts}
              readableKinds={data?.readableKinds ?? []}
              reauthKinds={data?.reauthKinds ?? []}
              corporations={data?.corporations}
              corpFilter={corpFilter}
              onCorpFilter={(filter) => void setCorpFilter(filter)}
              sharingCorporations={data?.sharingCorporations}
              sharingCorpFilter={sharingCorpFilter}
              onSharingCorpFilter={(filter) => void setSharingCorpFilter(filter)}
            />
            <TableActionsMenu name={t('calendar.title')} tableExport={eventsExport} size="md" />
            <IconButton
              icon={<Icon.Refresh />}
              label={t('calendar.refresh')}
              onClick={refresh}
              busy={loading}
            />
            <PageSettingsButton pageName={t('calendar.title')} section="display">
              <CalendarSettingsForm />
            </PageSettingsButton>
          </>
        }
      />

      {loading && !data ? (
        <Spinner block="page" label={t('common.loading')} />
      ) : error ? (
        <LoadFailedState title={t('common.loadFailed.calendar')} onRetry={refresh} />
      ) : (
        <>
          {data?.fromCache && <CachedNotice withBadge fetchedAt={data.oldestFetchedAt} />}
          {popUnavailable && (
            <Toast
              message={t('calendar.sharedPop.unavailable')}
              onClose={() => setPopUnavailable(false)}
            />
          )}
          {(data?.reauthKinds.length ?? 0) > 0 && (
            <CalendarReauthNotice characterId={activeCharacterId} kinds={data?.reauthKinds ?? []} />
          )}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            {isNarrow ? (
              <Panel padded className="w-full">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={eyebrowClassName}>{periodLabel}</span>
                  {periodControls}
                </div>
                <CalendarDayTicker
                  days={days}
                  loads={loads}
                  nowMs={nowMs}
                  selectedDayMs={selectedDayMs}
                  onSelectDay={setSelectedDayMs}
                />
              </Panel>
            ) : (
              <div className="w-full min-w-0 space-y-3 lg:flex-1">
                <Panel padded={false} title={periodLabel} actions={periodControls}>
                  <CalendarMap
                    days={days}
                    loads={loads}
                    nowMs={nowMs}
                    weekStart={weekStart}
                    selectedDayMs={selectedDayMs}
                    onSelectDay={setSelectedDayMs}
                  />
                </Panel>
                <CalendarWeekSummary items={visible} nowMs={nowMs} />
              </div>
            )}

            <ComingUpRail
              items={railItems}
              nowMs={nowMs}
              selectedDayMs={selectedDayMs}
              onClearDay={() => setSelectedDayMs(null)}
              onSelectEvent={setSelectedEventId}
              onSelectSkyhook={setSelectedSkyhookId}
              onSelectSharedPop={setSelectedPopId}
              noKindsSelected={selected.size === 0}
            />
          </div>
        </>
      )}

      <RowDetailModal detail={skyhookDetail} onClose={() => setSelectedSkyhookId(null)} />
      <RowDetailModal detail={popDetail} onClose={() => setSelectedPopId(null)} />

      {selectedEvent && activeCharacterId !== null && (
        <EventDetailModal
          characterId={activeCharacterId}
          event={selectedEvent}
          onClose={() => setSelectedEventId(null)}
          onResponded={(eventId, response) => {
            const atMs = Date.now();
            setResponseOverrides((prev) => new Map(prev).set(eventId, { response, atMs }));
          }}
        />
      )}
    </div>
  );
}

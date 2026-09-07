import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { loadCalendarBoard } from '@/features/character/calendarBoardData';
import { EventDetailModal } from '@/features/character/EventDetailModal';
import { CalendarMap } from '@/features/character/CalendarMap';
import { CalendarDayTicker } from '@/features/character/CalendarDayTicker';
import { ComingUpRail } from '@/features/character/ComingUpRail';
import { CalendarKindFilterMenu } from '@/features/character/CalendarKindFilterMenu';
import { KIND_LABEL } from '@/features/character/calendarKindLabels';
import { useCalendarDensity } from '@/features/character/calendarViewPref';
import {
  useCalendarHiddenKinds,
  shownKinds,
  toggleHiddenKind,
} from '@/features/character/calendarKindFilter';
import { buildCharacterBoard, type CharacterBoardItemKind } from '@/engine/character/board';
import {
  countsByDay,
  countsByKind,
  filterByKinds,
  localMidnight,
} from '@/engine/character/deadlines';
import {
  addMonths,
  addWeeks,
  buildFortnightDays,
  buildMonthGrid,
  formatFortnightLabel,
  formatMonthLabel,
} from '@/lib/calendarGrid';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { downloadCsv } from '@/lib/downloadCsv';
import { calendarCsvColumns } from '@/features/character/calendarCsv';

/**
 * Calendar: the Calendar Map and the Coming Up Rail, side by side.
 *
 * Not three tab-switched views any more. `GET /characters/{id}/calendar`
 * returns up to 50 events *from now only* and the cache replaces its row
 * wholesale, so a month grid spent most of its cells on days that structurally
 * cannot hold anything — and paging backwards always said "No events this
 * month" however busy that month had really been. The grid is now a map and
 * the list is always beside it (see the scope decision).
 *
 * It also merges in every other clock the Character can read: skill-queue
 * completions, industry job deliveries, PI extractor programs, contract and
 * order expiries. Each source fails on its own, which is why this route no
 * longer renders a page-wide re-login banner — a revoked calendar scope must
 * not blank five working clocks. The filter menu names the ones that need a
 * new login instead.
 */
export function Calendar() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadCalendarBoard,
    undefined,
    { cacheKey: 'calendar' }
  );
  const isNarrow = useIsNarrow();

  const density = useCalendarDensity((state) => state.value);
  const setDensity = useCalendarDensity((state) => state.setValue);
  const hydrateDensity = useCalendarDensity((state) => state.hydrate);
  const hiddenKinds = useCalendarHiddenKinds((state) => state.value);
  const setHiddenKinds = useCalendarHiddenKinds((state) => state.setValue);
  const hydrateHiddenKinds = useCalendarHiddenKinds((state) => state.hydrate);

  useEffect(() => {
    void hydrateDensity();
    void hydrateHiddenKinds();
  }, [hydrateDensity, hydrateHiddenKinds]);

  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDayMs, setSelectedDayMs] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  /**
   * The instant the snapshot was assembled, threaded into everything below.
   *
   * Taken from the load rather than read here: every surface on this page
   * agreeing on one instant matters more than any of them being accurate to
   * the second, and the Data Age badge above already says how old the whole
   * view is.
   */
  const nowMs = data?.loadedAtMs ?? 0;

  /**
   * Everything, with no forward window.
   *
   * An earlier draft capped the board at 30 days so the rail stayed short.
   * That reproduced forwards the exact failure this page was rebuilt to fix:
   * paging the map past the cap showed empty cells that were empty because of
   * us, not because nothing was due. Every source here is naturally bounded
   * (ESI returns at most 50 calendar events and 50 queue entries; jobs,
   * contracts and orders are all small), and the rail's day grouping is what
   * makes a long list readable.
   */
  const board = useMemo(() => (data ? buildCharacterBoard({ nowMs, ...data }) : []), [data, nowMs]);

  const selected = useMemo(() => shownKinds(hiddenKinds), [hiddenKinds]);
  const visible = useMemo(() => filterByKinds(board, selected), [board, selected]);
  const loads = useMemo(() => countsByDay(visible), [visible]);
  // Counted off the unfiltered board: a kind's own count must not drop to zero
  // just because the pilot has it switched off in the menu showing that count.
  const counts = useMemo(() => countsByKind(board), [board]);

  const railItems = useMemo(
    () =>
      selectedDayMs === null
        ? visible
        : visible.filter((item) => localMidnight(item.deadlineMs) === selectedDayMs),
    [visible, selectedDayMs]
  );

  const days = useMemo(
    () => (density === 'month' ? buildMonthGrid(anchor) : buildFortnightDays(anchor)),
    [anchor, density]
  );

  const events = useMemo(() => data?.events ?? [], [data]);
  const selectedEvent = events.find((event) => event.event_id === selectedEventId) ?? null;

  function goToday() {
    setAnchor(new Date());
    setSelectedDayMs(null);
  }

  function step(delta: number) {
    setAnchor((current) =>
      density === 'month' ? addMonths(current, delta) : addWeeks(current, delta)
    );
  }

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const periodLabel = density === 'month' ? formatMonthLabel(anchor) : formatFortnightLabel(anchor);

  const periodControls = (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-xs font-semibold text-text-dim md:inline">{periodLabel}</span>
      <IconButton
        size="sm"
        icon={<Icon.Back />}
        label={density === 'month' ? t('calendar.prevMonth') : t('calendar.prevFortnight')}
        onClick={() => step(-1)}
      />
      <Button size="sm" onClick={goToday}>
        {t('calendar.map.today')}
      </Button>
      <IconButton
        size="sm"
        icon={<Icon.Descend />}
        label={density === 'month' ? t('calendar.nextMonth') : t('calendar.nextFortnight')}
        onClick={() => step(1)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Expanded />}
        label={
          density === 'month' ? t('calendar.density.toFortnight') : t('calendar.density.toMonth')
        }
        pressed={density === 'fortnight'}
        onClick={() => void setDensity(density === 'month' ? 'fortnight' : 'month')}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-3">
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
              counts={counts}
              readableKinds={data?.readableKinds ?? []}
              reauthKinds={data?.reauthKinds ?? []}
            />
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

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : (
        <>
          {data?.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          {/*
            The page no longer gates on one scope, so a refused source has to
            announce itself somewhere the pilot will actually look. Naming the
            sources in a line above the panes is that place — the filter menu
            also marks them, but nobody opens a menu they have no reason to
            open.
          */}
          {(data?.reauthKinds.length ?? 0) > 0 && (
            <p className="text-xs text-warning">
              {t('calendar.sourcesNeedLogin', {
                sources: data?.reauthKinds.map((kind) => t(KIND_LABEL[kind])).join(', '),
              })}
            </p>
          )}
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            {isNarrow ? (
              <Panel padded className="w-full">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {periodLabel}
                  </span>
                  {periodControls}
                </div>
                <CalendarDayTicker
                  days={days}
                  loads={loads}
                  nowMs={nowMs}
                  selectedDayMs={selectedDayMs}
                  onSelectDay={setSelectedDayMs}
                />
                {/* The same caption the wide grid carries — the rule it teaches is not a desktop rule. */}
                <p className="mt-2 text-xs text-text-dim">{t('calendar.map.pastHint')}</p>
              </Panel>
            ) : (
              <Panel
                padded={false}
                title={t('calendar.map.title')}
                actions={periodControls}
                className="w-full min-w-0 shrink-0 md:w-[38rem]"
              >
                <CalendarMap
                  days={days}
                  loads={loads}
                  nowMs={nowMs}
                  selectedDayMs={selectedDayMs}
                  onSelectDay={setSelectedDayMs}
                />
              </Panel>
            )}

            <ComingUpRail
              items={railItems}
              nowMs={nowMs}
              selectedDayMs={selectedDayMs}
              onClearDay={() => setSelectedDayMs(null)}
              onSelectEvent={setSelectedEventId}
              noKindsSelected={selected.size === 0}
            />
          </div>
        </>
      )}

      {selectedEvent && activeCharacterId !== null && (
        <EventDetailModal
          characterId={activeCharacterId}
          event={selectedEvent}
          onClose={() => setSelectedEventId(null)}
        />
      )}
    </div>
  );
}

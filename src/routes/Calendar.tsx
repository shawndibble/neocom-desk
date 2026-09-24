import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CalendarMap, CalendarPastHint } from '@/features/character/CalendarMap';
import { CalendarDayTicker } from '@/features/character/CalendarDayTicker';
import { ComingUpRail } from '@/features/character/ComingUpRail';
import { CalendarKindFilterMenu } from '@/features/character/CalendarKindFilterMenu';
import {
  useCalendarSkillPlans,
  withCalendarSkillPlan,
} from '@/features/character/calendarSkillPlan';
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
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useUrlParam } from '@/lib/useUrlState';
import type { UrlParamCodec } from '@/lib/urlState';
import { downloadCsv } from '@/lib/downloadCsv';
import { calendarCsvColumns } from '@/features/character/calendarCsv';
import type { CalendarRsvpResponse } from '@/esi/endpoints';

/**
 * The shown month/fortnight (ADR 0015), as a local `YYYY-MM-DD` day key —
 * `calendarGrid.ts`'s own `dayKey`, so parsing agrees with how the grid
 * builders already read a `Date`. `defaultKey` is "today" at codec-creation
 * time, not a fixed constant: it must come from a `useMemo` computed once per
 * mount (see `urlState.ts`'s codec-identity note), never recomputed inline.
 */
function anchorParam(defaultKey: string): UrlParamCodec<string> {
  return {
    // A day that does not exist (2026-02-30) is garbage, not a rollover into
    // March — round-tripped through `dayKey` the same way `isoDateParam` does.
    parse: (raw) => {
      if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return defaultKey;
      return dayKey(parseAnchorKey(raw)) === raw ? raw : defaultKey;
    },
    serialize: (value) => (value === defaultKey ? null : value),
  };
}

/** `anchorParam`'s day key back to a local `Date` — local midnight, matching `calendarGrid.ts`. */
function parseAnchorKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

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
/** How many days the phone's Day Ticker scrolls through at a time. */
const TICKER_DAYS = 14;

/** Shared shape behind both `eventsWithOverrides` and `boardSources` below — same override lookup, two different id/response fields. */
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

  const density = useCalendarDensity((state) => state.value);
  const setDensity = useCalendarDensity((state) => state.setValue);
  const hydrateDensity = useCalendarDensity((state) => state.hydrate);
  const hiddenKinds = useCalendarHiddenKinds((state) => state.value);
  const setHiddenKinds = useCalendarHiddenKinds((state) => state.setValue);
  const hydrateHiddenKinds = useCalendarHiddenKinds((state) => state.hydrate);
  const skillPlanChoices = useCalendarSkillPlans((state) => state.value);
  const setSkillPlanChoices = useCalendarSkillPlans((state) => state.setValue);
  const hydrateSkillPlanChoices = useCalendarSkillPlans((state) => state.hydrate);

  useEffect(() => {
    void hydrateDensity();
    void hydrateHiddenKinds();
    void hydrateSkillPlanChoices();
  }, [hydrateDensity, hydrateHiddenKinds, hydrateSkillPlanChoices]);

  // The loader reads the choice from Dexie itself, so the write must land
  // before the reload that reads it.
  async function chooseSkillPlan(planId: string | null) {
    if (activeCharacterId === null) return;
    await setSkillPlanChoices(withCalendarSkillPlan(skillPlanChoices, activeCharacterId, planId));
    refresh();
  }

  // "Today" at mount, stable for this visit's codec identity (see `anchorParam`).
  const [defaultAnchorKey] = useState(() => dayKey(new Date()));
  const anchorCodec = useMemo(() => anchorParam(defaultAnchorKey), [defaultAnchorKey]);
  const [anchorKey, setAnchorKey] = useUrlParam('anchor', anchorCodec);
  const anchor = useMemo(() => parseAnchorKey(anchorKey), [anchorKey]);
  // The URL write goes through a router transition that may not have landed
  // by the next click (matches Mail.tsx's `dataRef`): `step()` reads this
  // instead of the render-scope `anchor` so two clicks before that transition
  // commits still advance from each other rather than both stepping off the
  // same stale month.
  const anchorKeyRef = useRef(anchorKey);
  useEffect(() => {
    anchorKeyRef.current = anchorKey;
  }, [anchorKey]);
  function setAnchor(next: Date) {
    const key = dayKey(next);
    anchorKeyRef.current = key;
    setAnchorKey(key);
  }
  const [selectedDayMs, setSelectedDayMs] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  /**
   * RSVP responses applied locally, ahead of `data` catching up.
   *
   * `data` comes from `useRouteSnapshot`, a plain loader snapshot rather than
   * a live query — patching the Dexie cache in `respondToCalendarEvent` does
   * not by itself repaint this route. Forcing a `refresh()` instead would
   * hit ESI live and risk reapplying its own still-propagating pre-RSVP
   * response over what the pilot just clicked, so the override stands in
   * for that source.
   *
   * Scoped to the snapshot (`asOfMs`, `data.loadedAtMs`) it was set against
   * rather than kept forever: the moment a *newer* snapshot loads (manual
   * refresh, background poll, remount), that snapshot's own data is trusted
   * over a possibly-stale local guess — an override must not go on masking
   * what ESI, another device, or another session says once fresher
   * information actually arrives.
   */
  const [responseOverrides, setResponseOverrides] = useState<{
    asOfMs: number;
    values: Map<number, CalendarRsvpResponse>;
  } | null>(null);
  const activeOverrides =
    data && responseOverrides?.asOfMs === data.loadedAtMs ? responseOverrides.values : undefined;

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

  /**
   * `buildCharacterBoard` reads `calendarEvents` (each keyed by `id`, a
   * stringified event id, per `toCalendarEventSources`), a separate,
   * already-converted array from the raw `events` above — so the override
   * has to be applied here too, not just to `events`.
   */
  const boardSources = useMemo(() => {
    if (!data) return undefined;
    const calendarEvents = data.calendarEvents
      ? applyResponseOverrides(
          data.calendarEvents,
          activeOverrides,
          (source) => Number(source.id),
          (source, response) => ({ ...source, response })
        )
      : undefined;
    return { ...data, calendarEvents };
  }, [data, activeOverrides]);

  const board = useMemo(
    () => (boardSources ? buildCharacterBoard({ nowMs, ...boardSources }) : []),
    [boardSources, nowMs]
  );

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

  /**
   * The wide grid is week-aligned; the ticker is not.
   *
   * A month grid pushed into the ticker gives a phone six weeks of horizontal
   * scroll beginning before today, which is the opposite of what the page is
   * for. The ticker takes a rolling fortnight from the anchor instead, and the
   * Month/Fortnight density stays a property of the grid that has densities.
   */
  const days = useMemo(() => {
    // `nowMs`, not the builders' `new Date()` default: `isToday` and the
    // `isPast` the cells derive from `nowMs` must answer to one clock, or a
    // render straddling midnight can ring one day and hatch it at once.
    const today = new Date(nowMs);
    if (isNarrow) return buildDaysFrom(anchor, TICKER_DAYS, today);
    return density === 'month' ? buildMonthGrid(anchor, today) : buildFortnightDays(anchor, today);
  }, [anchor, density, isNarrow, nowMs]);

  const events = eventsWithOverrides ?? [];
  const selectedEvent = events.find((event) => event.event_id === selectedEventId) ?? null;

  function goToday() {
    setAnchor(new Date());
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
      {/* Density is a property of the grid; the ticker is always a rolling fortnight. */}
      {!isNarrow && (
        <IconButton
          size="sm"
          icon={<Icon.Expanded />}
          label={
            density === 'month' ? t('calendar.density.toFortnight') : t('calendar.density.toMonth')
          }
          pressed={density === 'fortnight'}
          onClick={() => void setDensity(density === 'month' ? 'fortnight' : 'month')}
        />
      )}
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
              skillPlanChoices={data?.skillPlanChoices ?? []}
              chosenSkillPlanId={data?.chosenSkillPlanId ?? null}
              skillPlanError={data?.skillPlanError ?? null}
              onChooseSkillPlan={(planId) => void chooseSkillPlan(planId)}
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
                <CalendarPastHint className="mt-2" />
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
          onResponded={(eventId, response) =>
            setResponseOverrides((prev) => {
              const asOfMs = data?.loadedAtMs ?? 0;
              const values = prev?.asOfMs === asOfMs ? new Map(prev.values) : new Map();
              values.set(eventId, response);
              return { asOfMs, values };
            })
          }
        />
      )}
    </div>
  );
}

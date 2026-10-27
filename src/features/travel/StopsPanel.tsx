/**
 * Route Safety's Stops panel (issue #2475): where the trip starts, then up to
 * `MAX_STOPS` Stops in the order typed — added, removed, and reordered by
 * dragging the grip (Space + arrow keys from the keyboard).
 *
 * Optimize stop order flies the stops in the order with the lowest total
 * route cost under the Route rules; the list here keeps the typed order, and
 * a note says when the flown order differs. Its two options only mean
 * anything while it is on, so they sit under it and are off with it.
 *
 * On a phone the panel folds to one line — "Sabusi → 4 stops" — with Edit
 * to open it. With no stops yet there is nothing worth folding, so it stays
 * open: the start picker and Add stop are how a route begins (issue #2519).
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Checkbox, CollapsiblePanel, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  gripHitAreaClassName,
  interactiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { StopRef } from '@/engine/route/stopRef';
import { MAX_STOPS, type TripOptions } from '@/engine/route/tripPlan';
import type { PickedStation } from '@/features/places/placeSearch';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { SolarSystemSearchField } from '@/features/route/SolarSystemSearchField';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { useIsPhone } from '@/lib/useIsPhone';

/** What the pilot set, kept in the link; the page decides when it applies. */
export type StopOrderSettings = Required<TripOptions>;

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[0.6875rem] font-semibold tabular-nums text-text-dim"
    >
      {children}
    </span>
  );
}

function StopRow({
  systemId,
  index,
  name,
  systemName,
  security,
  onRemove,
}: {
  systemId: number;
  index: number;
  name: string;
  /** Set for a station stop: the system it sits in, beside the station's name. */
  systemName: string | null;
  security: number | null;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: systemId,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={t('travel.stops.stopLabel', { number: index + 1, name })}
      className={`flex items-center gap-1.5 py-1 ${isDragging ? 'bg-panel-2' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('travel.stops.reorder', { name })}
        className={cx(
          'cursor-grab touch-none rounded-xs px-0.5 py-1 text-text-faint hover:text-text',
          interactiveClassName,
          focusRingClassName,
          gripHitAreaClassName
        )}
      >
        <Icon.DragHandle />
      </button>
      <Badge>{index + 1}</Badge>
      <span className="min-w-0 flex-1 truncate">
        {name}
        {systemName !== null && <span className="ml-1 text-text-dim">· {systemName}</span>}
        {security !== null && <SecurityStatus security={security} className="ml-1" />}
      </span>
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={t('travel.stops.remove', { name })}
        onClick={() => onRemove(index)}
      />
    </li>
  );
}

export function StopsPanel({
  fromId,
  fromName,
  fromTrigger,
  onFromChange,
  stops,
  onStopsChange,
  settings,
  onSettingsChange,
  optimizeBlocked,
  orderNote,
  nameOf,
  quickPicks,
}: {
  fromId: number | null;
  /** The start's name alone, for the folded phone summary. */
  fromName: string;
  /** The start's trigger text: its name, marked when it is the Current System. */
  fromTrigger: string;
  onFromChange: (systemId: number) => void;
  /** In the order typed. */
  stops: readonly StopRef[];
  /** `picked` is the station just added, so the page can name it before the link round-trips. */
  onStopsChange: (next: StopRef[], picked?: PickedStation) => void;
  settings: StopOrderSettings;
  onSettingsChange: (patch: Partial<StopOrderSettings>) => void;
  /** A stop no stargate route reaches: there is no order to optimize. */
  optimizeBlocked: boolean;
  /** Set when the flown order differs from the typed one. */
  orderNote: string | null;
  /** A stop's label: its station's name when it has one, else its system's. */
  nameOf: (systemId: number) => string;
  /** Shown under the destination field while the trip has no stops. */
  quickPicks?: ReactNode;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const systems = useSolarSystemIndex();
  const sensors = useSensors(
    // A 4px travel before a drag starts, so a tap on the grip is not a drag (as EntryList).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const stopIds = useMemo(() => stops.map((stop) => stop.systemId), [stops]);
  const position = (systemId: number | string) => stopIds.indexOf(Number(systemId)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('travel.stops.dragStart', { name: nameOf(Number(active.id)) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('travel.stops.dragOver', {
            name: nameOf(Number(active.id)),
            position: position(over.id),
            total: stops.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('travel.stops.dragEnd', {
            name: nameOf(Number(active.id)),
            position: position(over.id),
            total: stops.length,
          })
        : undefined,
    onDragCancel: ({ active }) => t('travel.stops.dragCancel', { name: nameOf(Number(active.id)) }),
  };
  const taken = useMemo(
    () => new Set(fromId === null ? stopIds : [fromId, ...stopIds]),
    [fromId, stopIds]
  );

  const move = (from: number, to: number) => onStopsChange(arrayMove([...stops], from, to));
  const remove = (index: number) => onStopsChange(stops.filter((_, at) => at !== index));
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(stopIds.indexOf(Number(active.id)), stopIds.indexOf(Number(over.id)));
  }

  const full = stops.length >= MAX_STOPS;
  const canOptimize = stops.length > 1 && !optimizeBlocked;
  const optionsOn = canOptimize && settings.optimize;

  return (
    <CollapsiblePanel
      title={t('travel.stops.title')}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      collapsible={isPhone && stops.length > 0}
      labels={{ show: t('travel.stops.edit'), hide: t('travel.stops.done') }}
      collapsedSummary={
        <p className="text-xs">
          {t('travel.stops.summary', { from: fromName, count: stops.length })}
        </p>
      }
    >
      <div className="space-y-3 text-xs md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:items-start md:gap-x-6 md:space-y-0">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="w-5 shrink-0 max-md:hidden" aria-hidden="true" />
              <Badge>{t('travel.stops.startBadge')}</Badge>
              <SolarSystemPicker
                value={fromId}
                onChange={onFromChange}
                ariaLabel={t('travel.changeFrom', { current: fromTrigger })}
                triggerLabel={fromTrigger}
              />
            </div>
            {stops.length === 0 && (
              <>
                <span aria-hidden="true" className="text-text-dim">
                  →
                </span>
                {/* No stops yet: the destination is the one thing to do, so it is a field, not a button. */}
                <SolarSystemSearchField
                  autoFocus
                  className="min-w-[12rem] flex-1 md:max-w-sm"
                  ariaLabel={t('travel.stops.destinationLabel')}
                  exclude={taken}
                  places
                  onChange={(systemId, station) => {
                    setExpanded(true);
                    onStopsChange(
                      [...stops, { systemId, stationId: station?.id ?? null }],
                      station
                    );
                  }}
                />
              </>
            )}
          </div>
          {stops.length === 0 && quickPicks}
          {stops.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              accessibility={{
                announcements,
                screenReaderInstructions: { draggable: t('travel.stops.dragInstructions') },
              }}
            >
              <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
                <ol
                  aria-label={t('travel.stops.listLabel')}
                  data-stops-list
                  className="focus:outline-none"
                >
                  {stops.map(({ systemId, stationId }, index) => (
                    <StopRow
                      key={systemId}
                      systemId={systemId}
                      index={index}
                      name={nameOf(systemId)}
                      systemName={
                        stationId === null ? null : (systems?.get(systemId)?.name ?? null)
                      }
                      security={systems?.get(systemId)?.security ?? null}
                      onRemove={remove}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
          {stops.length > 0 && (
            <div className="space-y-1">
              <SolarSystemPicker
                value={null}
                places
                onChange={(systemId, station) => {
                  onStopsChange([...stops, { systemId, stationId: station?.id ?? null }], station);
                }}
                ariaLabel={t('travel.stops.addLabel')}
                triggerLabel={t('travel.stops.add')}
                disabled={full}
                exclude={taken}
                showSecurity
              />
              {full && (
                <p className="text-text-dim">{t('travel.stops.full', { count: MAX_STOPS })}</p>
              )}
            </div>
          )}
        </div>{' '}
        {stops.length > 0 && (
          <fieldset className="space-y-1.5 border-t border-line pt-3 md:border-t-0 md:border-l md:pl-6 md:pt-0">
            <legend className="sr-only">{t('travel.stops.orderLegend')}</legend>
            <label className={`flex items-center gap-2 font-semibold ${tappableRowClassName}`}>
              <Checkbox
                role="switch"
                checked={settings.optimize}
                disabled={!canOptimize}
                onChange={(event) => onSettingsChange({ optimize: event.target.checked })}
              />
              {t('travel.stops.optimize')}
            </label>
            <div className="space-y-1.5 pl-6">
              <label className={`flex items-center gap-2 ${tappableRowClassName}`}>
                <Checkbox
                  checked={optionsOn && settings.returnToStart}
                  disabled={!optionsOn}
                  onChange={(event) => onSettingsChange({ returnToStart: event.target.checked })}
                />
                {t('travel.stops.returnToStart')}
              </label>
              <label className={`flex items-center gap-2 ${tappableRowClassName}`}>
                <Checkbox
                  checked={optionsOn && settings.keepLastStopLast}
                  disabled={!optionsOn}
                  onChange={(event) => onSettingsChange({ keepLastStopLast: event.target.checked })}
                />
                {t('travel.stops.keepLastStopLast')}
              </label>
            </div>
            {optimizeBlocked && stops.length > 1 && (
              <p className="text-text-dim">{t('travel.stops.optimizeBlocked')}</p>
            )}
            {orderNote !== null && (
              <p role="status" className="rounded-xs border border-dashed border-line px-2 py-1.5">
                {orderNote}
              </p>
            )}
          </fieldset>
        )}
      </div>
    </CollapsiblePanel>
  );
}

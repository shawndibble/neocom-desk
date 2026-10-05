/**
 * Route Safety's Stops panel (issue #2475): where the trip starts, then up to
 * `MAX_STOPS` Stops in the order typed — added, removed, and reordered by
 * dragging or with each row's move up / move down.
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
import { MAX_STOPS, type TripOptions } from '@/engine/route/tripPlan';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
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
  count,
  name,
  security,
  onMove,
  onRemove,
}: {
  systemId: number;
  index: number;
  count: number;
  name: string;
  security: number | null;
  onMove: (from: number, to: number) => void;
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
        {security !== null && <SecurityStatus security={security} className="ml-1" />}
      </span>
      <IconButton
        size="sm"
        icon={<Icon.Ascending />}
        label={t('travel.stops.moveUp', { name })}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Descending />}
        label={t('travel.stops.moveDown', { name })}
        disabled={index >= count - 1}
        onClick={() => onMove(index, index + 1)}
      />
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
}: {
  fromId: number | null;
  /** The start's name alone, for the folded phone summary. */
  fromName: string;
  /** The start's trigger text: its name, marked when it is the Current System. */
  fromTrigger: string;
  onFromChange: (systemId: number) => void;
  /** In the order typed. */
  stops: readonly number[];
  onStopsChange: (next: number[]) => void;
  settings: StopOrderSettings;
  onSettingsChange: (patch: Partial<StopOrderSettings>) => void;
  /** A stop no stargate route reaches: there is no order to optimize. */
  optimizeBlocked: boolean;
  /** Set when the flown order differs from the typed one. */
  orderNote: string | null;
  nameOf: (systemId: number) => string;
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
  const position = (systemId: number | string) => stops.indexOf(Number(systemId)) + 1;
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
    () => new Set(fromId === null ? stops : [fromId, ...stops]),
    [fromId, stops]
  );

  const move = (from: number, to: number) => onStopsChange(arrayMove([...stops], from, to));
  const remove = (index: number) => onStopsChange(stops.filter((_, at) => at !== index));
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(stops.indexOf(Number(active.id)), stops.indexOf(Number(over.id)));
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
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-5 shrink-0" aria-hidden="true" />
          <Badge>{t('travel.stops.startBadge')}</Badge>
          <SolarSystemPicker
            value={fromId}
            onChange={onFromChange}
            ariaLabel={t('travel.changeFrom', { current: fromTrigger })}
            triggerLabel={fromTrigger}
          />
        </div>
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
            <SortableContext items={[...stops]} strategy={verticalListSortingStrategy}>
              <ol aria-label={t('travel.stops.listLabel')}>
                {stops.map((systemId, index) => (
                  <StopRow
                    key={systemId}
                    systemId={systemId}
                    index={index}
                    count={stops.length}
                    name={nameOf(systemId)}
                    security={systems?.get(systemId)?.security ?? null}
                    onMove={move}
                    onRemove={remove}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        <div className="space-y-1">
          <SolarSystemPicker
            value={null}
            onChange={(systemId) => {
              // The first stop makes the panel foldable; keep it open under
              // the pilot's hand rather than folding it away mid-edit.
              if (stops.length === 0) setExpanded(true);
              onStopsChange([...stops, systemId]);
            }}
            ariaLabel={t('travel.stops.addLabel')}
            triggerLabel={t('travel.stops.add')}
            disabled={full}
            exclude={taken}
            showSecurity
          />
          {full && <p className="text-text-dim">{t('travel.stops.full', { count: MAX_STOPS })}</p>}
        </div>

        <fieldset className="space-y-1.5 border-t border-line pt-3">
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
            <p role="status" className="rounded-sm border border-dashed border-line px-2 py-1.5">
              {orderNote}
            </p>
          )}
        </fieldset>
      </div>
    </CollapsiblePanel>
  );
}

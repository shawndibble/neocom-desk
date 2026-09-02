import { Fragment, useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, IconButton, NativeSelect, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { PRIORITY_ORDER } from '@/engine/planPriority';
import type { AttributeName, PlanPriority } from '@/engine/types';
import { formatDate, formatDuration, stepTimeline } from '@/lib/duration';
import type { AttributePair } from './attributePairBands';
import type { ColumnVisibility } from './columnPreference';
import type { MergedRow } from './queueRows';

/** A band header's grouping (#115): either mode carries enough to render its label. */
export type BandInfo =
  { kind: 'priority'; priority: PlanPriority } | ({ kind: 'attributePair' } & AttributePair);

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const ICON_BUTTON = 'w-7 justify-center';
/**
 * Every training-time cell and its desktop column header, so the two cannot
 * drift apart and leave the numbers unaligned. 6rem holds the widest duration
 * formatDuration produces ("9999d 23h 59m"); the previous 4rem ran out around
 * "99d 23h 59m", so any plan longer than a few months broke its own times
 * across two lines mid-value ("123d 18h" / "58m").
 */
const TIME_CELL = 'w-24 shrink-0 whitespace-nowrap text-right';
/** Matches Layout.tsx's phone/desktop line (#114). */
const DESKTOP_QUERY = '(min-width: 48rem)';

/** i18n key for a priority's display label, e.g. 'high' -> 'plans.priorityHigh'. */
function priorityLabelKey(priority: PlanPriority): string {
  return `plans.priority${priority[0].toUpperCase()}${priority.slice(1)}`;
}

/** True at or above the `md` breakpoint, where a row fits on one line (#114). */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

/** "PER/WIL": same three-letter abbreviation PlanEditor's remapInstruction uses. */
function attributePairLabel(primary: AttributeName, secondary: AttributeName): string {
  return `${primary.slice(0, 3).toUpperCase()}/${secondary.slice(0, 3).toUpperCase()}`;
}

type AttributePairBadgeProps = AttributePair;

/** A skill's primary/secondary attribute pair, toggleable via the "Columns" control (#114). */
function AttributePairBadge({ primary, secondary }: AttributePairBadgeProps) {
  const { t } = useTranslation();
  const label = attributePairLabel(primary, secondary);
  return (
    <span
      aria-label={t('plans.attributePairLabel', { pair: label })}
      className="rounded-xs border border-line px-1 text-[0.6875rem] tracking-wide text-text-dim uppercase"
    >
      {label}
    </span>
  );
}

interface PerLevelTimeCellProps {
  seconds: number;
  cumulativeSeconds: number;
  /** Narrow layout only: cumulative time has no line of its own there, so this cell also carries it as a tooltip/long-press reveal (#114). */
  showCumulativeTooltip: boolean;
  /** PrereqRow's dimmed/italic `<li>` already colors its text; EntryRow's doesn't, so its cell dims itself. */
  dim: boolean;
}

function PerLevelTimeCell({
  seconds,
  cumulativeSeconds,
  showCumulativeTooltip,
  dim,
}: PerLevelTimeCellProps) {
  const { t } = useTranslation();
  const cell = (
    <span
      className={`${TIME_CELL} tabular-nums ${dim ? 'text-text-dim' : ''}`}
      // Tooltip.tsx requires a focusable trigger to reveal on keyboard focus,
      // not just hover/touch (docs/DESIGN.md §6) — only needed when this
      // cell actually carries the tooltip.
      tabIndex={showCumulativeTooltip ? 0 : undefined}
    >
      {formatDuration(seconds)}
    </span>
  );
  if (!showCumulativeTooltip) return cell;
  return (
    <Tooltip
      content={t('plans.cumulativeTooltip', {
        label: t('plans.columnCumulative'),
        duration: formatDuration(cumulativeSeconds),
      })}
    >
      {cell}
    </Tooltip>
  );
}

interface BandHeaderProps {
  band: BandInfo;
}

/** Divider marking where a run of same-priority (#27) or same-attribute-pair (#115) entries begins. */
function BandHeader({ band }: BandHeaderProps) {
  const { t } = useTranslation();
  const text =
    band.kind === 'priority'
      ? t('plans.priorityBand', { label: t(priorityLabelKey(band.priority)) })
      : t('plans.attributePairBand', {
          pair: attributePairLabel(band.primary, band.secondary),
        });
  return (
    <li className="border-b border-line bg-panel-2 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-dim">
      {text}
    </li>
  );
}

interface SortableRowChrome {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  handleProps: Record<string, unknown>;
  isDragging: boolean;
}

/** Shared useSortable plumbing for entry and marker rows. */
function useRowSortable(id: string): SortableRowChrome {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    handleProps: { ...attributes, ...listeners },
    isDragging,
  };
}

/** A row's booster mark: shared by entry and prereq rows. */
function BoosterMark() {
  const { t } = useTranslation();
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label={t('plans.boosterAffects')}
      role="img"
      className="ml-1 inline-block size-3 align-[-0.125em] text-accent"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
    </svg>
  );
}

function TimelineLine({ start, finish }: { start: Date; finish: Date }) {
  const { t } = useTranslation();
  return (
    <div className="mt-0.5 text-[0.625rem] tabular-nums text-text-dim">
      {t('plans.stepTimeline', { start: formatDate(start), finish: formatDate(finish) })}
    </div>
  );
}

interface EntryRowProps {
  row: Extract<MergedRow, { kind: 'entry' }>;
  name: string;
  attributes: AttributePair | undefined;
  boosted: boolean;
  timeline: { start: Date; finish: Date } | null;
  columns: ColumnVisibility;
  isDesktop: boolean;
  /** Below-desktop reorder controls (#223): dnd-kit drag stays desktop-only, so narrow screens need an Up/Down affordance instead. */
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: (skillTypeID: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

function EntryRow({
  row,
  name,
  attributes,
  boosted,
  timeline,
  columns,
  isDesktop,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onSetPriority,
}: EntryRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(row.id);
  const { entry } = row;

  const dragHandle = (
    <button
      type="button"
      {...handleProps}
      aria-label={t('plans.reorderEntry', { name })}
      className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
    >
      ⠿
    </button>
  );

  const nameSpan = (
    <span className="flex-1 truncate">
      {name} {ROMAN[entry.targetLevel - 1]}
      {boosted && <BoosterMark />}
    </span>
  );

  const attributeBadge =
    columns.attributePair && attributes ? (
      <AttributePairBadge primary={attributes.primary} secondary={attributes.secondary} />
    ) : null;

  const priorityControl = columns.priority ? (
    <NativeSelect
      size="sm"
      aria-label={t('plans.priorityLabel', { name })}
      value={entry.priority ?? 'normal'}
      onChange={(e) => onSetPriority(entry.skillTypeID, e.target.value as PlanPriority)}
    >
      {PRIORITY_ORDER.map((priority) => (
        <option key={priority} value={priority}>
          {t(priorityLabelKey(priority))}
        </option>
      ))}
    </NativeSelect>
  ) : null;

  const cumulativeTimeCell = columns.cumulativeTime ? (
    <span className={`${TIME_CELL} tabular-nums`}>{formatDuration(row.cumulativeSeconds)}</span>
  ) : null;

  const removeButton = (
    <Button
      variant="danger"
      size="sm"
      className={ICON_BUTTON}
      onClick={() => onRemove(entry.skillTypeID)}
      aria-label={t('plans.removeEntry', { name })}
    >
      <span aria-hidden="true">✕</span>
    </Button>
  );

  const hasSecondLine = Boolean(attributeBadge) || Boolean(priorityControl) || columns.perLevelTime;

  // Below the desktop breakpoint dnd-kit's pointer drag is unreliable
  // (mobile browsers don't deliver pointer-drag events consistently), so
  // narrow screens get explicit Up/Down controls alongside the drag handle
  // instead (#223). Desktop's drag-and-drop is untouched.
  const moveControls = !isDesktop && (
    <>
      <IconButton
        size="sm"
        icon={<Icon.Ascending />}
        label={t('plans.moveEntryUp', { name })}
        onClick={onMoveUp}
        disabled={isFirst}
      />
      <IconButton
        size="sm"
        icon={<Icon.Descending />}
        label={t('plans.moveEntryDown', { name })}
        onClick={onMoveDown}
        disabled={isLast}
      />
    </>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      {isDesktop ? (
        <div className="flex items-center justify-between gap-2">
          {dragHandle}
          {nameSpan}
          {attributeBadge}
          {priorityControl}
          {columns.perLevelTime && (
            <PerLevelTimeCell
              seconds={row.seconds}
              cumulativeSeconds={row.cumulativeSeconds}
              showCumulativeTooltip={false}
              dim
            />
          )}
          {cumulativeTimeCell}
          {removeButton}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            {dragHandle}
            {moveControls}
            {nameSpan}
            {cumulativeTimeCell}
            {removeButton}
          </div>
          {hasSecondLine && (
            <div className="mt-0.5 flex items-center gap-2 pl-6 text-[0.6875rem] text-text-dim">
              {attributeBadge}
              {priorityControl}
              {columns.perLevelTime && (
                <PerLevelTimeCell
                  seconds={row.seconds}
                  cumulativeSeconds={row.cumulativeSeconds}
                  showCumulativeTooltip={columns.cumulativeTime}
                  dim
                />
              )}
            </div>
          )}
        </>
      )}
      {timeline && <TimelineLine start={timeline.start} finish={timeline.finish} />}
    </li>
  );
}

interface PrereqRowProps {
  row: Extract<MergedRow, { kind: 'prereq' }>;
  name: string;
  attributes: AttributePair | undefined;
  boosted: boolean;
  timeline: { start: Date; finish: Date } | null;
  columns: ColumnVisibility;
  isDesktop: boolean;
}

/** Prereq-inserted step the user didn't add directly: dimmed, non-interactive, not draggable. */
function PrereqRow({
  row,
  name,
  attributes,
  boosted,
  timeline,
  columns,
  isDesktop,
}: PrereqRowProps) {
  const { t } = useTranslation();

  const nameSpan = (
    <span className="flex-1 truncate">
      {name} {ROMAN[row.step.level - 1]}
      <span className="ml-2 text-[0.625rem] uppercase">{t('plans.prereq')}</span>
      {boosted && <BoosterMark />}
    </span>
  );

  const attributeBadge =
    columns.attributePair && attributes ? (
      <AttributePairBadge primary={attributes.primary} secondary={attributes.secondary} />
    ) : null;

  const cumulativeTimeCell = columns.cumulativeTime ? (
    <span className={`${TIME_CELL} tabular-nums`}>
      {formatDuration(row.step.cumulativeSeconds)}
    </span>
  ) : null;

  const hasSecondLine = Boolean(attributeBadge) || columns.perLevelTime;

  return (
    <li className="border-b border-line px-2 py-1.5 text-xs text-text-faint italic last:border-b-0">
      {isDesktop ? (
        <div className="flex items-center justify-between gap-2">
          <span className="w-6" aria-hidden="true" />
          {nameSpan}
          {attributeBadge}
          {columns.perLevelTime && (
            <PerLevelTimeCell
              seconds={row.step.seconds}
              cumulativeSeconds={row.step.cumulativeSeconds}
              showCumulativeTooltip={false}
              dim={false}
            />
          )}
          {cumulativeTimeCell}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="w-6" aria-hidden="true" />
            {nameSpan}
            {cumulativeTimeCell}
          </div>
          {hasSecondLine && (
            <div className="mt-0.5 flex items-center gap-2 pl-6 text-[0.6875rem]">
              {attributeBadge}
              {columns.perLevelTime && (
                <PerLevelTimeCell
                  seconds={row.step.seconds}
                  cumulativeSeconds={row.step.cumulativeSeconds}
                  showCumulativeTooltip={columns.cumulativeTime}
                  dim={false}
                />
              )}
            </div>
          )}
        </>
      )}
      {timeline && <TimelineLine start={timeline.start} finish={timeline.finish} />}
    </li>
  );
}

interface MarkerRowProps {
  id: string;
  markerIndex: number;
  isDesktop: boolean;
  /** Below-desktop reorder controls (#223): dnd-kit drag stays desktop-only, so narrow screens need an Up/Down affordance instead. */
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: (markerIndex: number) => void;
}

/** Remap Marker (CONTEXT.md): accent divider row, draggable like an entry. */
function MarkerRow({
  id,
  markerIndex,
  isDesktop,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: MarkerRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(id);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border-b border-line px-2 py-1 text-xs text-accent last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...handleProps}
        aria-label={t('plans.reorderMarker')}
        className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⠿
      </button>
      {!isDesktop && (
        <>
          <IconButton
            size="sm"
            icon={<Icon.Ascending />}
            label={t('plans.moveMarkerUp')}
            onClick={onMoveUp}
            disabled={isFirst}
          />
          <IconButton
            size="sm"
            icon={<Icon.Descending />}
            label={t('plans.moveMarkerDown')}
            onClick={onMoveDown}
            disabled={isLast}
          />
        </>
      )}
      <span aria-hidden className="h-px flex-1 bg-accent/60" />
      <span className="font-semibold uppercase tracking-wide">{t('plans.markerRow')}</span>
      <span aria-hidden className="h-px flex-1 bg-accent/60" />
      <Button
        variant="danger"
        size="sm"
        className={ICON_BUTTON}
        aria-label={t('plans.removeMarker')}
        onClick={() => onRemove(markerIndex)}
      >
        <span aria-hidden="true">✕</span>
      </Button>
    </li>
  );
}

interface EntryListProps {
  /** Pre-merged entry + marker + prereq rows (see queueRows.ts), in schedule order. */
  rows: readonly MergedRow[];
  /** Row ids that start a new band (#27, #115), from placeBandHeaders — may key a prereq row's id when that entry has leading prereq rows. */
  bandsAt: ReadonlyMap<string, BandInfo>;
  nameFor: (skillTypeID: number) => string;
  /** A skill's primary/secondary attribute pair, when known (#114). */
  attributesFor: (skillTypeID: number) => AttributePair | undefined;
  /** Which optional row parts are enabled — the "Columns" control's device-local preference (#114). */
  columns: ColumnVisibility;
  /** Step indices (into the underlying scheduled queue) a live Booster speeds up. */
  boostedSteps?: ReadonlySet<number>;
  /** When training begins, for each row's start/finish line (#20). Omitted when there's no wall-clock basis to offer. */
  startDate?: Date;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number) => void;
  onRemoveMarker: (markerIndex: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

/**
 * Drag-and-drop (keyboard-accessible) list merging plan entries, Remap
 * Markers, and their computed queue (#112): one row per entry with its own
 * per-level/cumulative time, dimmed non-interactive rows for any
 * prereq-inserted steps positioned just ahead of it. Optional columns
 * (attribute pair, priority, per-level time, cumulative time) are
 * individually toggleable, and rows fold to two lines below the `md`
 * breakpoint (#114).
 */
export function EntryList({
  rows,
  bandsAt,
  nameFor,
  attributesFor,
  columns,
  boostedSteps,
  startDate,
  onReorder,
  onRemove,
  onRemoveMarker,
  onSetPriority,
}: EntryListProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  if (rows.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  const sortableIds = rows.filter((r) => r.kind !== 'prereq').map((r) => r.id);
  // Up/Down (#223) reorder against the row directly above/below in this same
  // order dnd-kit drags within — one lookup table shared by every row below.
  const orderIndex = new Map(sortableIds.map((id, i) => [id, i]));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="rounded-xs border border-line">
          {isDesktop && (columns.perLevelTime || columns.cumulativeTime) && (
            <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              <span className="flex-1" />
              {columns.perLevelTime && (
                <span className={TIME_CELL}>{t('plans.columnPerLevel')}</span>
              )}
              {columns.cumulativeTime && (
                <span className={TIME_CELL}>{t('plans.columnCumulative')}</span>
              )}
            </div>
          )}
          <ul>
            {rows.map((row) => {
              const band = bandsAt.get(row.id);
              const idx = orderIndex.get(row.id);
              const isFirst = idx === 0;
              const isLast = idx !== undefined && idx === sortableIds.length - 1;
              const onMoveUp = () => {
                if (idx !== undefined && idx > 0) onReorder(row.id, sortableIds[idx - 1]);
              };
              const onMoveDown = () => {
                if (idx !== undefined && idx < sortableIds.length - 1) {
                  onReorder(row.id, sortableIds[idx + 1]);
                }
              };
              return (
                <Fragment key={row.id}>
                  {band && <BandHeader band={band} />}
                  {row.kind === 'entry' && (
                    <EntryRow
                      row={row}
                      name={nameFor(row.entry.skillTypeID)}
                      attributes={attributesFor(row.entry.skillTypeID)}
                      boosted={row.stepIndices.some((i) => boostedSteps?.has(i) ?? false)}
                      timeline={
                        startDate && row.stepIndices.length > 0
                          ? stepTimeline(
                              { seconds: row.seconds, cumulativeSeconds: row.cumulativeSeconds },
                              startDate
                            )
                          : null
                      }
                      columns={columns}
                      isDesktop={isDesktop}
                      isFirst={isFirst}
                      isLast={isLast}
                      onMoveUp={onMoveUp}
                      onMoveDown={onMoveDown}
                      onRemove={onRemove}
                      onSetPriority={onSetPriority}
                    />
                  )}
                  {row.kind === 'prereq' && (
                    <PrereqRow
                      row={row}
                      name={nameFor(row.step.skillTypeID)}
                      attributes={attributesFor(row.step.skillTypeID)}
                      boosted={boostedSteps?.has(row.stepIndex) ?? false}
                      timeline={startDate ? stepTimeline(row.step, startDate) : null}
                      columns={columns}
                      isDesktop={isDesktop}
                    />
                  )}
                  {row.kind === 'marker' && (
                    <MarkerRow
                      id={row.id}
                      markerIndex={row.markerIndex}
                      isDesktop={isDesktop}
                      isFirst={isFirst}
                      isLast={isLast}
                      onMoveUp={onMoveUp}
                      onMoveDown={onMoveDown}
                      onRemove={onRemoveMarker}
                    />
                  )}
                </Fragment>
              );
            })}
          </ul>
        </div>
      </SortableContext>
    </DndContext>
  );
}

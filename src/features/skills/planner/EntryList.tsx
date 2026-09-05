import { Fragment, memo, useCallback, useEffect, useState } from 'react';
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
import {
  Button,
  Caret,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  NativeSelect,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { PRIORITY_ORDER } from '@/engine/planPriority';
import type { AttributeName, Attributes, PlanPriority, ScheduledStep } from '@/engine/types';
import { formatDuration, stepTimeline } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import type { AttributePair } from './attributePairBands';
import type { ColumnVisibility } from './columnPreference';
import { resolveMoveTarget, type MergedRow, type MoveDirection } from './queueRows';
import { remapInstruction } from './remapInstruction';

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
/**
 * The name cell, shared by every row kind so the skill names form one column.
 * `min-w-0` is what lets the inner `truncate` still work once the cell became
 * a flex container to hold the level caret.
 */
const NAME_CELL = 'flex min-w-0 flex-1 items-center gap-1.5';
/** Stands in for the level caret (`ICON_SIZE.sm`) on rows that have none, so names stay aligned. */
const CARET_SPACER = 'w-4 shrink-0';
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

interface RowActionsMenuProps {
  rowId: string;
  /** The row's own name, for the trigger's accessible name — deliberately NOT "Move up/down", so it can never collide with EntryList.test.tsx's #223 guard against always-visible Up/Down buttons. */
  name: string;
  rows: readonly MergedRow[];
  onReorder: (activeId: string, overId: string) => void;
}

/**
 * The non-drag reorder path (#408): a per-row overflow menu offering
 * move-up/move-down/move-to-top, each resolving to the sortable id a real
 * drag onto that position would produce and handed to the same `onReorder`
 * wiring — so it can never disagree with what dragging the row does. One
 * control, not #223's since-removed always-visible Up/Down pair, which cost
 * two 36px targets per row and squeezed the skill name on a phone.
 */
function RowActionsMenu({ rowId, name, rows, onReorder }: RowActionsMenuProps) {
  const { t } = useTranslation();

  function targetFor(direction: MoveDirection): string | null {
    return resolveMoveTarget(rows, rowId, direction);
  }

  function move(direction: MoveDirection) {
    const target = targetFor(direction);
    if (target) onReorder(rowId, target);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={ICON_BUTTON} aria-label={t('plans.rowActions', { name })}>
          <Icon.More size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={targetFor('up') === null} onSelect={() => move('up')}>
          {t('plans.moveUp')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={targetFor('down') === null} onSelect={() => move('down')}>
          {t('plans.moveDown')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={targetFor('top') === null} onSelect={() => move('top')}>
          {t('plans.moveToTop')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
      {t('plans.stepTimeline', { start: formatLocalDate(start), finish: formatLocalDate(finish) })}
    </div>
  );
}

interface LevelBreakdownProps {
  /** The entry's own steps, one per level the plan trains (`steps[i]` at `stepIndices[i]`). */
  steps: readonly ScheduledStep[];
  stepIndices: readonly number[];
  name: string;
  columns: ColumnVisibility;
  isDesktop: boolean;
  boostedSteps: ReadonlySet<number> | undefined;
}

/**
 * The levels behind a single entry row (#254), revealed by its caret. A "Carrier
 * V" entry queues I–V as five scheduled steps but shows one aggregated time,
 * which read as the missing levels the user reported; this is where those
 * levels and their individual times live.
 *
 * The per-level duration is always shown — it is the whole content of the
 * disclosure, and unlike the row above it, it is opened on request rather than
 * always on screen, so `columns.perLevelTime` doesn't gate it. The level's
 * running total follows the same fold as the row above (#114): its own column
 * on desktop, under a header naming it, and a tooltip on the duration below
 * `md`, where two unlabelled 6rem columns would neither fit a phone nor say
 * which number is which. `w-7` trails the line to clear the row's remove
 * button and keep the durations in their column.
 */
function LevelBreakdown({
  steps,
  stepIndices,
  name,
  columns,
  isDesktop,
  boostedSteps,
}: LevelBreakdownProps) {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={t('plans.levelBreakdown', { name })}
      className="mt-1 border-t border-line pt-1 pl-6 text-[0.6875rem] text-text-dim"
    >
      {steps.map((step, i) => (
        <li key={step.level} className="flex items-center justify-between gap-2 py-0.5">
          <span className="flex-1 truncate" aria-label={t('plans.level', { level: step.level })}>
            {ROMAN[step.level - 1]}
            {(boostedSteps?.has(stepIndices[i]) ?? false) && <BoosterMark />}
          </span>
          <PerLevelTimeCell
            seconds={step.seconds}
            cumulativeSeconds={step.cumulativeSeconds}
            showCumulativeTooltip={!isDesktop && columns.cumulativeTime}
            dim={false}
          />
          {isDesktop && columns.cumulativeTime && (
            <span className={`${TIME_CELL} tabular-nums`}>
              {formatDuration(step.cumulativeSeconds)}
            </span>
          )}
          <span aria-hidden="true" className="w-7 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

interface EntryRowProps {
  row: Extract<MergedRow, { kind: 'entry' }>;
  name: string;
  attributes: AttributePair | undefined;
  /** Step indices a live Booster speeds up — the row's own mark and its per-level marks both read this. */
  boostedSteps: ReadonlySet<number> | undefined;
  timeline: { start: Date; finish: Date } | null;
  columns: ColumnVisibility;
  isDesktop: boolean;
  /** Whether this row's level breakdown is open. Owned by EntryList so a row can be re-rendered/reordered without losing it. */
  expanded: boolean;
  /** The full row list and reorder callback, for the row-actions menu's move-up/down/top (#408) — see RowActionsMenu. */
  rows: readonly MergedRow[];
  onReorder: (activeId: string, overId: string) => void;
  onToggleLevels: (rowId: string) => void;
  onRemove: (skillTypeID: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

/**
 * Memoized (#408): PlanEditor re-renders on state that has nothing to do
 * with any given row (dropError, an unrelated marker's editor, the export
 * menu, another row's own expansion) — `React.memo` skips this row entirely
 * when none of its own props changed. Only holds if the callback props below
 * are themselves stable (`useCallback`'d at the PlanEditor/EntryList call
 * sites) — an inline arrow recreated every render would defeat this the same
 * way an unstable dependency defeats `useMemo`.
 */
const EntryRow = memo(function EntryRow({
  row,
  name,
  attributes,
  boostedSteps,
  timeline,
  columns,
  isDesktop,
  expanded,
  rows,
  onReorder,
  onToggleLevels,
  onRemove,
  onSetPriority,
}: EntryRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(row.id);
  const { entry, steps, stepIndices } = row;
  const boosted = stepIndices.some((i) => boostedSteps?.has(i) ?? false);

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

  /**
   * The levels this entry actually trains, taken from its scheduled steps
   * rather than `targetLevel` — a "Carrier V" entry on a level-III character
   * queues IV and V, and labelling it "I–V" would be a lie. Only a row with
   * more than one level has anything to disclose, so only that row gets a
   * caret; one level (or none, for an already-trained or unknown skill) reads
   * exactly as it did before.
   */
  const expandable = steps.length > 1;
  const levelLabel = expandable
    ? t('plans.levelRange', {
        from: ROMAN[steps[0].level - 1],
        to: ROMAN[steps[steps.length - 1].level - 1],
      })
    : ROMAN[entry.targetLevel - 1];

  const nameContent = (
    <>
      {expandable ? (
        <Caret expanded={expanded} />
      ) : (
        <span aria-hidden="true" className={CARET_SPACER} />
      )}
      <span className="truncate">
        {name} {levelLabel}
        {boosted && <BoosterMark />}
      </span>
    </>
  );

  // A button, not an extra icon control: the caret rides in front of the name
  // the way the Skills group headers and the Market group tree do it, so the
  // whole name is the target and the row spends no width it doesn't already
  // have. The drag handle stays the sole reorder affordance.
  const nameSpan = expandable ? (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => onToggleLevels(row.id)}
      className={`${NAME_CELL} text-left hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
    >
      {nameContent}
    </button>
  ) : (
    <span className={NAME_CELL}>{nameContent}</span>
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

  const rowActions = (
    <RowActionsMenu rowId={row.id} name={name} rows={rows} onReorder={onReorder} />
  );

  const hasSecondLine = Boolean(attributeBadge) || Boolean(priorityControl) || columns.perLevelTime;

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
          {rowActions}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            {dragHandle}
            {nameSpan}
            {cumulativeTimeCell}
            {removeButton}
            {rowActions}
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
      {expandable && expanded && (
        <LevelBreakdown
          steps={steps}
          stepIndices={stepIndices}
          name={name}
          columns={columns}
          isDesktop={isDesktop}
          boostedSteps={boostedSteps}
        />
      )}
    </li>
  );
});

interface PrereqRowProps {
  row: Extract<MergedRow, { kind: 'prereq' }>;
  name: string;
  attributes: AttributePair | undefined;
  boosted: boolean;
  timeline: { start: Date; finish: Date } | null;
  columns: ColumnVisibility;
  isDesktop: boolean;
  onPromote: (rowId: string) => void;
}

/**
 * Prereq-inserted step the user didn't add directly: dimmed, and derived
 * rather than stored — but draggable, because dragging one promotes it into a
 * real entry at that position (CONTEXT.md "Prereq Promotion"). The "+" button
 * beside it does the same promotion in place, so the affordance is reachable
 * without guessing that a dimmed row can be dragged.
 *
 * Memoized (#408) like EntryRow — holds as long as `onPromote` is stable.
 * No row-actions menu here: a prereq row isn't user-owned data to reorder in
 * place (its "+"/drag already means "promote", not "move"); moving one
 * before promoting it isn't a case #408 asked for.
 */
const PrereqRow = memo(function PrereqRow({
  row,
  name,
  attributes,
  boosted,
  timeline,
  columns,
  isDesktop,
  onPromote,
}: PrereqRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(row.id);
  const label = `${name} ${ROMAN[row.step.level - 1]}`;

  const dragHandle = (
    <button
      type="button"
      {...handleProps}
      aria-label={t('plans.dragPrereq', { name: label })}
      className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
    >
      ⠿
    </button>
  );

  // Icon-only with an aria-label, exactly like EntryRow's remove button —
  // and deliberately not wrapped in a Tooltip, which would put a Radix
  // provider on every row of a long queue to restate the label.
  const promoteButton = (
    <Button
      size="sm"
      className={ICON_BUTTON}
      onClick={() => onPromote(row.id)}
      aria-label={t('plans.promotePrereq', { name: label })}
    >
      <Icon.AddToPlan size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    </Button>
  );

  // Carries the entry row's caret spacer too, so prereq and entry names sit in
  // the same column even though a prereq row is a single level and never
  // discloses anything.
  const nameSpan = (
    <span className={NAME_CELL}>
      <span aria-hidden="true" className={CARET_SPACER} />
      <span className="truncate">
        {name} {ROMAN[row.step.level - 1]}
        <span className="ml-2 text-[0.625rem] uppercase">{t('plans.prereq')}</span>
        {boosted && <BoosterMark />}
      </span>
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
    <li
      ref={setNodeRef}
      style={style}
      className={`border-b border-line px-2 py-1.5 text-xs text-text-faint italic last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      {isDesktop ? (
        <div className="flex items-center justify-between gap-2">
          {dragHandle}
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
          {promoteButton}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            {dragHandle}
            {nameSpan}
            {cumulativeTimeCell}
            {promoteButton}
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
});

interface MarkerRowProps {
  id: string;
  markerIndex: number;
  /** This marker's target attribute spread — a manual override, or "Optimize at my markers"' result, once either is known. */
  attributes?: Attributes;
  rows: readonly MergedRow[];
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (markerIndex: number) => void;
  /** Opens the manual attribute editor (RemapMarkerModal) for this marker. */
  onEdit: (markerIndex: number) => void;
}

/**
 * Remap Marker (CONTEXT.md): accent divider row, draggable like an entry.
 * Once its target attributes are known (a manual edit, or an "Optimize at my
 * markers" run), the divider gives way to the spread itself and the "REMAP
 * MARKER" label drops out entirely — the numbers already say what this row
 * is, and repeating the label next to them read as clutter. A plain marker
 * (nothing known yet) keeps the dividers and the label, same as always.
 * Either way the label/spread is a real button, not a click handler on the
 * `<li>`, so it doesn't fight the drag handle or the remove button for the
 * row's clicks: clicking it opens the manual attribute editor.
 *
 * Memoized (#408) like EntryRow/PrereqRow.
 */
const MarkerRow = memo(function MarkerRow({
  id,
  markerIndex,
  attributes,
  rows,
  onReorder,
  onRemove,
  onEdit,
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
      {attributes ? (
        <button
          type="button"
          onClick={() => onEdit(markerIndex)}
          className="flex-1 truncate text-left tabular-nums hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {remapInstruction(attributes)}
        </button>
      ) : (
        <>
          <span aria-hidden className="h-px flex-1 bg-accent/60" />
          <button
            type="button"
            onClick={() => onEdit(markerIndex)}
            className="font-semibold tracking-wide uppercase hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {t('plans.markerRow')}
          </button>
          <span aria-hidden className="h-px flex-1 bg-accent/60" />
        </>
      )}
      <Button
        variant="danger"
        size="sm"
        className={ICON_BUTTON}
        aria-label={t('plans.removeMarker')}
        onClick={() => onRemove(markerIndex)}
      >
        <span aria-hidden="true">✕</span>
      </Button>
      <RowActionsMenu rowId={id} name={t('plans.markerRow')} rows={rows} onReorder={onReorder} />
    </li>
  );
});

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
  /** A marker's target attribute spread, once known. Undefined when no "Optimize at my markers" result covers it yet. */
  markerAttributesFor?: (markerIndex: number) => Attributes | undefined;
  /** Opens the manual attribute editor (RemapMarkerModal) for a marker. */
  onEditMarker: (markerIndex: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  /** Turn a derived prereq row into a real entry where it already sits (CONTEXT.md "Prereq Promotion"). */
  onPromotePrereq: (rowId: string) => void;
}

/**
 * Drag-and-drop (keyboard-accessible) list merging plan entries, Remap
 * Markers, and their computed queue (#112): one row per entry with its own
 * per-level/cumulative time, dimmed rows for any prereq-inserted steps
 * positioned just ahead of it. Every row is draggable — dragging a dimmed
 * prereq row promotes it into a real entry (see planDrop.ts), which is why the
 * list hands ids straight to SortableContext rather than filtering prereq rows
 * out of it. Optional columns (attribute pair, priority, per-level time,
 * cumulative time) are individually toggleable, and rows fold to two lines
 * below the `md` breakpoint (#114).
 *
 * An entry row spanning several levels labels the range it trains ("I–V") and
 * discloses the individual levels and their times behind a caret (#254) — it
 * stays one draggable row, which is the point of the merge.
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
  markerAttributesFor,
  onEditMarker,
  onSetPriority,
  onPromotePrereq,
}: EntryListProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const sensors = useSensors(
    // A bare PointerSensor starts dragging on the first pixel of pointer
    // movement, which both fires from ordinary jitter on a click (the level
    // caret and remove button sit right beside the drag handle) and fights a
    // tap-to-expand/tap-to-remove gesture on touch (#408). Requiring a small
    // travel distance first is dnd-kit's own recommended fix for exactly this.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // Which entry rows have their level breakdown open (#254). Keyed by row id,
  // which is derived from the skill, so reordering a row keeps its state.
  // Deliberately in-memory: a transient "show me the levels", not a view
  // preference like the Columns toggle.
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggleLevels = useCallback((rowId: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(rowId)) next.add(rowId);
      return next;
    });
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  if (rows.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  const sortableIds = rows.map((r) => r.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      // Wider edge threshold and stronger acceleration than dnd-kit's default
      // (#408): the entry list's own scroller is often the last few hundred
      // pixels of a long capped-height panel, and the default threshold gave
      // a dragged row too little room near the top/bottom edge to trigger
      // autoscroll before the pointer ran out of list to drag within.
      autoScroll={{ threshold: { x: 0.2, y: 0.25 }, acceleration: 20 }}
    >
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
              return (
                <Fragment key={row.id}>
                  {band && <BandHeader band={band} />}
                  {row.kind === 'entry' && (
                    <EntryRow
                      row={row}
                      name={nameFor(row.entry.skillTypeID)}
                      attributes={attributesFor(row.entry.skillTypeID)}
                      boostedSteps={boostedSteps}
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
                      expanded={expandedRowIds.has(row.id)}
                      rows={rows}
                      onReorder={onReorder}
                      onToggleLevels={toggleLevels}
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
                      onPromote={onPromotePrereq}
                    />
                  )}
                  {row.kind === 'marker' && (
                    <MarkerRow
                      id={row.id}
                      markerIndex={row.markerIndex}
                      attributes={markerAttributesFor?.(row.markerIndex)}
                      rows={rows}
                      onReorder={onReorder}
                      onRemove={onRemoveMarker}
                      onEdit={onEditMarker}
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

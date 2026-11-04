import { eyebrowClassName } from './eyebrowClassName';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { ActiveFilterRow } from './ActiveFilterRow';
import { clearFilters, type ActiveFilter } from './activeFilters';
import { Button } from './Button';
import { Collapse } from './Collapse';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { FilterSurfaceContext, useFilterSurface } from './filterSurface';
import { Modal } from './Modal';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { PrimarySearchContext } from './primarySearch';

export type { ActiveFilter } from './activeFilters';

interface FilterFieldProps {
  /**
   * Already-translated. Rendered in the sheet only; inline the control's own
   * `aria-label` carries it. Also the key an `ActiveFilter` with the same
   * `label` uses to focus this control when its pill is clicked.
   */
  label: string;
  children: ReactNode;
  /**
   * Whether the control fills the sheet's width. True for anything that reads
   * as a field; false for a control whose size *is* its shape, such as an
   * `IconButton`, which a full-width stretch would leave as a wide short box.
   */
  stretch?: boolean;
  /**
   * Draw the caption above the control inline as well, for a row of several
   * fields that read as a form (Build Plans' filters) rather than a few
   * self-describing selects. Give every control in that row a caption, or the
   * uncaptioned ones sit a caption's height out of line with the rest.
   */
  captionInline?: boolean;
  /**
   * No caption in the sheet either, for a control that already says it — a
   * lone chip whose label is the caption ("Starred only" above a STARRED ONLY
   * chip says it twice). The label still keys the field for its pill.
   */
  hideCaption?: boolean;
  className?: string;
}

/**
 * One labelled control inside a `FilterBar`.
 *
 * Inline it is a pass-through — a filter row is read left to right and a
 * caption above every select would double its height for nothing. In the sheet
 * the controls are stacked full-width with no neighbours to give them context,
 * so each gets its caption there.
 *
 * @summary One labelled control inside a `FilterBar`; the caption shows in the phone sheet only.
 */
export function FilterField({
  label,
  children,
  stretch = true,
  captionInline = false,
  hideCaption = false,
  className = '',
}: FilterFieldProps) {
  const surface = useFilterSurface();
  // `data-filter-field` on every surface: it is how a click on an active
  // filter's pill finds this control to focus (`ActiveFilter.label`).
  if (surface === 'inline' && captionInline)
    return (
      <div data-filter-field={label} className={cx('flex flex-col items-start gap-1', className)}>
        <span className={eyebrowClassName}>{label}</span>
        {children}
      </div>
    );
  // Inline there is no caption box, but the field still needs an element to
  // carry its marker and a caller's class (a responsive `sm:hidden`, say):
  // `contents` keeps the children in the row's own flex flow.
  if (surface === 'inline' || hideCaption)
    return (
      <div data-filter-field={label} className={cx('contents', className)}>
        {children}
      </div>
    );
  // A `<div>`, not a `<label>`: most of what goes in here is a button — a
  // Radix `SelectTrigger`, a chip, an `IconButton` — and a button is not a
  // labelable element, so the caption would name nothing. The control's own
  // `aria-label` is what a screen reader gets; this caption is for the eye.
  // `[&>*]:w-full` because the control carries the width it needs *in the row*
  // — `w-44` on Wallet's ref-type trigger, `w-36` on its date fields. Stacked
  // in the sheet those read as half-empty fields in a column. The child
  // selector outspecifies the utility on the control itself, so no call site
  // has to hold two widths.
  return (
    <div
      data-filter-field={label}
      className={cx('flex flex-col items-start gap-1', stretch && 'w-full [&>*]:w-full', className)}
    >
      <span className={eyebrowClassName}>{label}</span>
      {children}
    </div>
  );
}

type RowAlign = 'center' | 'end' | 'start';
const ROW_ALIGN_CLASS: Record<RowAlign, string> = {
  center: 'items-center',
  end: 'items-end',
  start: 'items-start',
};

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus the control a pill names inside `container`: in the `FilterField`
 * captioned `label`, the option that is on (a pressed chip, a checked box) —
 * the one the pill is about — else its first control; with no such field,
 * the first control in the box.
 */
function focusField(container: HTMLElement | null, label: string | null): void {
  if (!container) return;
  const field =
    label === null
      ? null
      : Array.from(container.querySelectorAll<HTMLElement>('[data-filter-field]')).find(
          (element) => element.dataset.filterField === label
        );
  const target =
    field?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]') ??
    field?.querySelector<HTMLElement>(FOCUSABLE) ??
    container.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
}

interface FilterBarProps<T> {
  /** @summary The committed filter state. On desktop edits land here at once. */
  value: T;
  /** @summary Commit: called on every edit, on every surface. */
  onChange: (next: T) => void;
  /**
   * The search box. Stays in the row at every width — it is the page's primary
   * affordance, and burying it behind a trigger would cost more than it saves.
   * Never an `active` entry: the box already shows what it holds.
   */
  search?: ReactNode;
  /**
   * @summary The filters set away from their default, in priority order.
   *
   * Badges the trigger with their count (in its accessible name too, so "this
   * list is filtered" is not an accent colour alone, DESIGN.md §7). While the
   * controls are closed they show as a line of pills — "label: value" with a
   * remove each, then "Clear all" — in the slot the controls open into, so a
   * setting is never shown twice. A pill that does not fit folds into "+N"
   * from the end, so put the filters a reader most needs to see first.
   *
   * Supplied by the route rather than derived: which values count as
   * "default", and how to say one in a few words, are the route's to know.
   */
  active?: readonly ActiveFilter<T>[];
  /**
   * How many rows the filters leave. Shown in the phone sheet's done button
   * ("Show 312 results") so the effect of a pick is visible with the list
   * behind the sheet; without it the button reads "Done".
   */
  resultCount?: number;
  /** Heading for the sheet. Defaults to "Filters". */
  title?: string;
  /**
   * The controls, written once. Called with `value` and `onChange` straight
   * through — every surface commits each edit as it is made.
   */
  children: (value: T, onChange: (next: T) => void) => ReactNode;
  /**
   * View controls — a table's column picker, say — that sit between the search
   * box and the filter trigger, on the same line at every width. Not part of
   * the filter value: they act immediately and never move into the sheet.
   */
  actions?: ReactNode;
  /**
   * View controls after the funnel, so the funnel sits right beside the search
   * box — for a row whose filters narrow the list and whose view controls
   * only arrange it (the Ship Tree ladder's Expand all / Collapse all and
   * Legend). Like `actions`, never part of the filter value and never in the sheet.
   */
  trailing?: ReactNode;
  /** Wrapper class for the row. */
  className?: string;
  /**
   * Cross-axis alignment of the row's own items (search, `actions`, the
   * funnel trigger). `center` (default) is right for a plain `SearchInput`,
   * which is the same height as the icon buttons beside it. A `search` built
   * from labelled fields (a caption above each control, Hauling's From/To/
   * Category) is taller than those buttons, so `end` lines every control's
   * own bottom edge up instead of centering the icons against the taller
   * block's full height. `start` pins the controls to the top for a `search`
   * that grows downward (a picker listing results under its input), so the
   * funnel stays beside the input instead of drifting to the middle.
   */
  rowAlign?: RowAlign;
  /**
   * Size of the funnel trigger's `IconButton`. Defaults to `IconButton`'s
   * own default (`md`) so existing callers are unchanged; pass `sm` to match
   * a `size="sm"` `actions` control (Hauling's `ColumnPickerMenu`) so the two
   * read as one pair rather than two different-sized buttons.
   */
  triggerSize?: ComponentProps<typeof IconButton>['size'];
  /**
   * Where the controls open on a pointer-width screen. `row` (default) is the
   * box under the row. `popover` anchors them to the funnel instead, for a
   * funnel that sits where no box can open beneath it — a panel's title bar,
   * beside its primary action. Below `md` it is the sheet either way.
   *
   * A `popover` bar shows no pill line on any width: it sits in a bar that
   * already says what it is set to (the order book's scope line), and a line
   * of pills under a title bar would be a second one.
   */
  pointerSurface?: 'row' | 'popover';
}

/**
 * A page's filter controls: one row of search box, view `actions` (a column
 * picker) and a funnel trigger, at every width. The funnel reveals the
 * controls — in a box under the row on a pointer-width screen, in a bottom
 * sheet below `md`.
 *
 * Always behind the funnel, never laid out inline, so every searchable table
 * reads the same: search, columns, filters, one line. Inline filters wrapped
 * to a second row on most routes and pushed the picker away from the search.
 *
 * While the controls are closed, the filters that are on show as a single
 * line of pills under the row (`active`). Opening the funnel slides the box
 * into that same slot, so a setting is shown as a pill or as its control,
 * never both.
 *
 * A row of selects, date fields and chips is fine at 1280px and is most of the
 * screen at 390px — Wallet's journal filters alone stack to four rows on a
 * phone, above the table they exist to narrow. So on a narrow viewport the
 * controls move into a bottom sheet that the funnel opens. Edits there land
 * at once, as in the box; the sheet's footer says how many rows they leave.
 *
 * The two surfaces are a conditional render, not a CSS collapse — deliberately
 * unlike `DataTable`'s "one DOM at every width" (DESIGN.md §4a): the sheet is
 * a modal, which no CSS breakpoint can turn into a box in the page flow.
 * `children` is written once, as a function of the value, so neither surface
 * can drift from the other and no control is ever mounted twice.
 *
 * @summary A page's one filter row: search, view actions and a funnel that opens the filters (a box on desktop, a bottom sheet on a phone); active filters show as pills while it is closed.
 */
export function FilterBar<T>(props: FilterBarProps<T>) {
  const isNarrow = useIsNarrow();
  if (!isNarrow && props.pointerSurface === 'popover') return <FilterPopover {...props} />;
  if (!isNarrow) return <CollapsibleFilterRow {...props} />;
  return <FilterSheet {...props} />;
}

/**
 * The funnel button, shared by every surface that hides controls behind one.
 *
 * The count rides on it as a number, not as an accent tint: "some filter is
 * on" has to survive a viewer who can't tell the two border colours apart
 * (DESIGN.md §7). It repeats inside the accessible name, so it is announced
 * rather than only drawn.
 */
function FilterTrigger({
  activeCount,
  expanded,
  haspopup,
  controls,
  onClick,
  size,
  buttonRef,
}: {
  activeCount: number;
  /** All of these omitted for a `PopoverTrigger` child, which Radix wires itself. */
  expanded?: boolean;
  /** Omitted for an inline toggle: it reveals a group, not a menu or dialog. */
  haspopup?: 'dialog' | 'true';
  /** Id of the inline panel this button reveals. */
  controls?: string;
  onClick?: () => void;
  size?: ComponentProps<typeof IconButton>['size'];
  /** Where focus goes once a pill it was on is removed. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const button = (
    <IconButton
      ref={buttonRef}
      icon={<Icon.Filter />}
      label={
        activeCount > 0 ? t('filters.openWithCount', { count: activeCount }) : t('filters.open')
      }
      size={size}
      // Spread, not passed as `undefined`: `asChild` merges the trigger's own
      // aria-expanded/onClick under the child's, so an explicit undefined
      // would erase them.
      {...(onClick && {
        ...(haspopup && { 'aria-haspopup': haspopup }),
        'aria-expanded': expanded,
        'aria-controls': controls,
        onClick,
      })}
    />
  );
  return (
    <span className="relative inline-flex shrink-0">
      {onClick ? button : <PopoverTrigger asChild>{button}</PopoverTrigger>}
      {activeCount > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full border border-accent-dim bg-accent px-1 text-center text-[0.625rem] leading-4 font-semibold text-accent-contrast tabular-nums"
        >
          {activeCount}
        </span>
      )}
    </span>
  );
}

/** "Clear all" at the end of an open filter box or popover, while anything is on. */
function ClearAllButton<T>({
  value,
  onChange,
  active,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  active: readonly ActiveFilter<T>[];
  className?: string;
}) {
  const { t } = useTranslation();
  if (active.length === 0) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cx('shrink-0', className)}
      onClick={() => onChange(clearFilters(value, active))}
    >
      {t('filters.clearAll')}
    </Button>
  );
}

/**
 * The pointer-width half of `FilterBar`: search box and funnel button on one
 * line, and under it one slot that holds either the active filters' pills
 * (closed) or the controls themselves (open). Opening slides the box down
 * over where the pills were, rather than above or below them, so nothing is
 * shown twice; the results below move with it rather than being covered.
 *
 * The controls unmount once the box has slid shut rather than hiding with a
 * class — a `SelectTrigger` inside a `display:none` subtree is still in the
 * tab order in some browsers, and a closed filter box the keyboard can walk
 * into is worse than no collapse at all.
 */
function CollapsibleFilterRow<T>({
  value,
  onChange,
  search,
  active = [],
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The pill a click opened the box from, whose control takes focus once it mounts.
  const focusTarget = useRef<string | null>(null);
  const groupId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || focusTarget.current === null) return;
    focusField(boxRef.current, focusTarget.current);
    focusTarget.current = null;
  }, [open]);

  return (
    <div className={cx('flex flex-col', className)}>
      <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign])}>
        <PrimarySearchContext.Provider value>{search}</PrimarySearchContext.Provider>
        {/* Before the trigger, so Tab runs straight from the funnel into the
            group it just revealed. */}
        {actions}
        <FilterTrigger
          activeCount={active.length}
          expanded={open}
          controls={groupId}
          size={triggerSize}
          buttonRef={triggerRef}
          onClick={() => setOpen((was) => !was)}
        />
        {trailing}
      </div>
      <Collapse open={!open && active.length > 0} className="pt-2">
        <ActiveFilterRow
          active={active}
          value={value}
          onChange={onChange}
          onOpen={(label) => {
            focusTarget.current = label;
            setOpen(true);
          }}
          onCleared={() => triggerRef.current?.focus()}
        />
      </Collapse>
      <Collapse open={open} id={groupId} className="pt-2">
        <div
          ref={boxRef}
          className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 p-2"
          aria-label={title ?? t('filters.title')}
          role="group"
        >
          {children(value, onChange)}
          <ClearAllButton value={value} onChange={onChange} active={active} className="ml-auto" />
        </div>
      </Collapse>
    </div>
  );
}

/**
 * The pointer-width surface for a funnel in a title bar: the same live
 * controls as `CollapsibleFilterRow`, anchored to the funnel rather
 * than unfolding beneath it — beneath it is the inside of the bar.
 */
function FilterPopover<T>({
  value,
  onChange,
  search,
  active = [],
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  return (
    <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign], className)}>
      <PrimarySearchContext.Provider value>{search}</PrimarySearchContext.Provider>
      {actions}
      <Popover>
        <FilterTrigger activeCount={active.length} size={triggerSize} />
        <PopoverContent
          align="end"
          aria-label={title ?? t('filters.title')}
          className="flex w-max max-w-[min(44rem,calc(100vw-2rem))] flex-wrap items-center gap-2 p-2"
        >
          {children(value, onChange)}
          <ClearAllButton value={value} onChange={onChange} active={active} className="ml-auto" />
        </PopoverContent>
      </Popover>
      {trailing}
    </div>
  );
}

/**
 * The narrow half of `FilterBar`, as its own component so that widening the
 * window unmounts it and takes the open sheet with it. The alternative — an
 * effect closing the sheet when the viewport grows — would leave a modal
 * sitting over controls that are now in the row behind it, and would cascade
 * a render to do it.
 *
 * Edits commit as they are made, like the pointer-width box. The sheet covers
 * most of the list, so its footer carries the count the picks leave ("Show
 * 312 results") as the button that closes it, beside Clear all. Scrim,
 * Escape, the close button, Back and a swipe down all close it too and keep
 * what was picked — there is no draft to apply or discard.
 *
 * The pills stay on the page under the row (a `row` bar only): the sheet is a
 * modal over them, not a second copy beside them.
 */
function FilterSheet<T>({
  value,
  onChange,
  search,
  active = [],
  resultCount,
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
  pointerSurface = 'row',
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const focusTarget = useRef<string | null>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The last value this sheet committed. A route whose filters live in the
  // URL writes them with a replace — onto the sheet's own history entry while
  // it is open — so Back, which pops that entry, would also undo every pick.
  // Committing the last value again once the close has landed keeps Back the
  // same as the close button: the sheet goes, the filters stay.
  const [lastCommit, setLastCommit] = useState<{ value: T } | null>(null);
  const commit = (next: T) => {
    setLastCommit({ value: next });
    onChange(next);
  };
  const close = () => {
    setOpen(false);
    setLastCommit(null);
    if (lastCommit) setTimeout(() => onChange(lastCommit.value), 0);
  };

  useEffect(() => {
    const label = focusTarget.current;
    if (!open || label === null) return;
    focusTarget.current = null;
    // After the modal's own move of focus into the dialog, which this
    // replaces with the control the pill named.
    const frame = requestAnimationFrame(() => focusField(sheetBodyRef.current, label));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const showPills = pointerSurface === 'row' && active.length > 0;

  return (
    <>
      <div className={cx('flex flex-col gap-2', className)}>
        <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign])}>
          <PrimarySearchContext.Provider value>{search}</PrimarySearchContext.Provider>
          {actions}
          <FilterTrigger
            activeCount={active.length}
            expanded={open}
            haspopup="dialog"
            size={triggerSize}
            buttonRef={triggerRef}
            onClick={() => setOpen(true)}
          />
          {trailing}
        </div>
        {showPills && (
          <ActiveFilterRow
            active={active}
            value={value}
            onChange={onChange}
            onOpen={(label) => {
              focusTarget.current = label;
              setOpen(true);
            }}
            onCleared={() => triggerRef.current?.focus()}
          />
        )}
      </div>
      <Modal
        open={open}
        onClose={close}
        title={title ?? t('filters.title')}
        placement="sheet"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              disabled={active.length === 0}
              onClick={() => commit(clearFilters(value, active))}
            >
              {t('filters.clearAll')}
            </Button>
            <Button variant="primary" onClick={close}>
              {resultCount === undefined
                ? t('filters.done')
                : t('filters.showResults', { count: resultCount })}
            </Button>
          </div>
        }
      >
        <FilterSurfaceContext.Provider value="sheet">
          {/*
            `items-start` so a chip keeps its own width in the column — only a
            `FilterField` marked `stretch` fills the sheet, and a full-width
            uppercase pill reads as a field it is not.
          */}
          <div ref={sheetBodyRef} className="flex flex-col items-start gap-3">
            {children(value, commit)}
          </div>
        </FilterSurfaceContext.Provider>
      </Modal>
    </>
  );
}

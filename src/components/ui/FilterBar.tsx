import { eyebrowClassName } from './eyebrowClassName';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { FilterSurfaceContext, useFilterSurface } from './filterSurface';
import { Modal } from './Modal';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

interface FilterFieldProps {
  /** Already-translated. Rendered in the sheet only; inline the control's own `aria-label` carries it. */
  label: string;
  children: ReactNode;
  /**
   * Whether the control fills the sheet's width. True for anything that reads
   * as a field; false for a control whose size *is* its shape, such as an
   * `IconButton`, which a full-width stretch would leave as a wide short box.
   */
  stretch?: boolean;
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
export function FilterField({ label, children, stretch = true, className = '' }: FilterFieldProps) {
  const surface = useFilterSurface();
  // Inline there is no caption box, but a caller's class (a responsive
  // `sm:hidden`, say) still has to land: `contents` keeps the children in
  // the row's own flex flow while giving the class an element to sit on.
  if (surface === 'inline')
    return className ? (
      <div className={cx('contents', className)}>{children}</div>
    ) : (
      <>{children}</>
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

interface FilterBarProps<T> {
  /** @summary The committed filter state. On desktop edits land here at once. */
  value: T;
  /** @summary Commit: called on every edit, on every surface. */
  onChange: (next: T) => void;
  /**
   * The search box. Stays in the row at every width — it is the page's primary
   * affordance, and burying it behind a trigger would cost more than it saves.
   */
  search?: ReactNode;
  /**
   * How many filters are set away from their default. Badges the trigger and
   * goes into its accessible name, so "this list is filtered" is not conveyed
   * by an accent colour alone (DESIGN.md §7).
   *
   * Supplied by the route rather than derived: knowing which values count as
   * "default" needs the route's own defaults object, and no generic
   * deep-compare is worth writing for that.
   */
  activeCount?: number;
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
 * A row of selects, date fields and chips is fine at 1280px and is most of the
 * screen at 390px — Wallet's journal filters alone stack to four rows on a
 * phone, above the table they exist to narrow. So on a narrow viewport the
 * controls move into a bottom sheet that the funnel opens. Edits there land
 * at once, as in the box — the sheet stops short of the top, so the list
 * re-filters above it as each control is picked.
 *
 * The two surfaces are a conditional render, not a CSS collapse — deliberately
 * unlike `DataTable`'s "one DOM at every width" (DESIGN.md §4a): the sheet is
 * a modal, which no CSS breakpoint can turn into a box in the page flow.
 * `children` is written once, as a function of the value, so neither surface
 * can drift from the other and no control is ever mounted twice.
 *
 * @summary A page's one filter row: search, view actions and a funnel that opens the filters (a box on desktop, a bottom sheet on a phone).
 */
export function FilterBar<T>({
  value,
  onChange,
  search,
  activeCount = 0,
  title,
  children,
  actions,
  trailing,
  className = '',
  rowAlign = 'center',
  triggerSize,
  pointerSurface = 'row',
}: FilterBarProps<T>) {
  const isNarrow = useIsNarrow();

  if (!isNarrow && pointerSurface === 'popover') {
    return (
      <FilterPopover
        search={search}
        activeCount={activeCount}
        title={title}
        actions={actions}
        trailing={trailing}
        className={className}
        rowAlign={rowAlign}
        triggerSize={triggerSize}
      >
        {children(value, onChange)}
      </FilterPopover>
    );
  }

  if (!isNarrow) {
    return (
      <CollapsibleFilterRow
        search={search}
        activeCount={activeCount}
        title={title}
        actions={actions}
        trailing={trailing}
        className={className}
        rowAlign={rowAlign}
        triggerSize={triggerSize}
      >
        {children(value, onChange)}
      </CollapsibleFilterRow>
    );
  }

  return (
    <FilterSheet
      value={value}
      onChange={onChange}
      search={search}
      activeCount={activeCount}
      title={title}
      actions={actions}
      trailing={trailing}
      className={className}
      rowAlign={rowAlign}
      triggerSize={triggerSize}
    >
      {children}
    </FilterSheet>
  );
}

/**
 * The funnel button, shared by both surfaces that hide controls behind one.
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
}) {
  const { t } = useTranslation();
  const button = (
    <IconButton
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

/**
 * The pointer-width half of `FilterBar`: search box and funnel
 * button on one line, the controls themselves on a line below that the
 * funnel shows and hides.
 *
 * Unmounting the controls rather than hiding them with a class is deliberate
 * — a `SelectTrigger` inside a `display:none` subtree is still in the tab
 * order in some browsers, and a closed filter box the keyboard can walk into
 * is worse than no collapse at all.
 */
function CollapsibleFilterRow({
  search,
  activeCount,
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
}: {
  search?: ReactNode;
  activeCount: number;
  title?: string;
  actions?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  rowAlign?: RowAlign;
  triggerSize?: ComponentProps<typeof IconButton>['size'];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const groupId = useId();
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign])}>
        {search}
        {/* Before the trigger, so Tab runs straight from the funnel into the
            group it just revealed. */}
        {actions}
        <FilterTrigger
          activeCount={activeCount}
          expanded={open}
          controls={open ? groupId : undefined}
          size={triggerSize}
          onClick={() => setOpen((was) => !was)}
        />
        {trailing}
      </div>
      {open && (
        <div
          id={groupId}
          className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 p-2"
          aria-label={title ?? t('filters.title')}
          role="group"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The pointer-width surface for a funnel in a title bar: the same live
 * controls as `CollapsibleFilterRow`, anchored to the funnel rather
 * than unfolding beneath it — beneath it is the inside of the bar.
 */
function FilterPopover({
  search,
  activeCount,
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
}: {
  search?: ReactNode;
  activeCount: number;
  title?: string;
  actions?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  rowAlign?: RowAlign;
  triggerSize?: ComponentProps<typeof IconButton>['size'];
}) {
  const { t } = useTranslation();
  return (
    <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign], className)}>
      {search}
      {actions}
      <Popover>
        <FilterTrigger activeCount={activeCount} size={triggerSize} />
        <PopoverContent
          align="end"
          aria-label={title ?? t('filters.title')}
          className="flex w-max max-w-[min(44rem,calc(100vw-2rem))] flex-wrap items-center gap-2 p-2"
        >
          {children}
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
 * Edits commit as they are made, like the pointer-width box: the sheet stops
 * short of the screen top, so the list above it re-filters as each chip is
 * picked. Scrim, Escape, the close button, Back and a swipe down all close
 * it and keep what was picked — there is no draft to apply or discard.
 */
function FilterSheet<T>({
  value,
  onChange,
  search,
  activeCount = 0,
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

  return (
    <>
      <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign], className)}>
        {search}
        {actions}
        <FilterTrigger
          activeCount={activeCount}
          expanded={open}
          haspopup="dialog"
          size={triggerSize}
          onClick={() => setOpen(true)}
        />
        {trailing}
      </div>
      <Modal open={open} onClose={close} title={title ?? t('filters.title')} placement="sheet">
        <FilterSurfaceContext.Provider value="sheet">
          {/*
            `items-start` so a chip keeps its own width in the column — only a
            `FilterField` marked `stretch` fills the sheet, and a full-width
            uppercase pill reads as a field it is not.
          */}
          <div className="flex flex-col items-start gap-3">{children(value, commit)}</div>
        </FilterSurfaceContext.Provider>
      </Modal>
    </>
  );
}

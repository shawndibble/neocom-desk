import { measureElement, useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { useIsPhone } from '@/lib/useIsPhone';
import { fieldBaseClassName } from './controlStyles';
import { groupSortedRows } from './dataTableGroup';
import * as Icon from './icons';
import { InfoTooltip } from './Tooltip';
import { RowMoreActions } from './RowActions';
import { nextDataTableSort, sortRows } from './dataTableSort';

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

const STICKY_START = 'sticky left-0 z-10 bg-panel max-md:border-r max-md:border-line';
// `hover:bg-panel-2` lives on the `<tr>`, whose own background a sticky
// cell's opaque one would otherwise cover.
const STICKY_START_CELL = 'max-sm:max-w-30 [tr:hover>&]:bg-panel-2';

export interface DataTableColumn<T> {
  id: string;
  /** Already-translated header text. */
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Static cell classes — `whitespace-nowrap`, `tabular-nums`, `text-text-dim`. */
  className?: string;
  /** Row-dependent cell classes, for per-value tones (`iskToneClass`, status tones). */
  cellClassName?: (row: T) => string | undefined;
  /**
   * Static header classes — for a short multi-word header (e.g. "ISK / LP")
   * that should stay on one line rather than wrap when its column is
   * squeezed. Separate from `className` (cell-only) since a cell tone like
   * `text-text-dim` has no business on the header.
   */
  headerClassName?: string;
  /**
   * Pins the column at the left edge while the rest scroll sideways under it
   * (a table that overflows its wrapper, e.g. `responsive="table"` on a
   * phone), so row labels stay on screen. Below `md` it also gets a right
   * border marking the scroll edge and shrinks to ~120px; where the table
   * fits, it's a visual no-op. Only for the first column.
   */
  stickyStart?: boolean;
  /**
   * One-line plain-language note on what the column's values *are*, shown as
   * a small info control beside the header text — e.g. that a ledger date is
   * an EVE/UTC calendar day, not a local one. Only for a genuine ambiguity a
   * reader could get wrong; most columns explain themselves.
   */
  headerTooltip?: string;
  render: (row: T) => ReactNode;
  /**
   * Declares the column sortable and extracts its comparable value.
   * `undefined` sinks the row to the end, in either direction, rather than
   * being treated as zero.
   */
  sortValue?: (row: T) => string | number | undefined;
  /**
   * Names the row in the stacked (below-`sm`) layout: this cell becomes the
   * card's title — hoisted to the top, unlabelled, semibold — while the rest
   * stay label/value pairs. Defaults to the first column, which is usually
   * right. Set it where reading order and identity disagree: a wallet journal
   * leads with the date because a ledger should, but a card titled
   * "9/1/2026, 9:34:21 PM" says nothing, so its `refType` claims this instead.
   * At most one column per table; later ones are ignored.
   */
  primary?: boolean;
  /**
   * Pins this cell to the stacked card's top-right corner instead of its own
   * labelled row — for a purely decorative, non-tabular cell (an affordance
   * icon) that reads as a stray unlabelled line when stacked normally. At
   * most one column per table; later ones are ignored.
   *
   * In the dense stack (`stackLayout="dense"`) the corner is not decorative
   * but the card's headline figure: it sits *in flow* on the title line,
   * right of the primary cell, bold and unwrapped — a courier offer's
   * ISK/jump, the number a reader scans the list by.
   */
  cardCorner?: boolean;
  /**
   * Dense stack only: text printed around this cell's value on the card's
   * meta line, e.g. `{ before: 'Qty ' }` or `{ after: ' reward' }`. The dense
   * card drops column headers, so a bare "12" or "4.2M" needs a word to say
   * what it is. Already translated, like `header`. Emitted as
   * `data-stack-before`/`data-stack-after` and printed by CSS, so the cell's
   * own content — and the table at `sm` and up — is untouched.
   */
  stackAffix?: { before?: string; after?: string };
}

/**
 * What counts as a control of its own inside a clickable row: anything the
 * user can click to do something other than open the row. A bare
 * `tabIndex={0}` isn't enough — an ISK figure is focusable only so the
 * keyboard can reach its hover tooltip, and a click on it still opens the
 * row. A tap-to-open tooltip trigger marks itself with `data-row-control`.
 */
const ROW_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[data-row-control]',
].join(',');

/**
 * Whether a click on a clickable row is the row's own — not one that landed on
 * a control inside it (a star button, a bulk-select checkbox, a tooltip
 * trigger), and not one bubbled up through React from something portaled out
 * of it (a menu or modal opened from the row). Keyboard activation of such a
 * control fires a click too, so this is also what keeps Enter/Space on it
 * from opening the row. Pages need no `stopPropagation` workaround of their
 * own.
 */
function isRowOwnEvent(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const control = target.closest(ROW_CONTROL_SELECTOR);
  return control === null || control === row || !row.contains(control);
}

/**
 * Wraps a dense-stack (`stackLayout="dense"`) column's `render` output when
 * it's more than one inline piece (a value plus a badge, a name plus a
 * security-status suffix). The dense meta line puts a `·` separator right
 * before this cell's content via CSS `::before` — a plain `flex` span
 * blockifies and breaks onto its own line whenever a separator precedes it;
 * `inline-flex` doesn't. Column authors reach for this instead of writing
 * the className themselves, so the constraint has one place to hold and fix.
 */
export function DataTableDenseCell({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}

/**
 * Per-row disclosure (Market's order-book row expand): clicking a row opens
 * one full-width detail row beneath it, rendered by the caller. At most one
 * row open at a time — a second click opens the next row and closes the
 * first, an accordion rather than independent toggles, so a long book never
 * grows several detail blocks at once. State lives here, not with the
 * caller: `renderDetail` only ever needs the row it was given.
 */
export interface DataTableExpandableRow<T> {
  /** Content of the full-width row shown beneath an expanded row. */
  renderDetail: (row: T) => ReactNode;
}

/**
 * Phone-only row grouping (`DataTable`'s `groupBy`): rows sharing a key fold
 * behind one toggle row, so a list with many near-duplicates (ten courier
 * offers on one route) reads as one line per distinct thing.
 */
export interface DataTableGroupBy<T> {
  /** Rows with equal non-null keys group; null never groups. */
  key: (row: T) => string | null;
  /** Content of the group's toggle button, given the group's rows in current sort order. */
  renderHeader: (rows: readonly T[]) => ReactNode;
  /** Initial expansion per group; default collapsed. */
  defaultExpanded?: (rows: readonly T[]) => boolean;
}

interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  /**
   * Must be unique across `rows` — React reconciles on it, and duplicates
   * leave rows from a previous render stranded in the table. `index` is
   * there for rows that carry no identity of their own: a public contract
   * lists the same blueprint once per copy, so 70% of BPC Search's rows
   * collided on every field it has.
   */
  rowKey: (row: T, index: number) => string | number;
  /**
   * Row-level classes. Not for dimming a row's own text below AA (issue
   * #1491) — a stale/lapsed row keeps full-contrast text and carries a
   * non-color cue instead (Contracts' status icon + tooltip).
   */
  rowClassName?: (row: T) => string | undefined;
  /**
   * The row a notification pointed at (`lib/useHighlightParam`): scrolled into
   * view once and pulsed, so the reader arrives on it rather than scanning for
   * it.
   *
   * Handled here rather than by each panel because this component already owns
   * `rowKey` and the DOM the row lives in — every caller would otherwise repeat
   * the same ref, `querySelector` and reduced-motion check. A key matching no
   * row does nothing, which is the ordinary case for a link that outlived the
   * data it pointed at.
   */
  highlightRowKey?: string | number | null;
  /**
   * Marks one row as the persistent current selection — e.g. the offer the
   * LP Store's detail panel is showing. `aria-current="true"` on that row's
   * `<tr>`, so the selection reads in text/AT rather than only through
   * `rowClassName`'s background tint (DESIGN.md §7). Distinct from
   * `highlightRowKey`'s one-shot `"location"`: that one is a deep link the
   * reader arrives on and moves past, this one persists as long as the row
   * stays selected.
   *
   * Not meant to name the same row as `highlightRowKey` at once: the latter
   * writes `aria-current` imperatively (`useScrollToRowKey`), which would
   * fight this prop's declarative value on that row. No current caller
   * passes both for the same key.
   */
  selectedRowKey?: string | number | null;
  /** Accessible name for the table. */
  label: string;
  className?: string;
  /** Column and direction to sort by before any header click. Column must declare `sortValue`. */
  defaultSort?: DataTableSort;
  /**
   * Controlled sort, for a table whose sort lives somewhere else — typically
   * the URL (`lib/useUrlState`'s `useUrlSort`). Passing it (even `null`)
   * makes `defaultSort` inert; every header click and phone-picker change
   * goes to `onSortChange` instead of internal state. Omitted, the table
   * keeps its own sort as it always has.
   */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  /** `'compact'` tightens header and cell padding on both axes. Table-level, not per-column — a table is compact as a whole. */
  density?: 'default' | 'compact';
  /**
   * Wraps a row's `<tr>` — e.g. a right-click menu. When set, the `<tr>`
   * gets `tabIndex={0}` so a keyboard user can focus it and open the menu
   * with Shift+F10 / the Menu key, the same way `ContextMenu.test.tsx`
   * drives a focused trigger.
   */
  rowContextMenu?: (row: T, tr: ReactElement) => ReactElement;
  /**
   * Appends a trailing cell holding a visible "More actions" button that
   * opens the same items as `rowContextMenu` (WCAG 2.1.1) — the row itself
   * is only reachable by Shift+F10 on a focused row, which few keyboard
   * users know. Needs a `rowContextMenu` whose wrapper publishes its items
   * (`RowActionsMenu`, e.g. via `ItemContextMenu`); the cell stays empty
   * otherwise.
   */
  rowMoreActions?: boolean;
  /**
   * Makes the whole row a click target — e.g. re-anchoring the page on the
   * row's item, rather than requiring a click on one specific cell. Also
   * gets `tabIndex={0}` and responds to Enter/Space, same focus treatment as
   * `rowContextMenu`.
   */
  onRowClick?: (row: T) => void;
  /**
   * Adds a per-row disclosure: clicking a row opens `renderDetail`'s content
   * in a full-width row beneath it. Independent of `onRowClick` — both fire
   * on the same click when both are given, though no caller currently
   * combines them. See `DataTableExpandableRow`.
   */
  expandableRow?: DataTableExpandableRow<T>;
  /**
   * How the table behaves below `sm`. `'stack'` (the default) collapses each
   * row into a labelled card — see `.dt-stack` in `src/styles/index.css`.
   * `'table'` keeps real columns, and is only right for a table narrow enough
   * to fit a 390px screen unaided — roughly two short columns.
   */
  responsive?: 'stack' | 'table';
  /**
   * How many values sit side by side inside one stacked card. `1` (the
   * default) gives each field its own line with the label in a left gutter —
   * right whenever a value can be long (a station name, an item name).
   * `2` pairs them up with the label above the value, for a card of short
   * figures where one-per-line would leave half the screen empty. Ignored
   * unless `responsive` is `'stack'`.
   */
  stackColumns?: 1 | 2;
  /**
   * `'labelled'` (the default) is the card above: one labelled field per
   * line. `'dense'` is a two-line card for a long list a reader *scans*
   * rather than reads — title and `cardCorner` figure on line one, every
   * other value inline on line two, unlabelled (`stackAffix` supplies the
   * words), so a phone shows three times the rows. Only matters when
   * `responsive` is `'stack'`; `stackColumns` is ignored when dense.
   */
  stackLayout?: 'labelled' | 'dense';
  /**
   * A phone-only (below `sm`) sort picker above the table. The stacked card
   * hides the header row, and with it every sort button — so a sortable
   * table is unsortable on a phone without this. Drives the same sort state
   * the header buttons do. Renders nothing if no column declares
   * `sortValue`.
   */
  mobileSort?: boolean;
  /** Phone-only text left of the sort picker (e.g. "214 offers"). Only rendered with `mobileSort`. */
  stackSummary?: ReactNode;
  /**
   * Phone-only grouping of equal-keyed rows behind a toggle row — see
   * `DataTableGroupBy`. Never applied at `sm` and up, where the rows have the
   * width to sit side by side and a reader compares them column-wise.
   */
  groupBy?: DataTableGroupBy<T>;
  /**
   * Mounts only the rows near the viewport (TanStack Virtual, windowed
   * against the page the way `NotificationsPanel` is), so a list of tens of
   * thousands — a region-wide public contract snapshot — costs what a
   * screenful does. Every row stays reachable by scrolling; sorting still
   * runs over the whole set first. Unmounted rows are stood in for by two
   * `aria-hidden` spacer rows, so column widths stay the table's own.
   *
   * Phone `groupBy` renders unwindowed: collapsed groups mount nothing, and
   * the toggle rows would need their own measuring. `highlightRowKey` and
   * `expandableRow` are unsupported alongside it — both assume the row they
   * target is in the DOM.
   */
  virtualize?: boolean;
}

const SORT_ARROW = { asc: '↑', desc: '↓' } as const;

/** `<select>` value for a sort; split on the *last* `:` so a column id may contain one. */
function sortOptionValue(sort: DataTableSort): string {
  return `${sort.columnId}:${sort.direction}`;
}

function parseSortOptionValue(value: string): DataTableSort | null {
  const at = value.lastIndexOf(':');
  if (at < 0) return null;
  const direction = value.slice(at + 1);
  if (direction !== 'asc' && direction !== 'desc') return null;
  return { columnId: value.slice(0, at), direction };
}

/**
 * Dense table. Headers and cell content arrive already translated — no i18n
 * here. No empty branch — callers show `EmptyState` instead (docs/DESIGN.md
 * §4, "Never show a bare empty table"). Sorting is opt-in per column via
 * `sortValue`: a table that declares none behaves exactly as before.
 *
 * Below `sm` the rows collapse into labelled cards (`responsive`), which is
 * pure CSS — the markup below is what every width renders. Because that CSS
 * makes the elements `display: block`, which strips their implicit ARIA
 * roles, each one states its table role explicitly.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  highlightRowKey = null,
  selectedRowKey = null,
  label,
  className = '',
  defaultSort,
  sort: controlledSort,
  onSortChange,
  density = 'default',
  rowContextMenu,
  rowMoreActions = false,
  onRowClick,
  expandableRow,
  responsive = 'stack',
  stackColumns = 1,
  stackLayout = 'labelled',
  mobileSort = false,
  stackSummary,
  groupBy,
  virtualize = false,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [internalSort, setInternalSort] = useState<DataTableSort | null>(defaultSort ?? null);
  const sort = controlledSort !== undefined ? controlledSort : internalSort;
  function setSort(next: DataTableSort) {
    if (controlledSort === undefined) setInternalSort(next);
    onSortChange?.(next);
  }
  // Only what the reader has toggled; an untouched group falls back to
  // `groupBy.defaultExpanded`, so a group that first appears on a later
  // refresh still gets its intended initial state.
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({});
  // At most one row open at a time (see `DataTableExpandableRow`) — a single
  // key, not a set.
  const [expandedRowKey, setExpandedRowKey] = useState<string | number | null>(null);
  const isPhone = useIsPhone();
  const tableRef = useRef<HTMLTableElement>(null);
  const dense = responsive === 'stack' && stackLayout === 'dense';

  useScrollToRowKey(tableRef, highlightRowKey, rows);

  const headerPadding = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
  const cellPadding = density === 'compact' ? 'px-2 py-1' : 'px-3 py-1.5';

  // Per-column classes are invariant across rows, so they are built once
  // rather than per cell — a 1,000-row journal is 5,000 cells.
  // A plain header carries these on the `<th>`; a sortable one moves them
  // onto its button (the `<th>` goes padding-free) so the whole cell is the
  // click target.
  const headerTextClass = columns.map((column) =>
    cx(
      headerPadding,
      'font-semibold uppercase',
      column.align === 'right' && 'text-right',
      column.align === 'center' && 'text-center',
      column.headerClassName
    )
  );
  // Which cell titles the card once the rows stack. Marked on every row's
  // cell rather than positionally, so `.dt-stack` can hoist it out of column
  // order without the markup differing by width.
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.primary)
  );
  const cardCornerIndex = columns.findIndex((column) => column.cardCorner);
  // The dense card's second line: every cell that is neither title nor
  // corner. The first gets no leading separator. Only computed (and only
  // marked in the DOM) when dense, so no other table's markup changes.
  const firstMetaIndex = dense
    ? columns.findIndex((_, i) => i !== primaryIndex && i !== cardCornerIndex)
    : -1;
  // A right-aligned sortable header's own sort glyph (`gap-1` + an icon) sits
  // between the label and the header's right inset, pushing the label ~1rem
  // further left than a plain right-aligned cell below it — same horizontal
  // padding otherwise, on both header and cell. Nudging just these cells'
  // right padding by that same amount brings the numbers back under the
  // label a reader's eye actually lands on, not under the icon.
  const sortIconGutter = density === 'compact' ? 'pr-6' : 'pr-7';
  // A centered column gets no such gutter. Its sortable header is off by only
  // half a glyph (label and icon are centred as one group), and correcting it
  // would misalign a sortable centered column against a non-sortable one
  // beside it — which no gutter can fix, since there is no icon to correct
  // for. Two adjacent columns disagreeing reads worse than 8px.
  const cellClass = columns.map((column) =>
    cx(
      cellPadding,
      column.align === 'right' && 'text-right',
      column.align === 'right' && column.sortValue && sortIconGutter,
      column.align === 'center' && 'text-center',
      column.stickyStart && `${STICKY_START} ${STICKY_START_CELL}`,
      column.className
    )
  );

  const sortColumn = sort ? columns.find((column) => column.id === sort.columnId) : undefined;
  const activeSortId = sortColumn?.sortValue ? sortColumn.id : undefined;
  const sortedRows = useMemo(() => {
    if (!sort || !sortColumn?.sortValue) return rows;
    return sortRows(rows, sortColumn, sort.direction);
  }, [rows, sort, sortColumn]);

  const grouping = groupBy !== undefined && isPhone;
  // Grouped over (row, index) pairs so `rowKey` still gets each row's index
  // in sort order, exactly as the ungrouped table passes it.
  const groups = useMemo(() => {
    if (!grouping) return null;
    return groupSortedRows(
      sortedRows.map((row, index) => ({ row, index })),
      (entry) => groupBy.key(entry.row)
    );
  }, [grouping, groupBy, sortedRows]);

  const windowed = virtualize && !grouping;
  // Rough per-layout heights; each mounted row is then measured, so these
  // only have to be close enough to size the rows not yet seen.
  const estimatedRowHeight =
    !isPhone || responsive === 'table'
      ? density === 'compact'
        ? 25
        : 29
      : dense
        ? 52
        : 16 + (stackColumns === 2 ? Math.ceil(columns.length / 2) * 36 : columns.length * 20);
  // Where the body starts on the page: the virtualizer's positions are
  // measured from the top of the document, not this table. A callback ref
  // plus a body-resize observer, as `NotificationsPanel` does, since
  // whatever sits above the table (filters, a banner) can change height
  // after mount. `getBoundingClientRect` rather than `offsetTop`, which is
  // relative to the nearest positioned ancestor, not the document.
  const [bodyElement, setBodyElement] = useState<HTMLTableSectionElement | null>(null);
  const bodyRef = useCallback((node: HTMLTableSectionElement | null) => setBodyElement(node), []);
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    if (!windowed || !bodyElement) return;
    const measure = () => setScrollMargin(bodyElement.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [windowed, bodyElement]);
  // Stable across scroll renders: TanStack Virtual rebuilds every row's
  // position whenever this function's identity changes, which on a
  // six-figure snapshot is the whole cost windowing exists to avoid.
  const getItemKey = useCallback(
    (index: number) => rowKey(sortedRows[index], index),
    [rowKey, sortedRows]
  );
  const rowVirtualizer = useWindowVirtualizer({
    count: windowed ? sortedRows.length : 0,
    enabled: windowed,
    estimateSize: () => estimatedRowHeight,
    getItemKey,
    // A laid-out row never measures 0 — only jsdom (no layout) or a hidden
    // container reports that — so 0 keeps the estimate instead of collapsing
    // every row and mounting the whole list.
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) || estimatedRowHeight,
    scrollMargin,
    overscan: 10,
  });
  // Crossing `sm` swaps table rows for cards of a different height; drop
  // the sizes measured under the old layout (TanStack Virtual's documented
  // reset, as `NotificationsPanel` does on its own breakpoint).
  // Guarded: `measure()` re-renders, and every non-windowed table would pay
  // for that on mount.
  useEffect(() => {
    if (windowed) rowVirtualizer.measure();
  }, [isPhone, windowed, rowVirtualizer]);

  function toggleSort(column: DataTableColumn<T>) {
    setSort(nextDataTableSort(sort, column.id));
  }

  // Cells after the caller's columns: the disclosure chevron and the More
  // actions button. Full-width rows span them too.
  const trailingColumns = (expandableRow ? 1 : 0) + (rowMoreActions ? 1 : 0);

  function renderRow(row: T, index: number, member = false, windowIndex?: number) {
    const key = rowKey(row, index);
    const expanded = expandableRow !== undefined && expandedRowKey === key;
    const focusable = Boolean(rowContextMenu) || Boolean(onRowClick) || expandableRow !== undefined;
    const activate = () => {
      onRowClick?.(row);
      if (expandableRow) setExpandedRowKey((current) => (current === key ? null : key));
    };
    const tr = (
      <tr
        role="row"
        // The row's own identity, in the DOM. One static attribute, and
        // the only way a caller can find a specific row to scroll to
        // without this component growing a ref API — `TransactionsPanel`
        // uses it to land on the fill a notification pointed at.
        data-row-key={key}
        data-index={windowIndex}
        // Header row is 1; tells AT where this row sits in the whole set.
        aria-rowindex={windowIndex === undefined ? undefined : windowIndex + 2}
        ref={windowIndex === undefined ? undefined : rowVirtualizer.measureElement}
        aria-expanded={expandableRow ? expanded : undefined}
        aria-current={selectedRowKey !== null && key === selectedRowKey ? 'true' : undefined}
        className={cx(
          'hover:bg-panel-2',
          member && 'dt-group-member',
          (onRowClick || expandableRow) && 'cursor-pointer',
          focusable &&
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          key === highlightRowKey && 'row-pulse',
          rowClassName?.(row)
        )}
        tabIndex={focusable ? 0 : undefined}
        onClick={
          onRowClick || expandableRow
            ? (event) => {
                if (isRowOwnEvent(event)) activate();
              }
            : undefined
        }
        onKeyDown={
          onRowClick || expandableRow
            ? (event) => {
                // Only the row's own keys: a focused control inside it (a
                // tooltip trigger, a button, a checkbox) keeps its Enter/Space
                // to itself.
                if (event.target !== event.currentTarget) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate();
              }
            : undefined
        }
      >
        {columns.map((column, i) => {
          const meta = dense && i !== primaryIndex && i !== cardCornerIndex;
          return (
            <td
              key={column.id}
              role="cell"
              // Printed as the cell's label in the stacked layout. Set
              // unconditionally: it costs one static attribute and keeps
              // the markup width-independent.
              data-label={column.header}
              data-stack-before={column.stackAffix?.before}
              data-stack-after={column.stackAffix?.after}
              className={cx(
                cellClass[i],
                i === primaryIndex && 'dt-primary',
                i === cardCornerIndex && 'dt-corner',
                meta && 'dt-meta',
                meta && i === firstMetaIndex && 'dt-meta-first',
                // Inert at every width except the dense card, which has no
                // header row to show the sort on and bolds the value instead.
                column.id === activeSortId && 'dt-sorted',
                column.cellClassName?.(row)
              )}
            >
              {column.render(row)}
            </td>
          );
        })}
        {expandableRow &&
          (() => {
            const Chevron = expanded ? Icon.Expanded : Icon.Descend;
            return (
              <td role="cell" aria-hidden="true" className={cx(cellPadding, 'w-0')}>
                <Chevron size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
              </td>
            );
          })()}
        {rowMoreActions && (
          <td
            role="cell"
            // No vertical padding: the button is already taller than a line
            // of text, and would otherwise stretch every row it sits in.
            className={cx(
              density === 'compact' ? 'px-1' : 'px-2',
              'dt-actions w-0 py-0 text-right'
            )}
          >
            <RowMoreActions />
          </td>
        )}
      </tr>
    );
    const mainRow = rowContextMenu ? rowContextMenu(row, tr) : tr;
    if (!expandableRow) return <Fragment key={key}>{mainRow}</Fragment>;
    return (
      <Fragment key={key}>
        {mainRow}
        {expanded && (
          <tr role="row" className="dt-row-detail">
            <td
              role="cell"
              colSpan={columns.length + trailingColumns}
              className="bg-panel-2 px-3 py-3"
            >
              {expandableRow.renderDetail(row)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  function renderWindow() {
    const items = rowVirtualizer.getVirtualItems();
    const first = items[0];
    const last = items[items.length - 1];
    // `start`/`end` include `scrollMargin`; the total size does not.
    const before = first ? first.start - rowVirtualizer.options.scrollMargin : 0;
    const after = last
      ? rowVirtualizer.getTotalSize() - (last.end - rowVirtualizer.options.scrollMargin)
      : 0;
    const spacer = (height: number, id: string) =>
      height > 0 && (
        <tr key={id} aria-hidden="true" className="dt-spacer" style={{ height }}>
          <td colSpan={columns.length + trailingColumns} className="p-0" />
        </tr>
      );
    return (
      <>
        {spacer(before, 'dt-spacer-before')}
        {items.map((item) => renderRow(sortedRows[item.index], item.index, false, item.index))}
        {spacer(after, 'dt-spacer-after')}
      </>
    );
  }

  const sortableColumns = columns.filter((column) => column.sortValue !== undefined);
  const sortBar = mobileSort && sortableColumns.length > 0 && (
    <div className="flex min-h-[52px] items-center justify-between gap-3 px-3 sm:hidden">
      {stackSummary !== undefined && (
        <span className="min-w-0 text-[0.6875rem] text-text-dim">{stackSummary}</span>
      )}
      {/* A real `<select>` laid invisibly over its own label rather than
          `Select`/`NativeSelect`: a phone should get the OS picker, and the
          closed control reads "Sort: Price ↑" while each option is just
          "Price ↑" — a native select can only show its option's text. */}
      <label
        className={cx(
          fieldBaseClassName,
          'relative ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-xs focus-within:outline-2 focus-within:outline-accent'
        )}
      >
        <Icon.Sort aria-hidden="true" size={Icon.ICON_SIZE.sm} className="text-text-dim" />
        <span aria-hidden="true">
          {sortColumn?.sortValue && sort
            ? t('common.dataTable.sortLabel', {
                column: sortColumn.header,
                arrow: SORT_ARROW[sort.direction],
              })
            : t('common.dataTable.sortNone')}
        </span>
        <select
          aria-label={t('common.dataTable.sortBy')}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
          value={sort && activeSortId ? sortOptionValue(sort) : ''}
          onChange={(event) => {
            const next = parseSortOptionValue(event.target.value);
            if (next) setSort(next);
          }}
        >
          {/* Matches `value=""` before any sort; never re-selectable. */}
          <option value="" disabled>
            {t('common.dataTable.sortNone')}
          </option>
          {sortableColumns.flatMap((column) =>
            (['asc', 'desc'] as const).map((direction) => (
              <option
                key={`${column.id}:${direction}`}
                value={sortOptionValue({ columnId: column.id, direction })}
              >
                {t('common.dataTable.sortOption', {
                  column: column.header,
                  arrow: SORT_ARROW[direction],
                })}
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );

  const table = (
    <table
      ref={tableRef}
      role="table"
      aria-label={label}
      // With most rows unmounted, AT would otherwise count only the window.
      aria-rowcount={windowed ? sortedRows.length + 1 : undefined}
      className={cx(
        'w-full text-xs',
        responsive === 'stack' && 'dt-stack',
        responsive === 'stack' && !dense && stackColumns === 2 && 'dt-stack-2col',
        dense && 'dt-stack-dense',
        className
      )}
    >
      <thead role="rowgroup">
        <tr role="row" className="border-b border-line text-left text-text-dim">
          {columns.map((column, i) => {
            const sortable = column.sortValue !== undefined;
            const active = sortable && sort?.columnId === column.id;
            const direction = active ? sort.direction : undefined;
            // Unsorted columns get the neutral up/down glyph, so a sortable
            // column advertises itself before anyone clicks it.
            const SortGlyph = !active
              ? Icon.Sort
              : direction === 'asc'
                ? Icon.Ascending
                : Icon.Descending;
            // Its own `<button>`, beside the sort button rather than inside
            // it (nested buttons are invalid HTML).
            const info = column.headerTooltip && (
              <InfoTooltip
                label={t('common.aboutLabel', { label: column.header })}
                content={column.headerTooltip}
                className={cx('normal-case', sortable && (density === 'compact' ? 'mr-2' : 'mr-3'))}
              />
            );
            return (
              <th
                key={column.id}
                role="columnheader"
                scope="col"
                className={cx(
                  sortable ? 'p-0' : headerTextClass[i],
                  column.stickyStart && STICKY_START
                )}
                aria-sort={
                  sortable
                    ? active
                      ? direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
              >
                {sortable ? (
                  <span className="flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cx(
                        headerTextClass[i],
                        'inline-flex flex-1 items-center gap-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                        column.align === 'right' && 'justify-end',
                        column.align === 'center' && 'justify-center'
                      )}
                    >
                      {column.header}
                      <SortGlyph
                        aria-hidden="true"
                        size={Icon.ICON_SIZE.sm}
                        className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
                      />
                    </button>
                    {info}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    {info}
                  </span>
                )}
              </th>
            );
          })}
          {expandableRow && (
            <th role="columnheader" scope="col" aria-hidden="true" className="w-0 p-0" />
          )}
          {rowMoreActions && (
            <th role="columnheader" scope="col" className="w-0 p-0">
              <span className="sr-only">{t('common.dataTable.actionsHeader')}</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody ref={bodyRef} role="rowgroup" className="divide-y divide-line">
        {groups
          ? groups.map((group) => {
              const first = group.rows[0];
              if (group.key === null || group.rows.length < 2 || !first) {
                return group.rows.map((entry) => renderRow(entry.row, entry.index));
              }
              const key = group.key;
              const memberRows = group.rows.map((entry) => entry.row);
              const expanded =
                groupExpanded[key] ?? groupBy?.defaultExpanded?.(memberRows) ?? false;
              const Chevron = expanded ? Icon.Expanded : Icon.Descend;
              return (
                <Fragment key={`dt-group:${key}`}>
                  <tr role="row" className="dt-group-header hover:bg-panel-2">
                    <td role="cell" colSpan={columns.length + trailingColumns} className="p-0">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        // Written from the *effective* state, not the stored
                        // one: a default-expanded group has no stored entry,
                        // and negating `undefined` would take two taps.
                        onClick={() =>
                          setGroupExpanded((previous) => ({ ...previous, [key]: !expanded }))
                        }
                        className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <span className="min-w-0 flex-1">{groupBy?.renderHeader(memberRows)}</span>
                        <Chevron
                          aria-hidden="true"
                          size={Icon.ICON_SIZE.sm}
                          className="shrink-0 text-text-dim"
                        />
                      </button>
                    </td>
                  </tr>
                  {expanded && group.rows.map((entry) => renderRow(entry.row, entry.index, true))}
                </Fragment>
              );
            })
          : windowed
            ? renderWindow()
            : sortedRows.map((row, index) => renderRow(row, index))}
      </tbody>
    </table>
  );

  // No wrapper element either way, so `className` and every caller's layout
  // (a flex/grid parent sizing the table) see the same `<table>` child.
  return sortBar ? (
    <>
      {sortBar}
      {table}
    </>
  ) : (
    table
  );
}

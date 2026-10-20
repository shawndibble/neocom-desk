import {
  Fragment,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { cx } from '@/lib/cx';
import { rootFontScale } from '@/lib/fontScale';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { useIsPhone } from '@/lib/useIsPhone';
import { groupSortedRows } from './dataTableGroup';
import { nextDataTableSort, sortRowsBy } from './dataTableSort';
import { DataTableRow } from './DataTableRow';
import { DataTableHeader } from './DataTableHeader';
import { DataTableGroupHeader } from './DataTableGroupHeader';
import { DataTableSortBar } from './DataTableSortBar';
import { stickyStartClass } from './dataTableSticky';
import { useDataTableVirtualizer } from './useDataTableVirtualizer';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from './ContextMenu';
import { ExportTableItems, TableExportProvider } from './TableExport';
import {
  type DataTableExportHandle,
  type TableExport,
  type TableExportConfig,
} from './useTableExport';

import { DataTableSortPicker } from './DataTableSortPicker';
export { DataTableSortPicker };

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

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
   * Classes for the `<th>` element itself, sortable column or not —
   * `headerClassName` moves onto a sortable column's button, where a width
   * does not size the column. For a `table-fixed` table whose column widths
   * have to match another table's (Materials' per-section tables).
   */
  headerCellClassName?: string;
  /**
   * Pins the column at the left edge while the rest scroll sideways under it
   * (a table that overflows its wrapper, e.g. `responsive="table"` on a
   * phone), so row labels stay on screen. Below `md` it also gets a right
   * border marking the scroll edge and shrinks to ~120px; where the table
   * fits, it's a visual no-op. Only for the first column.
   */
  stickyStart?: boolean;
  /**
   * With `stickyStart`: paint the pinned cell on the panel surface instead of
   * the page background, for a table inside a `Panel` body. Default unchanged.
   */
  stickyStartOnPanel?: boolean;
  /**
   * One-line plain-language note on what the column's values *are*, shown as
   * a small info control beside the header text — e.g. that a ledger date is
   * an EVE/UTC calendar day, not a local one. Only for a genuine ambiguity a
   * reader could get wrong; most columns explain themselves.
   */
  headerTooltip?: string;
  /**
   * Drops the column below `sm` (CSS `max-sm:hidden` on its header and cells)
   * when the table renders as a table: `responsive="table"`, or `stacked`
   * false. A read-only display table that is a few columns too wide for a
   * phone sheds its low-value columns this way instead of stacking into
   * cards. Ignored in the stacked card layout, where every cell is a labelled
   * row. The column still sorts and exports.
   *
   * Only for a table with no Columns menu: a pilot can't tick back a column
   * that has no control to point at. A table with a Columns menu does not set
   * this; it lists the columns that start unticked on a phone in
   * `useColumnVisibility`'s `phoneOffByDefault`, so the menu stays truthful.
   */
  phoneHidden?: boolean;
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
   * `'start'` pins it to the top-*left* corner instead — for a row-selection
   * checkbox, which reads as the card's own leading control rather than a
   * value about it. Only meaningful in the labelled stack (`stackLayout`
   * `"labelled"`, the default): the dense stack always renders the corner in
   * flow, right of the title, regardless of this value.
   *
   * In the dense stack (`stackLayout="dense"`) the corner is not decorative
   * but the card's headline figure: it sits *in flow* on the title line,
   * right of the primary cell, bold and unwrapped — a courier offer's
   * ISK/jump, the number a reader scans the list by.
   */
  cardCorner?: boolean | 'start';
  /**
   * Pins this cell to the stacked card's top-right corner, same spot as
   * `cardCorner` — but for a real control (a "More actions" button built
   * from a custom render rather than the table's own `rowMoreActions` column,
   * because the row needs per-row props `rowMoreActions` can't take), not a
   * decorative one. Reuses `rowMoreActions`'s own `dt-actions` CSS rather
   * than `cardCorner`'s `dt-corner` — the button keeps its 44px touch target
   * and the title-collision padding that CSS carries, which `dt-corner`
   * doesn't. Exactly one of `cardCorner`/`cardActions` per table; at most one
   * `cardActions` column, later ones ignored.
   */
  cardActions?: boolean;
  /**
   * Dense stack only: text printed around this cell's value on the card's
   * meta line, e.g. `{ before: 'Qty ' }` or `{ after: ' reward' }`. The dense
   * card drops column headers, so a bare "12" or "4.2M" needs a word to say
   * what it is. Already translated, like `header`. Emitted as
   * `data-stack-before`/`data-stack-after` and printed by CSS, so the cell's
   * own content — and the table at `sm` and up — is untouched.
   */
  stackAffix?: { before?: string; after?: string };
  /**
   * Dense stack only: pins a control cell to the card's left (`'start'`) or
   * right (`'end'`) edge instead of printing it as one more `·` value on the
   * 11px meta line, where a control is neither tappable nor readable. A
   * `start` cell (a row-selection checkbox) is centred across both lines; an
   * `end` cell (Hauling's Bring box) closes the second line at its right end,
   * leaving the title line its full width. A `below` cell takes a third line
   * of its own under the meta line, for a value and its control that would
   * crowd line two (Thera's signature pair and Copy button). At most one
   * column per edge; elsewhere (the labelled stack, the table) it is an
   * ordinary cell.
   */
  stackEdge?: 'start' | 'end' | 'below';
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
  /**
   * Hides the chevron that otherwise marks a row as expandable — the row
   * still opens on click, this only drops the visual affordance for a table
   * whose caller has another cue for it (Hauling: the whole row reads as a
   * disclosure already).
   */
  hideIcon?: boolean;
  /**
   * Draws the §6c expand-in-place cue instead: a leading rotating caret in
   * the first cell, hidden in the stacked card layout (the card is the tap
   * target). Implies `hideIcon`'s trailing chevron being dropped, so a row
   * with a ⋮ keeps one trailing control.
   */
  leadingIcon?: boolean;
}

/**
 * Row grouping (`DataTable`'s `groupBy`): rows sharing a key fold behind one
 * toggle row, so a list with many near-duplicates (ten courier offers on one
 * route) reads as one line per distinct thing. Phone-only unless `allWidths`.
 */
export interface DataTableGroupBy<T> {
  /** Rows with equal non-null keys group; null never groups. */
  key: (row: T) => string | null;
  /** Content of the group's toggle button, given the group's rows in current sort order. */
  renderHeader: (rows: readonly T[]) => ReactNode;
  /** Initial expansion per group; default collapsed. */
  defaultExpanded?: (rows: readonly T[]) => boolean;
  /**
   * Groups at every width, not only on a phone — for a fold that is part of
   * what the table says rather than a space saving (Route Safety's quiet
   * stretches of a route).
   */
  allWidths?: boolean;
  /**
   * Fewest rows a key needs before it folds; default 2, since one courier
   * offer behind a toggle saves nothing. 1 for a fold that names a section
   * rather than collapsing duplicates (the Mining Tax history's months),
   * where a month with one entry still reads as that month.
   */
  minSize?: number;
}

interface DataTableProps<T> {
  /** @summary Column definitions: header text, cell renderer and optional sort value. */
  columns: readonly DataTableColumn<T>[];
  /** @summary The data to show; one entry per table row. */
  rows: readonly T[];
  /**
   * @summary Stable unique key per row.
   *
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
   * `<tr>`, so the selection reads in text/AT, and the row wears
   * `selectedRowClassName` (accent left border, `panel-2` fill, accent
   * primary cell) itself — a caller no longer tints it (DESIGN.md §6c, §7). Distinct from
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
  /** @summary Accessible name for the table. */
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
   * Per-row opt-out of `onRowClick`: a row it returns false for is inert (no
   * pointer cursor, no tab stop, no Enter/Space) so it never looks clickable
   * while doing nothing. Omit when every row opens something.
   */
  rowClickable?: (row: T) => boolean;
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
   * `'table'` keeps real columns: right when comparing across columns is
   * the point (compare table, matrix, roster, wide numbers), interactive or
   * not: it scrolls sideways, with the key column pinned by `stickyStart`
   * (§6c Restraint). Cards are for rows read as a unit.
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
   * Whether the table shows as cards, in place of the viewport check (below
   * `sm`) every other table uses — for a table that knows its own width and
   * is narrower than its columns on a wide screen (Hauling's panel on a
   * tablet with the rail open). Cards still need `responsive="stack"`. The
   * caller's `max-sm:`/`sm:` cell classes keep following the viewport, so a
   * table that forces cards picks those in JS (ADR 0017).
   */
  stacked?: boolean;
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
  /** Phone-only controls right of the sort picker (e.g. a filter trigger). Only rendered with `mobileSort`. */
  stackActions?: ReactNode;
  /**
   * Grouping of equal-keyed rows behind a toggle row — see
   * `DataTableGroupBy`. Phone-only by default: at `sm` and up the rows have
   * the width to sit side by side and a reader compares them column-wise,
   * unless the group sets `allWidths`.
   */
  groupBy?: DataTableGroupBy<T>;
  /**
   * A row that is not a record but a note between records — Route Safety's
   * wormhole jump between two systems (issue #2476). Return its content to
   * draw the row as one cell across every column (and one unlabelled line on
   * a phone card); `null` draws the row as usual. Such a row never expands,
   * never activates `onRowClick`, and never goes through a column's `render`.
   * Not for a virtualized table: the row is not measured.
   */
  fullWidthRow?: (row: T) => ReactNode | null;
  /**
   * Mounts only the rows near the viewport (TanStack Virtual, windowed
   * against the page the way `NotificationsPanel` is), so a list of tens of
   * thousands — a region-wide public contract snapshot — costs what a
   * screenful does. Every row stays reachable by scrolling; sorting still
   * runs over the whole set first. Unmounted rows are stood in for by two
   * `aria-hidden` spacer rows, so column widths stay the table's own.
   *
   * `'auto'` windows only once the table holds more than
   * `VIRTUALIZE_THRESHOLD` rows — for a ledger that is usually a screenful
   * but can run to thousands (a wallet journal, a market history). A short
   * list keeps every row in the DOM, so find-in-page and a short fixture
   * behave exactly as an unvirtualized table.
   *
   * A windowed `highlightRowKey` is scrolled to through the virtualizer, so
   * the row mounts before it is focused and pulsed. Phone `groupBy` renders
   * unwindowed: collapsed groups mount nothing, and the toggle rows would
   * need their own measuring. An `expandableRow` detail is measured as part
   * of the row it opens beneath, so expanding one moves the rows below it
   * down rather than under it.
   */
  virtualize?: boolean | 'auto';
  /**
   * Hands the caller the rows in on-screen order — the table sorts
   * internally, so an export that wants to match what the reader sees reads
   * them through this rather than re-sorting its own copy. Usually spread
   * from `useTableExport(...).tableProps` (see `TableExport.tsx`).
   */
  exportRef?: Ref<DataTableExportHandle<T>>;
  /**
   * Makes the table exportable from its menus: every row menu
   * (`rowContextMenu`, and its "More actions" button) gains an "Export
   * table" submenu, and a table without row menus gets a table-wide
   * right-click menu holding just the export formats. Exports the rows as sorted on
   * screen. Usually spread from `useTableExport(...).tableProps` together
   * with `exportRef`, so the title bar's `TableActionsMenu` agrees.
   */
  exportable?: TableExportConfig<T>;
}

/**
 * Row count past which `virtualize="auto"` windows. Well above a screenful,
 * so a table that only occasionally runs long pays nothing the rest of the
 * time; well below where mounting every row starts to show (a few hundred
 * rows of several cells each).
 */
export const VIRTUALIZE_THRESHOLD = 150;

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
 *
 * @summary The dense, sortable table every list page uses; collapses to labelled cards on a phone.
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
  rowClickable,
  expandableRow,
  responsive = 'stack',
  stackColumns = 1,
  stackLayout = 'labelled',
  stacked,
  mobileSort = false,
  stackSummary,
  stackActions,
  groupBy,
  fullWidthRow,
  virtualize = false,
  exportRef,
  exportable,
}: DataTableProps<T>) {
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
  // Card width: the caller's say where it has one, else the viewport's. The
  // `.dt-stacked` rules (src/styles/index.css) key off the class this sets.
  const cardsWanted = stacked ?? isPhone;
  const isStacked = responsive === 'stack' && cardsWanted;
  const tableRef = useRef<HTMLTableElement>(null);
  const dense = responsive === 'stack' && stackLayout === 'dense';

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
  // cell rather than positionally, so `.dt-stacked` can hoist it out of column
  // order without the markup differing by width.
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.primary)
  );
  const cardCornerIndex = columns.findIndex((column) => column.cardCorner);
  const cardCornerStart = columns[cardCornerIndex]?.cardCorner === 'start';
  const cardActionsIndex = columns.findIndex((column) => column.cardActions);
  // The dense card's second line: every cell that is neither title, corner
  // nor edge-pinned. The first gets no leading separator. Only computed (and
  // only marked in the DOM) when dense, so no other table's markup changes.
  const firstMetaIndex = dense
    ? columns.findIndex(
        (column, i) =>
          !column.stackEdge && i !== primaryIndex && i !== cardCornerIndex && i !== cardActionsIndex
      )
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
  // Memoized, not just hoisted: it is a prop of every memoized row, and a
  // fresh array per render would re-render them all.
  const cellClass = useMemo(
    () =>
      columns.map((column) =>
        cx(
          cellPadding,
          column.align === 'right' && 'text-right',
          column.align === 'right' && column.sortValue && sortIconGutter,
          column.align === 'center' && 'text-center',
          column.stickyStart && `${stickyStartClass(column)} ${STICKY_START_CELL}`,
          column.className
        )
      ),
    [columns, cellPadding, sortIconGutter]
  );

  const sortColumn = sort ? columns.find((column) => column.id === sort.columnId) : undefined;
  const activeSortId = sortColumn?.sortValue ? sortColumn.id : undefined;
  // Keyed on the sort's fields and the one `sortValue` in play, not on the
  // `sort` object or the column object: `useUrlSort` re-parses a fresh
  // `sort` whenever the query string changes (every debounced filter write),
  // and a caller rebuilding a column around a memoized `sortValue` shouldn't
  // re-sort either. A column whose `sortValue` isn't stable still re-sorts
  // every render — callers memoize their columns for that.
  const sortDirection = sort?.direction;
  const sortValue = sort
    ? columns.find((column) => column.id === sort.columnId)?.sortValue
    : undefined;
  const sortedRows = useMemo(() => {
    if (!sortDirection || !sortValue) return rows;
    return sortRowsBy(rows, sortValue, sortDirection);
  }, [rows, sortDirection, sortValue]);
  useImperativeHandle(
    exportRef,
    () => ({
      getRows: () => sortedRows,
      sortRows: (all) =>
        sortDirection && sortValue ? sortRowsBy(all, sortValue, sortDirection) : all,
    }),
    [sortedRows, sortDirection, sortValue]
  );
  const tableExport = useMemo<TableExport<T> | null>(
    () =>
      exportable
        ? {
            ...exportable,
            getRows: exportable.getRows ?? (() => sortedRows),
          }
        : null,
    [exportable, sortedRows]
  );

  const grouping = groupBy !== undefined && (cardsWanted || groupBy.allWidths === true);
  // Grouped over (row, index) pairs so `rowKey` still gets each row's index
  // in sort order, exactly as the ungrouped table passes it.
  const groups = useMemo(() => {
    if (!grouping) return null;
    return groupSortedRows(
      sortedRows.map((row, index) => ({ row, index })),
      (entry) => groupBy.key(entry.row)
    );
  }, [grouping, groupBy, sortedRows]);

  const windowed =
    !grouping &&
    (virtualize === true || (virtualize === 'auto' && sortedRows.length > VIRTUALIZE_THRESHOLD));
  const expandable = expandableRow !== undefined;
  // Rough per-layout heights; each mounted row is then measured, so these
  // only have to be close enough to size the rows not yet seen.
  const estimatedRowHeight =
    rootFontScale() *
    (!isStacked
      ? density === 'compact'
        ? 25
        : 29
      : dense
        ? 52
        : 16 + (stackColumns === 2 ? Math.ceil(columns.length / 2) * 36 : columns.length * 20));
  const rowVirtualizerState = useDataTableVirtualizer({
    windowed,
    expandable,
    sortedRows,
    rows,
    rowKey,
    estimatedRowHeight,
    cardsWanted,
    expandedRowKey,
    highlightRowKey,
  });
  const { rowVirtualizer, bodyRef, remeasureRow, expandedIndex, scrollToRowTrigger } =
    rowVirtualizerState;
  useScrollToRowKey(tableRef, highlightRowKey, scrollToRowTrigger);

  function toggleSort(column: DataTableColumn<T>) {
    setSort(nextDataTableSort(sort, column.id));
  }

  // Cells after the caller's columns: the disclosure chevron and the More
  // actions button. Full-width rows span them too.
  const trailingColumns = (expandableRow ? 1 : 0) + (rowMoreActions ? 1 : 0);
  const rowIsClickable = (row: T) =>
    expandable || (Boolean(onRowClick) && (rowClickable ? rowClickable(row) : true));

  // Rows get one stable activator rather than `onRowClick` itself, which
  // callers pass inline — only ever called from a click or key handler, so
  // reading the latest value through a ref can't render anything stale.
  const onRowClickRef = useRef(onRowClick);
  const expandableRef = useRef(expandable);
  useLayoutEffect(() => {
    onRowClickRef.current = onRowClick;
    expandableRef.current = expandable;
  });
  const activateRow = useCallback((row: T, key: string | number) => {
    onRowClickRef.current?.(row);
    if (expandableRef.current) setExpandedRowKey((current) => (current === key ? null : key));
  }, []);

  function renderRow(row: T, index: number, member = false, windowIndex?: number) {
    const key = rowKey(row, index);
    const full = fullWidthRow?.(row);
    if (full !== undefined && full !== null) {
      return (
        <tr
          key={key}
          role="row"
          data-row-key={key}
          className={cx('dt-full-row', member && 'dt-group-member', rowClassName?.(row))}
        >
          <td role="cell" colSpan={columns.length + trailingColumns} className={cellPadding}>
            {full}
          </td>
        </tr>
      );
    }
    const expanded = expandable && expandedRowKey === key;
    return (
      <DataTableRow
        key={key}
        row={row}
        rowKeyValue={key}
        windowIndex={windowIndex}
        ariaRowIndex={
          windowIndex === undefined
            ? undefined
            : windowIndex + (expandedIndex >= 0 && windowIndex > expandedIndex ? 3 : 2)
        }
        member={member}
        columns={columns}
        cellClass={cellClass}
        primaryIndex={primaryIndex}
        cardCornerIndex={cardCornerIndex}
        cardCornerStart={cardCornerStart}
        cardActionsIndex={cardActionsIndex}
        firstMetaIndex={firstMetaIndex}
        dense={dense}
        isStacked={isStacked}
        activeSortId={activeSortId}
        highlighted={highlightRowKey !== null && key === highlightRowKey}
        selected={selectedRowKey !== null && key === selectedRowKey}
        expandable={expandable}
        expanded={expanded}
        hideExpandIcon={(expandableRow?.hideIcon ?? false) || (expandableRow?.leadingIcon ?? false)}
        leadingExpandIcon={expandableRow?.leadingIcon ?? false}
        renderDetail={expanded ? expandableRow?.renderDetail : undefined}
        clickable={rowIsClickable(row)}
        tapOpensRow={Boolean(onRowClick) && (rowClickable ? rowClickable(row) : true)}
        focusable={Boolean(rowContextMenu) || rowIsClickable(row)}
        onActivate={activateRow}
        rowClassName={rowClassName}
        rowContextMenu={rowContextMenu}
        rowMoreActions={rowMoreActions}
        cellPadding={cellPadding}
        compact={density === 'compact'}
        trailingColumns={trailingColumns}
        measureRef={windowIndex === undefined ? undefined : rowVirtualizer.measureElement}
        remeasure={windowIndex === undefined ? undefined : remeasureRow}
      />
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
    // One flat keyed array, the same shape the unwindowed body renders: a
    // table crossing `VIRTUALIZE_THRESHOLD` then keeps its mounted rows (and
    // their focus, an open menu) instead of remounting them under a fragment.
    return [
      spacer(before, 'dt-spacer-before'),
      ...items.map((item) => renderRow(sortedRows[item.index], item.index, false, item.index)),
      spacer(after, 'dt-spacer-after'),
    ];
  }

  const sortableColumns = columns.filter((column) => column.sortValue !== undefined);
  // Hidden by CSS above `sm` when the viewport decides; by JS when the caller does.
  // Only for a table that can stack: in table mode the header sort buttons are on screen.
  const sortBar = mobileSort &&
    sortableColumns.length > 0 &&
    responsive === 'stack' &&
    stacked !== false && (
      <DataTableSortBar
        sortableColumns={sortableColumns}
        sort={sort && activeSortId ? sort : undefined}
        onSortChange={setSort}
        summary={stackSummary}
        actions={stackActions}
        stacked={stacked}
      />
    );

  const table = (
    <table
      ref={tableRef}
      role="table"
      aria-label={label}
      // With most rows unmounted, AT would otherwise count only the window.
      // An open row's detail is a row too.
      aria-rowcount={windowed ? sortedRows.length + 1 + (expandedIndex >= 0 ? 1 : 0) : undefined}
      className={cx(
        'w-full text-xs',
        responsive === 'stack' && 'dt-stack',
        isStacked && 'dt-stacked',
        responsive === 'stack' && !dense && stackColumns === 2 && 'dt-stack-2col',
        dense && 'dt-stack-dense',
        className
      )}
    >
      <DataTableHeader
        columns={columns}
        headerTextClass={headerTextClass}
        sort={sort}
        density={density}
        isStacked={isStacked}
        expandable={expandable}
        rowMoreActions={rowMoreActions}
        onToggleSort={toggleSort}
      />
      <tbody
        ref={bodyRef}
        role="rowgroup"
        // Windowed and expandable, TanStack Virtual already moves the page
        // when a row above the viewport changes size (a far-off open row
        // closing), and the browser's scroll anchoring would move it a second
        // time for the spacer row shrinking with it. Only there: a
        // newest-first ledger relies on anchoring to hold the view steady
        // when a refresh adds rows above it, which TanStack doesn't correct.
        className={cx('divide-y divide-line', windowed && expandable && '[overflow-anchor:none]')}
      >
        {groups
          ? groups.map((group) => {
              const first = group.rows[0];
              if (group.key === null || group.rows.length < (groupBy?.minSize ?? 2) || !first) {
                return group.rows.map((entry) => renderRow(entry.row, entry.index));
              }
              const key = group.key;
              const memberRows = group.rows.map((entry) => entry.row);
              const expanded =
                groupExpanded[key] ?? groupBy?.defaultExpanded?.(memberRows) ?? false;
              return (
                <Fragment key={`dt-group:${key}`}>
                  <DataTableGroupHeader
                    colSpan={columns.length + trailingColumns}
                    expanded={expanded}
                    // Written from the *effective* state, not the stored
                    // one: a default-expanded group has no stored entry,
                    // and negating `undefined` would take two taps.
                    onToggle={() =>
                      setGroupExpanded((previous) => ({ ...previous, [key]: !expanded }))
                    }
                    allWidths={groupBy?.allWidths}
                  >
                    {groupBy?.renderHeader(memberRows)}
                  </DataTableGroupHeader>
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

  // Exportable: row menus grow the submenu through context; a table with no
  // row menus gets a right-click menu of its own holding just the export
  // formats (the trigger is `asChild`, so still no wrapper element).
  const body = !tableExport ? (
    table
  ) : rowContextMenu ? (
    <TableExportProvider tableExport={tableExport}>{table}</TableExportProvider>
  ) : (
    <ContextMenu>
      <ContextMenuTrigger asChild>{table}</ContextMenuTrigger>
      <ContextMenuContent>
        <ExportTableItems tableExport={tableExport} />
      </ContextMenuContent>
    </ContextMenu>
  );

  // No wrapper element either way, so `className` and every caller's layout
  // (a flex/grid parent sizing the table) see the same `<table>` child.
  return sortBar ? (
    <>
      {sortBar}
      {body}
    </>
  ) : (
    body
  );
}
